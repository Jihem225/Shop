# Back-office RELAXX

Espace de gestion de la boutique : `admin/index.html` (par exemple `http://localhost:5173/admin/`).

## Connexion

Les comptes de l'équipe sont des comptes Supabase Auth (e-mail + mot de passe), créés dans **Authentication → Users → Add user** ; le rôle de chacun se règle dans **Équipe & rôles**. Le premier administrateur est `jihemekacou@gmail.com` (voir [../supabase/README.md](../supabase/README.md)). Chaque membre peut changer son mot de passe depuis son profil.

## Ce que l'on gère

| Section | Contenu |
| --- | --- |
| Tableau de bord | CA, commandes, panier moyen, conversion — période : aujourd'hui (par défaut), hier, 7/30/90 j ou un jour choisi dans le calendrier (les jours avec commandes y sont marqués), comparaison avec la période précédente. Sur un seul jour : ventes par heure, commandes du jour et historique de la journée (commandes, changements de statut, avis, inscriptions, actions de l'équipe). Courbe des ventes et des visites, tâches à traiter, objectif mensuel, meilleures ventes, catégories, paiements, villes, dernières commandes |
| Rapports | Mêmes périodes que le tableau de bord (dont un jour du calendrier, détaillé par heure) ; ventes par jour/semaine/mois, par produit (marge estimée), catégorie, pays/ville, moyen de paiement, codes promo — exports CSV |
| Commandes | Filtres par statut, paiement, période, recherche ; actions groupées ; fiche commande : statut (avec remise en stock en cas d'annulation/remboursement), n° de suivi, notes internes, historique, client, adresse, paiement, facture imprimable (PDF) |
| Clients | Segments (VIP, fidèles, nouveaux, inactifs, prospects), fiche client modifiable, historique, anonymisation (droit à l'oubli), export |
| Codes promo | Pourcentage, montant fixe ou livraison offerte, minimum de commande, dates, limite d'utilisation, pause — vérifiés en direct au checkout |
| Produits | Liste, filtres, création/édition en français, photo, prix, prix barré, coût d'achat et marge, étiquette, statut (actif/brouillon/archivé), aperçu, duplication, remise groupée. **Couleurs** : jusqu'à 12 par produit (nom, teinte, photo propre à la couleur, ordre), palette de couleurs courantes, stock par couleur × taille ; ou « couleur unique » avec un stock par taille |
| Stock | Quantités par couleur et par taille éditables, alertes (seuil réglable), valeur du stock, export |
| Catégories | Noms, ordre et visibilité — suivis par les onglets de la boutique, le menu et le pied de page du site |
| Guide des tailles | Mesures par taille des vêtements (colonnes ajoutables) et dimensions des accessoires, avec leur texte d'introduction ; affiché sur les fiches produit et la page Aide, version anglaise traduite automatiquement |
| Avis clients | Modération (publier, masquer, supprimer), réponses publiques affichées sur la fiche produit, modération avant publication activable |
| Newsletter | Abonnés reçus depuis le site, courbe d'inscriptions, sources, ajout manuel, désinscription, export |
| Vitrine du site | Textes (en français), images, liens et sections affichées/masquées de la page d'accueil (bannière, catégories tendance, collection, notre histoire, avis mis en avant, accessoires, newsletter, Instagram), de la page Notre histoire et du pied de page ; produits mis en avant ; titres et descriptions Google (SEO) ; aperçu ordinateur/mobile. Seuls les contenus modifiés sont enregistrés, « Rétablir l'original » revient au texte des pages |
| Vitrine › Instagram | Galerie avant le pied de page : chaque photo ouvre sa propre publication sur Instagram. Mode automatique (compte Instagram professionnel connecté par jeton d'accès : les 5 dernières publications s'affichent, actualisation de 15 min à 24 h, publications masquables, jeton renouvelé automatiquement) ou manuel (photo choisie, importée ou par lien + lien de la publication, vérifié). Photos de secours si Instagram est injoignable |
| Médiathèque | Partout où l'on choisit une image : import depuis l'ordinateur ou le téléphone (bouton, glisser-déposer, coller), médiathèque des fichiers déjà importés (réutilisation, suppression avec alerte si le fichier est utilisé), images du site, lien. Photos redimensionnées automatiquement (2400 px max). Bannière d'accueil : image **ou vidéo** (MP4/WebM, muette, en boucle, image d'aperçu générée automatiquement, pas de lecture automatique si le visiteur a demandé moins d'animations) |
| Annonce & maintenance | Barre d'annonce (en haut de toutes les pages), mode maintenance |
| Livraison | Tarifs et délais standard/express, livraison offerte dès X FCFA, pays desservis |
| Paiements | Mobile Money (Wave, Orange Money, MTN MoMo, Moov Money), carte, paiement à la livraison (plafond), PayPal, Apple Pay |
| Réglages | Coordonnées, horaires, réseaux sociaux (un réseau vide n'apparaît pas sur le site), mentions légales (raison sociale, forme juridique, capital, RCCM, NCC, directeur de la publication, hébergeur — reprises automatiquement dans les CGV, CGU et la politique de confidentialité), TVA, notifications, sauvegarde/restauration JSON, suppression des données de démo, réinitialisation |
| Équipe & rôles | Membres, rôles (Administrateur, Gestionnaire, Support client, Lecture seule), matrice des permissions, mots de passe |
| Journal d'activité | Toutes les actions de l'équipe et les événements de la boutique |

**Langues** : le back-office est entièrement en français. À chaque enregistrement (produits, couleurs, catégories, vitrine, référencement, annonce), la version anglaise du site est traduite automatiquement et affichée sous le champ (« EN … ») ; seuls les textes modifiés sont retraduits.

Aussi : recherche globale (⌘K / Ctrl+K), notifications, affichage mobile, synchronisation en direct avec la boutique ouverte dans un autre onglet (une nouvelle commande apparaît immédiatement).

## Architecture

- `relaxx-db.js` (racine du site) : couche de données partagée par la boutique et le back-office. Les données sont dans Supabase (table `rx_docs`, un document JSON par enregistrement, voir `supabase/schema.sql`) :
  - le back-office charge tout après la connexion, envoie seulement ce qui a changé à chaque enregistrement, et récupère les nouveautés toutes les 20 secondes ;
  - la boutique lit le catalogue public (`rx_public`) et écrit par des fonctions contrôlées par la base (`rx_place_order`, `rx_add_review`, `rx_subscribe`, `rx_track`, `rx_check_promo`).
- La boutique lit : catalogue, prix, stock, statut des produits, catégories visibles, traductions, livraison, paiements, pays, barre d'annonce, maintenance, vitrine, galerie Instagram, guide des tailles, avis publiés.
- La boutique écrit : commandes, avis, inscriptions newsletter, visites. Une commande du site arrive « En attente » : aucun paiement n'est encaissé sur le site, la boutique confirme le paiement puis passe la commande en « Payée ».
- Médiathèque : les fichiers importés vont dans le bucket public `media` de Supabase Storage et sont référencés par leur adresse publique.
- Variantes : `p.colors` (liste des couleurs) et `p.vstock` (stock par couleur puis par taille) ; `p.stock` reste le total par taille, recalculé automatiquement. Une commande retire le stock de la couleur et de la taille achetées ; une annulation avec remise en stock le rend au même endroit.
- `admin/translate.js` : traduction automatique français → anglais au moment de l'enregistrement (Google Translate, repli MyMemory), avec cache.
- `admin/core.js` : connexion, rôles, navigation, composants, graphiques. `admin/views-*.js` : les écrans.

## Encore à prévoir

1. Brancher un prestataire de paiement agréé (CinetPay, PayDunya, Stripe, API Wave / Orange Money) : il confirmerait lui-même le paiement de la commande.
2. Instagram : déplacer le jeton d'accès et la synchronisation côté serveur (Edge Function planifiée qui interroge `graph.instagram.com/me/media`). Aujourd'hui, la synchronisation se fait quand un administrateur ouvre le back-office, et le jeton est stocké dans les réglages, visibles de l'équipe seulement.
3. Traduction : passer par une API officielle côté serveur (DeepL ou Google Cloud Translation, avec la clé de la boutique).
4. Brancher un service d'e-mails (confirmations de commande, notifications, newsletter).
5. Protection anti-robots (captcha) sur la commande, les avis et la newsletter si des envois abusifs apparaissent.
