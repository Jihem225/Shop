-- ============================================================================
-- RELAXX — Supabase database
-- Run once in Supabase: SQL Editor → New query → paste this file → Run.
-- It can be run again safely (it replaces the functions and policies).
--
-- One table, rx_docs: every record of the shop is a JSON document stored under
-- (collection, key) — products, categories, orders, customers, reviews,
-- subscribers, promo codes, settings sections, staff, activity, visits, media.
--
-- Who can do what (row-level security):
--   visitors (anon)      no direct access to the table; they go through the
--                        rx_* functions below (public catalogue, order, review,
--                        newsletter, visit counter, promo code check)
--   staff (authenticated, listed in the "staff" collection by e-mail)
--                        read everything; write according to their role
--                        (same matrix as the back office)
-- ============================================================================

create table if not exists public.rx_docs (
  coll text not null,
  key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (coll, key)
);
create index if not exists rx_docs_updated_at on public.rx_docs (updated_at);

create sequence if not exists public.rx_order_seq start 10001;
create sequence if not exists public.rx_customer_seq start 1001;

-- updated_at follows every change (the back office polls for changes with it)
create or replace function public.rx_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists rx_docs_touch on public.rx_docs;
create trigger rx_docs_touch before insert or update on public.rx_docs for each row execute function public.rx_touch();

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.rx_now_ms() returns bigint language sql stable as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

create or replace function public.rx_money(n numeric) returns text language sql immutable as $$
  select replace(to_char(round(n), 'FM999,999,999,990'), ',', ' ') || ' FCFA'
$$;

-- role of the signed-in user: admin, manager, support or viewer (null = not staff)
create or replace function public.rx_role() returns text language sql stable security definer set search_path = public as $$
  select d.data->>'role'
  from public.rx_docs d
  where d.coll = 'staff'
    and d.key = lower(coalesce(auth.jwt()->>'email', ''))
    and coalesce((d.data->>'active')::boolean, true)
$$;

-- write access per role and collection (settings are split in sections)
create or replace function public.rx_can_write(p_coll text, p_key text) returns boolean language sql stable security definer set search_path = public as $$
  select case public.rx_role()
    when 'admin' then true
    when 'manager' then
      p_coll in ('products', 'categories', 'promos', 'subscribers', 'orders', 'customers', 'reviews', 'activity', 'media')
      or (p_coll = 'settings' and p_key in ('store', 'content', 'vitrine', 'instagram', 'sizeGuide', 'reviews'))
    when 'support' then
      p_coll in ('orders', 'customers', 'reviews', 'products', 'activity')
      or (p_coll = 'settings' and p_key = 'reviews')
    when 'viewer' then p_coll = 'activity'
    else false
  end
$$;

