// minotaur.js — Le Minotaure : ennemi mobile qui patrouille le labyrinthe.
//
// Comportement de base :
//   - S'il n'a pas repéré le joueur, il patrouille au hasard.
//   - S'il repère le joueur (dans son rayon de détection et à portée),
//     il le poursuit en se rapprochant case par case.
//   - Le contact avec le joueur inflige de gros dégâts.
//
// La première détection déclenche un drapeau (`hasDetectedPlayer`) qui pourra
// plus tard servir à reconfigurer le labyrinthe (fonctionnalité future).

import { TILE } from './maze.js';

export class Minotaur {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.detectionRadius = 5; // portée de détection (distance de Manhattan)
    this.hasDetectedPlayer = false; // vrai dès la première détection
    this.chasing = false;
    this.contactDamage = [4, 8]; // dégâts au contact du joueur
  }

  // Distance de Manhattan jusqu'à un point.
  distanceTo(x, y) {
    return Math.abs(this.x - x) + Math.abs(this.y - y);
  }

  // Détecte le joueur s'il est assez proche. Renvoie true si première détection.
  senses(player) {
    const inRange = this.distanceTo(player.x, player.y) <= this.detectionRadius;
    this.chasing = inRange;
    if (inRange && !this.hasDetectedPlayer) {
      this.hasDetectedPlayer = true;
      return true; // première détection => à signaler
    }
    return false;
  }

  // Effectue un pas. `rng` est le RNG principal du jeu (déplacements aléatoires).
  // Renvoie l'événement produit ({ firstDetection, contact }).
  step(maze, player, rng) {
    const firstDetection = this.senses(player);

    let move;
    if (this.chasing) {
      move = this._chaseStep(maze, player);
    } else {
      move = this._wanderStep(maze, rng);
    }

    if (move) {
      this.x = move.x;
      this.y = move.y;
    }

    const contact = this.x === player.x && this.y === player.y;
    return { firstDetection, contact };
  }

  // Renvoie les cases praticables adjacentes.
  _freeNeighbors(maze) {
    const dirs = [
      { x: this.x, y: this.y - 1 },
      { x: this.x + 1, y: this.y },
      { x: this.x, y: this.y + 1 },
      { x: this.x - 1, y: this.y },
    ];
    return dirs.filter((c) => maze.isFloor(c.x, c.y));
  }

  // Poursuite : choisit la case adjacente qui réduit la distance au joueur.
  _chaseStep(maze, player) {
    const options = this._freeNeighbors(maze);
    if (options.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (const c of options) {
      const d = Math.abs(c.x - player.x) + Math.abs(c.y - player.y);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  // Errance : déplacement aléatoire, en évitant de faire du surplace.
  _wanderStep(maze, rng) {
    const options = this._freeNeighbors(maze);
    if (options.length === 0) return null;
    return options[rng.int(0, options.length - 1)];
  }
}
