# Ariadne's Maze

Un jeu web en vue de dessus (topdown, façon Zelda / Pokémon) où l'on incarne un
aventurier explorant un labyrinthe généré par **seed**, peuplé d'événements et
hanté par le **Minotaure**. Le jeu est une **PWA** installable et jouable
hors-ligne.

## Fonctionnalités de cette base

- 🌱 **Labyrinthe généré par seed** — même seed = même labyrinthe (déterministe).
  Algorithme *recursive backtracker* + quelques boucles pour la fluidité.
- 🟩 **Types de sol** (pierre, herbe, sable, boue, eau) répartis en zones.
- 🎲 **Événements par case** déterminés par l'aléatoire **et** le type de sol de
  la case **et des 9 cases alentours** :
  - ⚠️ **Pièges** (dégâts),
  - ⚔️ **Rencontres de monstres** (dégâts),
  - 💰 **Trésors** (or, objets, potions de soin).
- 🕹️ **Déplacement case par case** (flèches, ZQSD, WASD, ou croix tactile).
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
saisir la seed dans la barre du haut puis **Générer**.

## Commandes

| Action              | Touches                              |
| ------------------- | ------------------------------------ |
| Se déplacer         | Flèches · `ZQSD` · `WASD` · croix tactile |
| Nouvelle seed       | 🎲 (aléatoire) ou champ *Seed* + **Générer** |
| Recommencer         | ↻                                    |

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
  player.js    Aventurier : PV, or, inventaire
  minotaur.js  IA du Minotaure (patrouille / détection / poursuite)
  render.js    Rendu canvas topdown avec caméra et brouillard
  game.js      Contrôleur : tours, événements, mort/relance
  main.js      Liaison DOM (HUD, contrôles, PWA)
```

## Pistes pour la suite

- 🔀 **Reconfiguration du labyrinthe** après la première détection par le
  Minotaure — le crochet est déjà en place (`Game._onFirstDetection`,
  drapeau `Minotaur.hasDetectedPlayer`).
- Combat, objets utilisables depuis l'inventaire, sons, niveaux successifs,
  génération d'icônes PNG dédiées pour la PWA.