-- read access per role: the team reads the shop, except what its role has no section for in the back office
-- (promo codes and newsletter subscribers: administrator and manager; the team list: administrator, and one's own entry)
create or replace function public.rx_can_read(p_coll text, p_key text) returns boolean language sql stable security definer set search_path = public as $$
  select case public.rx_role()
    when 'admin' then true
    when 'manager' then p_coll <> 'staff' or p_key = lower(coalesce(auth.jwt()->>'email', ''))
    when 'support' then p_coll not in ('staff', 'promos', 'subscribers') or (p_coll = 'staff' and p_key = lower(coalesce(auth.jwt()->>'email', '')))
    when 'viewer' then p_coll not in ('staff', 'promos', 'subscribers') or (p_coll = 'staff' and p_key = lower(coalesce(auth.jwt()->>'email', '')))
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- row-level security: staff only
-- ---------------------------------------------------------------------------
alter table public.rx_docs enable row level security;

drop policy if exists rx_docs_read on public.rx_docs;
drop policy if exists rx_docs_insert on public.rx_docs;
drop policy if exists rx_docs_update on public.rx_docs;
drop policy if exists rx_docs_delete on public.rx_docs;
create policy rx_docs_read on public.rx_docs for select to authenticated using (public.rx_can_read(coll, key));
create policy rx_docs_insert on public.rx_docs for insert to authenticated with check (public.rx_can_write(coll, key));
create policy rx_docs_update on public.rx_docs for update to authenticated using (public.rx_can_write(coll, key)) with check (public.rx_can_write(coll, key));
create policy rx_docs_delete on public.rx_docs for delete to authenticated using (public.rx_can_write(coll, key));

revoke all on public.rx_docs from anon;
grant select, insert, update, delete on public.rx_docs to authenticated;
revoke all on sequence public.rx_order_seq, public.rx_customer_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- storefront: public catalogue (no purchase cost, no Instagram token, no private settings)
-- ---------------------------------------------------------------------------
create or replace function public.rx_public() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', coalesce((
      select jsonb_object_agg(key,
        case key
          when 'instagram' then data - 'token' - 'tokenAt' - 'tokenExp' - 'tokenTry' - 'lastError'
          when 'store' then data - 'monthlyGoal'
          else data end)
      from public.rx_docs where coll = 'settings' and key not in ('notifications')), '{}'::jsonb),
    'categories', coalesce((select jsonb_agg(data order by coalesce((data->>'order')::int, 0)) from public.rx_docs where coll = 'categories'), '[]'::jsonb),
    -- a product that is not on sale keeps its place in the list (the pages find a product by its position) but shows nothing
    'products', coalesce((select jsonb_agg(case when data->>'status' = 'active' then data - 'cost'
        else jsonb_build_object('id', data->'id', 'cat', data->'cat', 'status', data->'status', 'name', '', 'nameFr', '', 'price', 0, 'img', '', 'stock', '{}'::jsonb, 'colors', '[]'::jsonb) end
      order by (data->>'id')::int) from public.rx_docs where coll = 'products'), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('id', data->'id', 'pid', data->'pid', 'stars', data->'stars', 'title', data->'title', 'text', data->'text',
        'name', data->'name', 'city', data->'city', 'size', data->'size', 'fit', data->'fit', 'date', data->'date', 'status', data->'status',
        'reply', data->'reply', 'replyDate', data->'replyDate', 'lang', data->'lang') order by (data->>'date')::bigint desc)
      from public.rx_docs
      where coll = 'reviews' and data->>'status' = 'published' and coalesce(data->>'source', '') <> 'demo'), '[]'::jsonb),
    'time', public.rx_now_ms())
$$;

-- limits per connection for the public functions that have no form (promo code check, visit counter):
-- true while the connection stays under p_lim10 calls in 10 minutes and p_limday calls in a day.
-- Same counters as rx_guard_check below (salted hash of the address, kept 48 hours in rx_guard).
create or replace function public.rx_rate(p_action text, p_lim10 int, p_limday int) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_now bigint := public.rx_now_ms();
  v_hdr json; v_ip text; v_salt text; v_who text; v_n int;
begin
  delete from public.rx_guard where at < now() - interval '48 hours' and key not like 'salt:%';
  begin v_hdr := nullif(current_setting('request.headers', true), '')::json; exception when others then v_hdr := null; end;
  v_ip := coalesce(v_hdr->>'cf-connecting-ip', nullif(trim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), ''), v_hdr->>'x-real-ip', 'unknown');
  select (select key from public.rx_guard where key like 'salt:%' limit 1) into v_salt;
  if v_salt is null then v_salt := 'salt:' || gen_random_uuid(); insert into public.rx_guard (key, at) values (v_salt, now() + interval '100 years'); end if;
  v_who := encode(sha256(convert_to(v_salt || v_ip, 'UTF8')), 'hex');
  insert into public.rx_guard as r (key, n) values ('rl:' || p_action || ':' || v_who || ':' || (v_now / 600000), 1)
    on conflict (key) do update set n = r.n + 1 returning n into v_n;
  if v_n > p_lim10 then return false; end if;
  insert into public.rx_guard as r (key, n) values ('rd:' || p_action || ':' || v_who || ':' || (v_now / 86400000), 1)
    on conflict (key) do update set n = r.n + 1 returning n into v_n;
  return v_n <= p_limday;
end $$;

