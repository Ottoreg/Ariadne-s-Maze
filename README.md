# Ariadne's Maze

Un jeu web où l'on incarne un aventurier explorant un labyrinthe généré par
**seed**, peuplé d'événements et hanté par le **Minotaure**. La vue est en
**3D à la première personne « façon Doom 1993 »** (raycasting), avec une minimap.
Le jeu est une **PWA** installable et jouable hors-ligne.

## Fonctionnalités de cette base

- 🌱 **Labyrinthe généré par seed** — même seed = même labyrinthe (déterministe).
  Algorithme *recursive backtracker* + quelques boucles pour la fluidité.
- 🟩 **Types de sol** (pierre, herbe, sable, boue, eau) répartis en zones.
- 🎲 **Événements par case** déterminés par l'aléatoire **et** le type de sol de
  la case **et des 9 cases alentours** :
  - ⚠️ **Pièges** (dégâts),
  - ⚔️ **Rencontres de monstres** → **combat** (voir ci-dessous),
  - 💰 **Trésors** (or, objets, potions de soin).
- ⚔️ **Combat en modale** (style Pokémon : ennemi en haut à droite, joueur en
  bas à gauche). Le joueur possède par défaut un **glaive** (3 dégâts/coup) et
  dispose de trois actions, aucune garantie à 100 % :
  - **Attaquer** (80 % de toucher), **Parer** (60 % de bloquer l'attaque),
    **Fuir** (50 % de réussite). Le monstre riposte selon sa propre précision et
    ne peut pas fuir. Victoire = butin en or ; défaite à 0 PV = niveau recommencé.
- 🧰 **Équipement & inventaire (façon Diablo)** : **5 emplacements**
  d'équipement (tête, corps, jambes, bras droit, bras gauche) affichés à côté du
  **sac de 5 places**. On peut **équiper / déséquiper** les objets, et **jeter**
  au sol / **ramasser** (les objets déposés restent sur la case). Si le sac est
  plein, un trésor reste au sol. Le joueur démarre avec un **glaive** (main
  droite) et une **tunique en tissu** (corps, 1 armure) équipés, plus
  **3 potions mineures** (+5 PV) dans le sac. L'**armure mitige** tous les dégâts
  reçus. Des équipements supplémentaires (casque, jambières, bouclier, dague) se
  trouvent dans les trésors.
- 📱 **Verrou paysage** : le jeu invite à tourner l'appareil en portrait
  (`orientation: landscape` + tentative de verrouillage + invite plein écran).
- 🕹️ **Vue 3D première personne (raycasting « à la Doom »)** : murs texturés/
  ombrés selon la distance et la zone, sol/plafond, sprites (Minotaure, sortie,
  objets au sol) avec occlusion, et **minimap**. Déplacement case par case :
  **avancer/reculer** (consomment un tour) et **pivoter** de 90° (gratuit).
- ❤️ **Points de vie** : à 0, l'aventurier meurt et le niveau recommence.
- 🐂 **Minotaure** mobile : il patrouille, détecte le joueur dans un rayon donné,
  le poursuit et inflige de gros dégâts au contact.
- 🎒 **Inventaire simple** + or + journal des événements.
- 📶 **PWA** : `manifest.webmanifest` + service worker (`sw.js`) pour le jeu
  hors-ligne et l'installation sur l'écran d'accueil.

## Lancer le jeu

### Test rapide (sans serveur) — `standalone.html`

Pour tester immédiatement, il suffit d'ouvrir **`standalone.html`** dans un
navigateur (double-clic). Ce fichier est **autonome** : tout le HTML, le CSS et
le JavaScript y sont intégrés, il fonctionne donc directement en `file://`, sans
serveur. *(Généré à partir des modules ci-dessous — même logique.)*

### Version PWA complète (installable / hors-ligne)

La PWA utilise des modules ES et un service worker : il faut la servir via HTTP
(pas en `file://`). Depuis le dossier du projet :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Pour rejouer un labyrinthe précis : `http://localhost:8000/?seed=ma-seed`, ou
saisir la seed dans le **menu** (⚙️) puis **Générer**.

## Interface

Pensée pour le **mobile en mode paysage** : la vue principale est occupée par le
labyrinthe plein écran, le HUD est en surimpression.

- **Bas gauche** : contrôles 3D — ▲ avancer / ▼ reculer (répétition au maintien),
  ↰ ↱ pivoter à gauche / droite.
- **Bas centre** : **minimap** (position + orientation, sortie, Minotaure aperçu).
- **Bas droite** : bouton d'action **Attendre** (passe un tour ; le Minotaure
  bouge — utile tactiquement).
- **Haut gauche** : points de vie, or, tours, seed.
- **Haut droite** : 🎒 inventaire · 📜 journal des événements · ⚙️ menu (seed,
  recommencer, légende) — s'ouvrent en tiroir latéral.
- Les événements s'affichent en **toasts** éphémères sur la vue principale.

## Commandes

| Action            | Tactile                     | Clavier                          |
| ----------------- | --------------------------- | -------------------------------- |
| Avancer / reculer | ▲ / ▼ (bas gauche)          | ↑/↓ · `Z`/`S` · `W`/`S`          |
| Pivoter g/d       | ↰ / ↱ (bas gauche)          | ←/→ · `Q`/`D` · `A`/`D`          |
| Attendre          | Bouton **Attendre**         | `Espace`                         |
| Panneaux          | 🎒 · 📜 · ⚙️ (haut droite)  | `Échap` pour fermer              |

Objectif : atteindre la sortie **⚑** en survivant aux pièges, aux monstres et au
Minotaure.

## Structure du code

```
index.html              Page + HUD
manifest.webmanifest    Manifeste PWA
sw.js                   Service worker (cache hors-ligne)
css/style.css           Thème et mise en page
assets/icon.svg         Icône de l'application
js/
  rng.js       PRNG déterministe seedé (mulberry32 + hash)
  maze.js      Génération du labyrinthe et des terrains
  events.js    Détermination des événements (sol + 9 voisins + aléa)
  player.js    Aventurier : PV, or, sac (5 places), équipement (5 slots)
  combat.js    Combat au tour par tour (attaquer / parer / fuir)
  minotaur.js  IA du Minotaure (patrouille / détection / poursuite)
  raycaster.js Rendu 3D première personne (raycasting) + minimap
  game.js      Contrôleur : tours, orientation, événements, mort/relance
  main.js      Liaison DOM (HUD, contrôles, PWA)
```

## Pistes pour la suite

- 🔀 **Reconfiguration du labyrinthe** après la première détection par le
  Minotaure — le crochet est déjà en place (`Game._onFirstDetection`,
  drapeau `Minotaur.hasDetectedPlayer`).
- Combat, objets utilisables depuis l'inventaire, sons, niveaux successifs,
  génération d'icônes PNG dédiées pour la PWA.
