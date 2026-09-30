# RELAXX — boutique de mode

Site e-commerce bilingue (français / anglais) et son back-office, en HTML, CSS et JavaScript sans étape de compilation.

## Pages

| Fichier | Contenu |
| --- | --- |
| `index.html` | Accueil : page de chargement, bannière (image ou vidéo), catégories tendance, collection, notre histoire, avis, accessoires, newsletter, galerie Instagram |
| `shop.html` | Boutique : tous les produits par catégorie |
| `product.html` | Fiche produit : couleurs et tailles avec stock, avis clients, suggestions |
| `checkout.html` | Commande : livraison, Mobile Money, carte, paiement à la livraison, codes promo |
| `histoire.html` | Notre histoire |
| `cgv.html`, `cgu.html`, `confidentialite.html` | Pages légales |
| `admin/` | Back-office (voir [admin/README.md](admin/README.md)) |

`relaxx-db.js` est la couche de données partagée par la boutique et le back-office ; `sw.js` sert les photos et vidéos importées dans la médiathèque.

## Lancer le site

Servez le dossier avec n'importe quel serveur HTTP local, par exemple :

```bash
npx serve .
```

puis ouvrez l'adresse affichée (la boutique) et `/admin/` (le back-office). Ouvrir les fichiers directement (`file://`) ne suffit pas : la médiathèque et le back-office ont besoin d'une adresse `http://`.

## À savoir

Cette version est une démonstration qui fonctionne entièrement dans le navigateur : les données (commandes, produits, réglages) sont stockées localement sur chaque appareil. Le passage en production (API serveur, paiement, e-mails, stockage des fichiers) est décrit dans [admin/README.md](admin/README.md).