-- promo code rules, for one code only (the list of codes stays private); 20 tries in 10 minutes per connection
create or replace function public.rx_check_promo(p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p jsonb; v_now bigint := public.rx_now_ms();
begin
  if not public.rx_rate('promo', 20, 100) then return jsonb_build_object('ok', false, 'reason', 'rate'); end if;
  select data into p from public.rx_docs where coll = 'promos' and key = upper(trim(coalesce(p_code, '')));
  if p is null or not coalesce((p->>'active')::boolean, false) or coalesce((p->>'starts')::bigint, 0) > v_now then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if coalesce((p->>'ends')::bigint, 0) > 0 and (p->>'ends')::bigint < v_now then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if coalesce((p->>'limit')::int, 0) > 0 and coalesce((p->>'used')::int, 0) >= (p->>'limit')::int then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  return jsonb_build_object('ok', true, 'code', p->>'code', 'type', p->>'type', 'value', coalesce((p->>'value')::numeric, 0), 'minOrder', coalesce((p->>'minOrder')::numeric, 0));
end $$;


-- ---------------------------------------------------------------------------
-- anti-robot protection of the public forms (order, review, newsletter)
-- Checked here, in the database, for every sending:
--   1. honeypot: a hidden field that only robots fill in
--   2. time: a form sent too quickly after the page was shown is refused
--   3. proof of work: the browser computes, while the visitor types, a SHA-256 whose first 16 bits are 0
--      ("rx1:<action>:<time>:<random>:<nonce>"); each proof is valid 30 minutes and only once
--   4. limits per connection: the IP address is kept only as a salted hash, for 48 hours
-- rx_guard is private: no policy, no grant — only the functions below use it.
-- ---------------------------------------------------------------------------
create table if not exists public.rx_guard (
  key text primary key,
  n int not null default 0,
  at timestamptz not null default now()
);
create index if not exists rx_guard_at on public.rx_guard (at);
alter table public.rx_guard enable row level security;
revoke all on public.rx_guard from anon, authenticated;

create or replace function public.rx_guard_check(p_action text, g jsonb) returns text language plpgsql security definer set search_path = public as $$
declare
  v_now bigint := public.rx_now_ms();
  v_min_ms int := case p_action when 'order' then 4000 when 'review' then 3000 else 1500 end;
  v_lim10 int := case p_action when 'order' then 10 when 'review' then 6 else 10 end;
  v_limday int := case p_action when 'order' then 60 when 'review' then 20 else 40 end;
  v_hdr json; v_ip text; v_salt text; v_who text; v_ts bigint; v_rand text; v_h bytea; v_n int;
begin
  -- old entries go (proofs and counters are kept 48 hours at most)
  delete from public.rx_guard where at < now() - interval '48 hours' and key not like 'salt:%';
  if g is null or jsonb_typeof(g) <> 'object' then return 'bot'; end if;
  if coalesce(g->>'hp', '') <> '' then return 'bot'; end if;
  if coalesce((g->>'t0')::bigint, v_now) > v_now - v_min_ms then return 'bot'; end if;

  v_ts := (g#>>'{pow,ts}')::bigint;
  v_rand := coalesce(g#>>'{pow,rand}', '');
  if v_ts is null or v_ts < v_now - 1800000 or v_ts > v_now + 120000 or v_rand !~ '^[0-9a-f]{16}$' or coalesce(g#>>'{pow,nonce}', '') !~ '^\d{1,12}$' then return 'bot'; end if;
  v_h := sha256(convert_to('rx1:' || p_action || ':' || v_ts || ':' || v_rand || ':' || (g#>>'{pow,nonce}'), 'UTF8'));
  if get_byte(v_h, 0) <> 0 or get_byte(v_h, 1) <> 0 then return 'bot'; end if;
  insert into public.rx_guard (key) values ('pow:' || v_rand) on conflict (key) do nothing;
  if not found then return 'bot'; end if; -- proof already used

  -- limits per connection (salted hash of the address, never the address itself)
  begin v_hdr := nullif(current_setting('request.headers', true), '')::json; exception when others then v_hdr := null; end;
  v_ip := coalesce(v_hdr->>'cf-connecting-ip', nullif(trim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), ''), v_hdr->>'x-real-ip', 'unknown');
  select (select key from public.rx_guard where key like 'salt:%' limit 1) into v_salt;
  if v_salt is null then v_salt := 'salt:' || gen_random_uuid(); insert into public.rx_guard (key, at) values (v_salt, now() + interval '100 years'); end if;
  v_who := encode(sha256(convert_to(v_salt || v_ip, 'UTF8')), 'hex');
  insert into public.rx_guard as r (key, n) values ('rl:' || p_action || ':' || v_who || ':' || (v_now / 600000), 1)
    on conflict (key) do update set n = r.n + 1 returning n into v_n;
  if v_n > v_lim10 then return 'rate'; end if;
  insert into public.rx_guard as r (key, n) values ('rd:' || p_action || ':' || v_who || ':' || (v_now / 86400000), 1)
    on conflict (key) do update set n = r.n + 1 returning n into v_n;
  if v_n > v_limday then return 'rate'; end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- storefront: place an order
-- Everything is recomputed here from the database: prices, stock, promo code,
-- delivery, cash-on-delivery ceiling. The browser only says what was chosen.
-- Returns the order, or { error: "stock", lines: [...] } / { error: "<reason>" }.
-- ---------------------------------------------------------------------------
create or replace function public.rx_place_order(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_now bigint := public.rx_now_ms();
  sh jsonb; pm jsonb; prod jsonb; it jsonb; col jsonb; promo jsonb; cust jsonb; ord jsonb; line jsonb;
  items jsonb := '[]'::jsonb; bad jsonb := '[]'::jsonb; todo jsonb := '[]'::jsonb;
  v_first text; v_last text; v_email text; v_phone text; v_country text; v_city text; v_line text; v_zip text;
  v_ship_m text; v_pay text; v_op text := ''; v_code text; v_lang text;
  v_sizes text[]; v_size text; v_q int; v_avail int; v_sum int;
  v_sub numeric := 0; v_disc numeric := 0; v_ship numeric := 0; v_total numeric;
  v_cust_id text; v_order_id text; v_guard text;
begin
  v_first := left(trim(coalesce(p#>>'{customer,first}', '')), 60);
  v_last := left(trim(coalesce(p#>>'{customer,last}', '')), 60);
  v_email := lower(left(trim(coalesce(p#>>'{customer,email}', '')), 120));
  v_phone := left(trim(coalesce(p#>>'{customer,phone}', '')), 40);
  v_country := upper(left(trim(coalesce(p#>>'{address,country}', '')), 2));
  v_city := left(trim(coalesce(p#>>'{address,city}', '')), 80);
  v_line := left(trim(coalesce(p#>>'{address,line}', '')), 200);
  v_zip := left(trim(coalesce(p#>>'{address,zip}', '')), 20);
  v_ship_m := coalesce(p#>>'{shipping,method}', 'standard');
  v_pay := coalesce(p#>>'{payment,method}', '');
  v_lang := case when p->>'lang' = 'en' then 'en' else 'fr' end;
  if v_first = '' or v_last = '' or v_city = '' or v_line = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
     or length(regexp_replace(v_phone, '\D', '', 'g')) < 8 then
    return jsonb_build_object('error', 'contact');
  end if;

  v_guard := public.rx_guard_check('order', p->'guard');
  if v_guard is not null then return jsonb_build_object('error', v_guard); end if;
  -- at most 3 orders in 10 minutes for the same e-mail (fake orders would hold stock)
  if (select count(*) from public.rx_docs where coll = 'orders' and lower(data#>>'{customer,email}') = v_email and (data->>'date')::bigint > v_now - 600000) >= 3 then
    return jsonb_build_object('error', 'rate');
  end if;

  select data into sh from public.rx_docs where coll = 'settings' and key = 'shipping';
  select data into pm from public.rx_docs where coll = 'settings' and key = 'payments';
  if sh is null or pm is null then return jsonb_build_object('error', 'closed'); end if;
  if not exists (select 1 from jsonb_array_elements(sh->'countries') c where c->>'code' = v_country and coalesce((c->>'enabled')::boolean, false)) then
    return jsonb_build_object('error', 'country');
  end if;
  if v_ship_m not in ('standard', 'express') or not coalesce((sh->v_ship_m->>'enabled')::boolean, false) then return jsonb_build_object('error', 'shipping'); end if;
  if v_pay not in ('mobilemoney', 'card', 'paypal', 'applepay', 'cod') or not coalesce((pm->v_pay->>'enabled')::boolean, false) then return jsonb_build_object('error', 'payment'); end if;
  if v_pay = 'mobilemoney' then
    v_op := coalesce(p#>>'{payment,operator}', '');
    if v_op not in ('wave', 'orange', 'mtn', 'moov') or not coalesce((pm->'mobilemoney'->>v_op)::boolean, false) then return jsonb_build_object('error', 'payment'); end if;
  end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 or jsonb_array_length(p->'items') > 50 then return jsonb_build_object('error', 'empty'); end if;

  -- items: product on sale, size and colour, stock (rows locked until the end of the order)
  for it in select * from jsonb_array_elements(p->'items') loop
    v_q := greatest(1, least(99, coalesce((it->>'q')::int, 1)));
    select data into prod from public.rx_docs where coll = 'products' and key = it->>'pid' for update;
    if prod is null or prod->>'status' <> 'active'
       or exists (select 1 from public.rx_docs c where c.coll = 'categories' and c.key = prod->>'cat' and not coalesce((c.data->>'visible')::boolean, true)) then
      bad := bad || jsonb_build_object('pid', it->'pid', 'problem', 'unavailable'); continue;
    end if;
    v_sizes := case when prod->>'cat' = 'accessories' then array['One size'] else array['XS', 'S', 'M', 'L', 'XL'] end;
    v_size := coalesce(nullif(it->>'size', ''), case when array_length(v_sizes, 1) = 1 then v_sizes[1] end);
    col := null;
    if jsonb_typeof(prod->'colors') = 'array' and jsonb_array_length(prod->'colors') > 0 and jsonb_typeof(prod->'vstock') = 'object' then
      select c into col from jsonb_array_elements(prod->'colors') c
        where c->>'id' = coalesce(it->>'color', '') or lower(c->>'name') = lower(coalesce(it->>'color', '')) or lower(coalesce(c->>'nameFr', '')) = lower(coalesce(it->>'color', ''))
        limit 1;
      if col is null and jsonb_array_length(prod->'colors') = 1 then col := prod->'colors'->0; end if;
      if col is null then bad := bad || jsonb_build_object('pid', it->'pid', 'problem', 'options'); continue; end if;
    end if;
    if v_size is null or not (v_size = any (v_sizes)) then bad := bad || jsonb_build_object('pid', it->'pid', 'problem', 'options'); continue; end if;
    v_avail := greatest(0, coalesce(case when col is not null then (prod->'vstock'->(col->>'id')->>v_size)::int else (prod->'stock'->>v_size)::int end, 0));
    -- the same article on several lines of the order: what the earlier lines take is no longer available
    v_avail := greatest(0, v_avail - coalesce((select sum((t->>'q')::int) from jsonb_array_elements(todo) t
      where t->>'key' = prod->>'id' and t->>'cid' is not distinct from col->>'id' and t->>'size' = v_size), 0)::int);
    if v_avail < v_q then
      bad := bad || jsonb_build_object('pid', it->'pid', 'problem', case when v_avail = 0 then 'soldout' else 'reduced' end, 'max', v_avail); continue;
    end if;
    v_sub := v_sub + (prod->>'price')::numeric * v_q;
    items := items || jsonb_build_object('pid', (prod->>'id')::int, 'name', prod->>'name', 'price', (prod->>'price')::numeric, 'q', v_q,
      'size', case when array_length(v_sizes, 1) = 1 then '' else v_size end, 'color', coalesce(col->>'name', coalesce(it->>'color', '')));
    todo := todo || jsonb_build_object('key', prod->>'id', 'cid', col->>'id', 'size', v_size, 'q', v_q);
  end loop;
  if jsonb_array_length(bad) > 0 then return jsonb_build_object('error', 'stock', 'lines', bad); end if;

  -- promo code
  v_code := nullif(upper(trim(coalesce(p->>'promo', ''))), '');
  if v_code is not null then
    select data into promo from public.rx_docs where coll = 'promos' and key = v_code for update;
    if promo is null or not coalesce((promo->>'active')::boolean, false) or coalesce((promo->>'starts')::bigint, 0) > v_now
       or (coalesce((promo->>'ends')::bigint, 0) > 0 and (promo->>'ends')::bigint < v_now)
       or (coalesce((promo->>'limit')::int, 0) > 0 and coalesce((promo->>'used')::int, 0) >= (promo->>'limit')::int)
       or v_sub < coalesce((promo->>'minOrder')::numeric, 0) then
      return jsonb_build_object('error', 'promo');
    end if;
    if promo->>'type' = 'percent' then v_disc := round(v_sub * coalesce((promo->>'value')::numeric, 0) / 100);
    elsif promo->>'type' = 'fixed' then v_disc := least(coalesce((promo->>'value')::numeric, 0), v_sub);
    end if;
  end if;

  -- delivery and total
  v_ship := coalesce((sh->v_ship_m->>'price')::numeric, 0);
  if v_ship_m = 'standard' and coalesce((sh->>'freeOver')::numeric, 0) > 0 and v_sub - v_disc >= (sh->>'freeOver')::numeric then v_ship := 0; end if;
  if promo is not null and promo->>'type' = 'shipping' then v_ship := 0; end if;
  v_total := v_sub - v_disc + v_ship;
  if v_pay = 'cod' and coalesce((pm->'cod'->>'max')::numeric, 0) > 0 and v_total > (pm->'cod'->>'max')::numeric then
    return jsonb_build_object('error', 'cod_max', 'max', (pm->'cod'->>'max')::numeric);
  end if;

  -- stock out (per colour and size; the per-size total is the sum of the colours)
  for line in select * from jsonb_array_elements(todo) loop
    select data into prod from public.rx_docs where coll = 'products' and key = line->>'key';
    if line->>'cid' is not null then
      prod := jsonb_set(prod, array['vstock', line->>'cid', line->>'size'], to_jsonb(greatest(0, coalesce((prod->'vstock'->(line->>'cid')->>(line->>'size'))::int, 0) - (line->>'q')::int)));
      select coalesce(sum(greatest(0, coalesce((prod->'vstock'->(c->>'id')->>(line->>'size'))::int, 0))), 0)::int into v_sum from jsonb_array_elements(prod->'colors') c;
      prod := jsonb_set(prod, array['stock', line->>'size'], to_jsonb(v_sum));
    else
      prod := jsonb_set(prod, array['stock', line->>'size'], to_jsonb(greatest(0, coalesce((prod->'stock'->>(line->>'size'))::int, 0) - (line->>'q')::int)));
    end if;
    update public.rx_docs set data = prod where coll = 'products' and key = line->>'key';
  end loop;
  if promo is not null then
    update public.rx_docs set data = jsonb_set(data, '{used}', to_jsonb(coalesce((data->>'used')::int, 0) + 1)) where coll = 'promos' and key = v_code;
  end if;

  -- customer: created or updated from the order
  select data into cust from public.rx_docs where coll = 'customers' and lower(data->>'email') = v_email limit 1 for update;
  if cust is null then
    v_cust_id := 'C' || nextval('public.rx_customer_seq');
    while exists (select 1 from public.rx_docs where coll = 'customers' and key = v_cust_id) loop v_cust_id := 'C' || nextval('public.rx_customer_seq'); end loop;
    insert into public.rx_docs (coll, key, data) values ('customers', v_cust_id, jsonb_build_object('id', v_cust_id, 'first', v_first, 'last', v_last, 'email', v_email,
      'phone', v_phone, 'country', v_country, 'city', v_city, 'createdAt', v_now, 'tags', '[]'::jsonb, 'note', '', 'newsletter', false));
  else
    -- an existing customer is not changed by an order: anyone can type someone else's e-mail (the order keeps its own contact details)
    v_cust_id := cust->>'id';
  end if;

  -- the order, waiting for the shop to confirm the payment
  v_order_id := 'RX-' || nextval('public.rx_order_seq');
  while exists (select 1 from public.rx_docs where coll = 'orders' and key = v_order_id) loop v_order_id := 'RX-' || nextval('public.rx_order_seq'); end loop;
  ord := jsonb_build_object('id', v_order_id, 'date', v_now, 'status', 'pending', 'customerId', v_cust_id,
    'customer', jsonb_build_object('first', v_first, 'last', v_last, 'email', v_email, 'phone', v_phone),
    'address', jsonb_build_object('country', v_country, 'city', v_city, 'line', v_line, 'zip', v_zip),
    'items', items, 'subtotal', v_sub, 'discount', v_disc, 'promo', to_jsonb(v_code),
    'shipping', jsonb_build_object('method', v_ship_m, 'price', v_ship), 'total', v_total,
    'payment', jsonb_build_object('method', v_pay, 'operator', v_op), 'tracking', '', 'notes', '[]'::jsonb,
    'history', jsonb_build_array(jsonb_build_object('t', v_now, 'status', 'pending', 'by', 'Client')), 'source', 'web', 'lang', v_lang);
  insert into public.rx_docs (coll, key, data) values ('orders', v_order_id, ord);
  insert into public.rx_docs (coll, key, data) values ('activity', 'a' || v_now || '-' || v_order_id,
    jsonb_build_object('id', 'a' || v_now || '-' || v_order_id, 't', v_now, 'user', 'Boutique en ligne', 'action', 'nouvelle commande', 'target', v_order_id || ' — ' || public.rx_money(v_total)));
  return ord;
end $$;

-- ---------------------------------------------------------------------------
-- storefront: review, newsletter, visits
-- ---------------------------------------------------------------------------
create or replace function public.rx_add_review(p_pid int, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_now bigint := public.rx_now_ms(); prod jsonb; st jsonb; rec jsonb; v_id text;
  v_stars int := coalesce((p->>'stars')::int, 0);
  v_title text := left(trim(coalesce(p->>'title', '')), 80);
  v_text text := left(trim(coalesce(p->>'text', '')), 1000);
  v_name text := left(trim(coalesce(p->>'name', '')), 40);
  v_guard text;
begin
  v_guard := public.rx_guard_check('review', p->'guard');
  if v_guard is not null then return jsonb_build_object('error', v_guard); end if;
  select data into prod from public.rx_docs where coll = 'products' and key = p_pid::text;
  if prod is null or v_stars < 1 or v_stars > 5 or v_title = '' or length(v_text) < 20 or v_name = '' then return jsonb_build_object('error', 'invalid'); end if;
  select data into st from public.rx_docs where coll = 'settings' and key = 'reviews';
  v_id := 'r' || v_now || floor(random() * 1000)::int;
  rec := jsonb_build_object('id', v_id, 'pid', p_pid, 'stars', v_stars, 'title', v_title, 'text', v_text, 'name', v_name,
    'city', left(trim(coalesce(p->>'city', '')), 60), 'size', left(coalesce(p->>'size', ''), 10), 'fit', left(coalesce(p->>'fit', ''), 10),
    'date', v_now, 'status', case when coalesce((st->>'moderation')::boolean, true) then 'pending' else 'published' end,
    'reply', '', 'replyDate', 0, 'source', 'web', 'lang', case when p->>'lang' = 'en' then 'en' else 'fr' end);
  insert into public.rx_docs (coll, key, data) values ('reviews', v_id, rec);
  insert into public.rx_docs (coll, key, data) values ('activity', 'a' || v_now || '-' || v_id,
    jsonb_build_object('id', 'a' || v_now || '-' || v_id, 't', v_now, 'user', 'Boutique en ligne', 'action', 'nouvel avis ' || v_stars || '★ sur', 'target', prod->>'name'));
  return rec;
end $$;

drop function if exists public.rx_subscribe(text, text, text);
create or replace function public.rx_subscribe(p_email text, p_lang text, p_source text, p_guard jsonb) returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(left(trim(coalesce(p_email, '')), 120)); s jsonb; v_guard text;
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then return 'invalid'; end if;
  v_guard := public.rx_guard_check('newsletter', p_guard);
  if v_guard is not null then return v_guard; end if;
  select data into s from public.rx_docs where coll = 'subscribers' and key = v_email;
  if s is not null and s->>'status' = 'subscribed' then return 'exists'; end if;
  insert into public.rx_docs (coll, key, data) values ('subscribers', v_email, jsonb_build_object('email', v_email, 'date', public.rx_now_ms(),
      'lang', case when p_lang = 'en' then 'en' else 'fr' end, 'source', case when p_source in ('home', 'footer', 'checkout') then p_source else 'home' end, 'status', 'subscribed'))
    on conflict (coll, key) do update set data = public.rx_docs.data || jsonb_build_object('status', 'subscribed', 'date', public.rx_now_ms());
  return 'ok';
end $$;

-- one page view per load, one session per browser tab (days in UTC, the time of Abidjan)
create or replace function public.rx_track(p_first boolean) returns void language plpgsql security definer set search_path = public as $$
declare
  v_day text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
begin
  -- 120 pages in 10 minutes, 2 000 a day per connection: beyond that the views are not counted
  if not public.rx_rate('track', 120, 2000) then return; end if;
  insert into public.rx_docs (coll, key, data) values ('traffic', v_day, jsonb_build_object('sessions', case when p_first then 1 else 0 end, 'views', 1))
  on conflict (coll, key) do update set data = jsonb_build_object(
    'sessions', coalesce((public.rx_docs.data->>'sessions')::int, 0) + case when p_first then 1 else 0 end,
    'views', coalesce((public.rx_docs.data->>'views')::int, 0) + 1);
end $$;

-- ---------------------------------------------------------------------------
-- back office: the signed-in member (last login, name)
-- ---------------------------------------------------------------------------
create or replace function public.rx_me() returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email', '')); me jsonb;
begin
  update public.rx_docs set data = data || jsonb_build_object('lastLogin', public.rx_now_ms())
    where coll = 'staff' and key = v_email and coalesce((data->>'active')::boolean, true)
    returning data into me;
  return me;
end $$;

create or replace function public.rx_set_my_name(p_name text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email', '')); me jsonb;
begin
  if trim(coalesce(p_name, '')) = '' then return null; end if;
  update public.rx_docs set data = data || jsonb_build_object('name', left(trim(p_name), 80))
    where coll = 'staff' and key = v_email and coalesce((data->>'active')::boolean, true) returning data into me;
  return me;
end $$;

revoke execute on function public.rx_public(), public.rx_check_promo(text), public.rx_place_order(jsonb), public.rx_add_review(int, jsonb),
  public.rx_subscribe(text, text, text, jsonb), public.rx_track(boolean), public.rx_me(), public.rx_set_my_name(text),
  public.rx_role(), public.rx_can_write(text, text), public.rx_guard_check(text, jsonb) from public;
grant execute on function public.rx_public(), public.rx_check_promo(text), public.rx_place_order(jsonb), public.rx_add_review(int, jsonb),
  public.rx_subscribe(text, text, text, jsonb), public.rx_track(boolean) to anon, authenticated;
-- Supabase grants every new function to anon and authenticated by name: revoking from "public" above does not remove that
revoke execute on function public.rx_me(), public.rx_set_my_name(text), public.rx_role(), public.rx_can_write(text, text), public.rx_can_read(text, text) from public, anon;
revoke execute on function public.rx_guard_check(text, jsonb), public.rx_rate(text, int, int) from public, anon, authenticated;
grant execute on function public.rx_me(), public.rx_set_my_name(text), public.rx_role(), public.rx_can_write(text, text), public.rx_can_read(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- media library: photos and videos uploaded in the back office (public files)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do update set public = true;
-- size and types checked by the storage itself (same list as the media library of the back office): 200 MB, photos and videos only
update storage.buckets set file_size_limit = 209715200,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg']
where id = 'media';
drop policy if exists rx_media_read on storage.objects;
drop policy if exists rx_media_insert on storage.objects;
drop policy if exists rx_media_update on storage.objects;
drop policy if exists rx_media_delete on storage.objects;
-- staff can list and read back the files (the bucket is public: visitors load them by address)
create policy rx_media_read on storage.objects for select to authenticated using (bucket_id = 'media' and (select public.rx_role()) is not null);
create policy rx_media_insert on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.rx_can_write('media', ''));
create policy rx_media_update on storage.objects for update to authenticated using (bucket_id = 'media' and public.rx_can_write('media', ''));
create policy rx_media_delete on storage.objects for delete to authenticated using (bucket_id = 'media' and public.rx_can_write('media', ''));

-- ---------------------------------------------------------------------------
-- first administrator (the login itself is created in Authentication → Users)
-- ---------------------------------------------------------------------------
insert into public.rx_docs (coll, key, data) values ('staff', 'jihemekacou@gmail.com', jsonb_build_object(
  'id', 'u1', 'name', 'Administrateur RELAXX', 'email', 'jihemekacou@gmail.com', 'role', 'admin', 'active', true, 'createdAt', public.rx_now_ms(), 'lastLogin', 0))
on conflict (coll, key) do nothing;
