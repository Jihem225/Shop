# RELAXX × Supabase

Base de données de la boutique : projet `cosbmkovkxhvbdijijkm` (https://cosbmkovkxhvbdijijkm.supabase.co).
L'adresse du projet et sa clé publique (`sb_publishable_…`) sont dans `relaxx-db.js`. Cette clé est faite pour le navigateur : ce qu'elle permet est limité par les règles de sécurité ci-dessous. La clé secrète (`service_role`) et le mot de passe de la base ne doivent jamais apparaître dans le site.

## Mise en place (une seule fois)

1. **Tables et sécurité** : Supabase → **SQL Editor** → **New query** → coller tout `schema.sql` → **Run**.
2. **Catalogue de départ** : nouvelle requête → coller `seed.sql` → **Run** (27 produits, 6 catégories, réglages de la boutique ; aucune commande ni aucun client de démonstration).
3. **Compte administrateur** : **Authentication → Users → Add user → Create new user** avec `jihemekacou@gmail.com`, un mot de passe solide, et **Auto Confirm User** coché.
4. **Recommandé** : **Authentication → Sign In / Providers** → désactiver **Allow new users to sign up** (seuls les comptes créés par vous pourront se connecter).
5. Ouvrir `/admin/` et se connecter.

Les deux fichiers peuvent être relancés sans risque : `schema.sql` remplace les fonctions et les règles, `seed.sql` n'écrase rien d'existant.

## Organisation

Une table `rx_docs (coll, key, data jsonb, updated_at)` : un document par enregistrement.

| Collection | Clé | Contenu |
| --- | --- | --- |
| `products` | id | produit, couleurs, stock par couleur et taille, coût d'achat |
| `categories` | clé | nom, ordre, visibilité |
| `orders` | RX-10001… | commande |
| `customers` | C1001… | client |
| `reviews`, `subscribers`, `promos` | id / e-mail / code | avis, abonnés, codes promo |
| `settings` | section | `store`, `shipping`, `payments`, `reviews`, `content`, `notifications`, `vitrine`, `instagram`, `sizeGuide` |
| `staff` | e-mail | membres de l'équipe et leur rôle |
| `activity`, `traffic`, `media` | — | journal, visites par jour, fichiers de la médiathèque |

Les photos et vidéos importées dans le back-office sont dans le bucket public **`media`** (Storage).

## Sécurité

- **Visiteurs** : aucun accès direct à la table. Ils passent par des fonctions :
  - `rx_public` : catalogue sans coût d'achat, réglages publics, avis publiés ;
  - `rx_check_promo` : règles d'un seul code ; la liste des codes reste privée ;
  - `rx_place_order` : la base recalcule elle-même prix, livraison, code promo, stock et plafond du paiement à la livraison, et refuse plus de 3 commandes en 10 minutes pour la même adresse e-mail ;
  - `rx_add_review`, `rx_subscribe`, `rx_track`.
- **Équipe** : un compte Supabase Auth dont l'e-mail figure dans `staff` (et qui est actif) lit toutes les données. Il écrit selon son rôle, avec la même matrice que le back-office :
  - Administrateur : tout ;
  - Gestionnaire : catalogue, ventes, marketing, vitrine ;
  - Support : commandes, clients, avis, stock ;
  - Lecture seule : rien.
- Un compte Supabase qui n'est pas dans `staff` ne voit rien.

## Protection anti-robots

La commande, l'avis et la newsletter sont vérifiés par la base (`rx_guard_check`) à chaque envoi. Aucun service tiers ni cookie n'est utilisé.

1. **Champ piège** : un champ invisible que seuls les robots remplissent.
2. **Temps minimum** entre l'affichage du formulaire et l'envoi : 4 s pour une commande, 3 s pour un avis, 1,5 s pour la newsletter. Le navigateur attend lui-même le temps restant : un client rapide n'est jamais refusé.
3. **Preuve de calcul** : pendant que le visiteur remplit le formulaire, le navigateur cherche un nombre dont le SHA-256 commence par 16 bits à zéro (une fraction de seconde). Chaque preuve est valable 30 minutes et une seule fois : un robot doit refaire ce travail à chaque envoi.
4. **Limites par connexion**, sur 10 minutes / par jour : 10 / 60 commandes, 6 / 20 avis, 10 / 40 inscriptions. S'y ajoutent 3 commandes au plus en 10 minutes pour une même adresse e-mail. L'adresse IP n'est jamais enregistrée en clair : seulement une empreinte salée, effacée au bout de 48 heures (table privée `rx_guard`).

Si des envois abusifs passent malgré tout, on peut ajouter un captcha (Cloudflare Turnstile) vérifié côté serveur.
