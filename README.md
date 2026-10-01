# RELAXX — boutique de mode

Site e-commerce bilingue (français / anglais) et son back-office, en HTML, CSS et JavaScript sans étape de compilation.

## Pages

| Fichier | Contenu |
| --- | --- |
| `index.html` | Accueil : page de chargement, bannière (image ou vidéo), catégories tendance, collection, notre histoire, avis, accessoires, newsletter, galerie Instagram |
| `shop.html` | Boutique : tous les produits par catégorie, recherche (noms français et anglais) |
| `product.html` | Fiche produit : couleurs et tailles avec stock, avis clients publiés, suggestions |
| `checkout.html` | Commande : livraison, Mobile Money, carte, PayPal, paiement à la livraison, codes promo |
| `histoire.html` | Notre histoire |
| `aide.html` | Aide & FAQ : livraison, retours, guide des tailles, entretien, questions fréquentes, contact, boutique |
| `cgv.html`, `cgu.html`, `confidentialite.html` | Pages légales (droit ivoirien) |
| `404.html` | Page « introuvable » (servie automatiquement par la plupart des hébergeurs) |
| `maintenance.html` | Page d'attente du mode maintenance : message du back-office, contact, retour automatique à la boutique dès la réouverture |
| `admin/` | Back-office (voir [admin/README.md](admin/README.md)) |

Autres fichiers : `relaxx-db.js`, la couche de données partagée par la boutique et le back-office ; `sw.js`, qui sert les photos et vidéos importées dans la médiathèque ; `favicon.svg` ; `robots.txt` (le back-office et la page de commande ne sont pas indexés).

Ce que le back-office règle se retrouve sur le site : coordonnées (menu, page Aide), mentions légales (CGV, CGU, confidentialité), tarifs et délais de livraison, moyens de paiement, catégories (onglets, menu, pied de page), réseaux sociaux (un réseau non renseigné n'est pas affiché). Les prix sont affichés sans décimales : « 115 000 FCFA » en français, « CFA 115,000 » en anglais.

## Lancer le site

Servez le dossier avec n'importe quel serveur HTTP local, par exemple :

```bash
npx serve .
```

puis ouvrez l'adresse affichée (la boutique) et `/admin/` (le back-office). Ouvrir les fichiers directement (`file://`) ne suffit pas : la médiathèque et le back-office ont besoin d'une adresse `http://`.

## Base de données (Supabase)

Les données de la boutique sont dans Supabase : catalogue, stock, commandes, clients, avis, newsletter, codes promo, réglages, équipe et photos importées. Une commande passée sur le site arrive dans le back-office, et une modification faite dans le back-office est visible par tous les visiteurs. Mise en place et sécurité : [supabase/README.md](supabase/README.md).

- Le site lit le catalogue public au chargement des pages. Une page ouverte moins d'une minute après la précédente utilise la copie gardée par le navigateur, puis la rafraîchit. La page de commande relit toujours les dernières données. Si Supabase ne répond pas, la dernière copie (ou le catalogue de base) s'affiche et la commande reste impossible jusqu'au retour de la connexion.
- Le back-office se connecte avec les comptes Supabase Auth de l'équipe. Il enregistre chaque modification dans Supabase et récupère toutes les 20 secondes les nouveautés (nouvelles commandes, travail des autres membres).

## Commandes et paiement

Le site n'encaisse rien : aucune donnée de carte bancaire n'y est saisie. Une commande est enregistrée « En attente » ; la boutique contacte le client pour confirmer la commande et lui envoie une demande ou un lien de paiement (Mobile Money, carte, PayPal), puis passe la commande en « Payée » dans le back-office. Le paiement à la livraison se règle à la remise du colis.

Avant d'enregistrer une commande, la base de données vérifie chaque article (produit en vente, taille et couleur, stock) et recalcule elle-même les prix, la livraison et la remise : le montant affiché par le navigateur ne compte pas. Les boutons « ajouter au panier » des vignettes ouvrent la fiche produit quand une taille ou une couleur doit être choisie.

## À faire avant la mise en ligne

1. Suivre les étapes de [supabase/README.md](supabase/README.md) (tables, catalogue, compte administrateur).
2. Compléter dans **Réglages** la raison sociale, la forme juridique, le capital, le RCCM, le NCC, le directeur de la publication, l'hébergeur et l'e-mail de contact : ces champs remplissent les pages légales, où un champ vide reste surligné.
3. Faire relire les CGV, CGU et la politique de confidentialité par un juriste.
4. Remplacer les contenus d'exemple : avis mis en avant sur l'accueil (« Portés & aimés »), compositions et conseils d'entretien des fiches (communs à toute une catégorie), photos Unsplash, textes de « Notre histoire », stock de départ des produits.
5. Renseigner le compte Instagram de la boutique (le lien par défaut mène à la page d'accueil d'Instagram) et les autres réseaux.

Les formulaires (commande, avis, newsletter) sont protégés contre les robots, sans service tiers : champ piège, temps minimum, preuve de calcul et limites par connexion, vérifiés par la base de données (voir [supabase/README.md](supabase/README.md)).

Encore à prévoir : un prestataire de paiement en ligne (CinetPay, PayDunya, Wave, Orange Money), un service d'e-mails (confirmations de commande), et la synchronisation Instagram et la traduction automatique côté serveur (voir [admin/README.md](admin/README.md)).
