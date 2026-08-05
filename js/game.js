// game.js — Contrôleur principal du jeu.
// Gère l'état, les tours (déplacement joueur puis Minotaure), les événements,
// les points de vie, la mort/relance de niveau et l'inventaire.

import { Maze, TILE } from './maze.js';
import { Player } from './player.js';
import { Minotaur } from './minotaur.js';
import { computeEvent, EVENT } from './events.js';
import { RNG } from './rng.js';

export class Game {
  constructor(seed, size = 21) {
    this.size = size;
    this.listeners = {};
    this.load(seed);
  }

  // (Re)charge un niveau à partir d'une seed.
  load(seed) {
    this.seed = String(seed);
    this.maze = new Maze(this.seed, this.size);
    this.rng = new RNG(`play:${this.seed}`); // RNG des déplacements du Minotaure

    const start = this.maze.entrance;
    this.player = new Player(start.x, start.y);

    // Place le Minotaure loin du joueur (vers la sortie).
    const mstart = this._farStart(start);
    this.minotaur = new Minotaur(mstart.x, mstart.y);

    // Cases explorées et événements déjà révélés.
    this.visited = Array.from({ length: this.maze.size }, () =>
      new Array(this.maze.size).fill(false)
    );
    this.revealedEvents = new Map();
    this.resolvedCells = new Set(); // cases dont l'événement est déjà déclenché

    this.turn = 0;
    this.over = false;
    this.won = false;
    this.mazeShifted = false;

    this._reveal(this.player.x, this.player.y);
    this._resolveEvent(this.player.x, this.player.y, true); // entrée = sûre
    this.emit('log', `Bienvenue dans le labyrinthe (seed : ${this.seed}). Trouve la sortie ⚑ !`);
    this.emit('update');
  }

  // Recommence le niveau courant (même seed).
  restart() {
    this.load(this.seed);
  }

  // Trouve une case praticable éloignée de `from` pour y placer le Minotaure.
  _farStart(from) {
    const cells = this.maze.floorCells();
    let best = this.maze.exit;
    let bestDist = -1;
    for (const c of cells) {
      const d = Math.abs(c.x - from.x) + Math.abs(c.y - from.y);
      if (d > bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  // --- Système d'événements minimal (émetteur) ---
  on(event, fn) {
    (this.listeners[event] = this.listeners[event] || []).push(fn);
  }
  emit(event, payload) {
    (this.listeners[event] || []).forEach((fn) => fn(payload));
  }

  // Déplacement du joueur d'une case. dir ∈ {up,down,left,right}.
  move(dir) {
    if (this.over) return;
    const deltas = {
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
    };
    const d = deltas[dir];
    if (!d) return;

    const nx = this.player.x + d.dx;
    const ny = this.player.y + d.dy;
    if (this.maze.grid[ny] === undefined || this.maze.grid[ny][nx] === undefined) return;
    if (this.maze.grid[ny][nx] === TILE.WALL) {
      return; // mur : déplacement impossible
    }

    this.player.x = nx;
    this.player.y = ny;
    this.turn++;
    this._reveal(nx, ny);

    // Résout l'événement de la case d'arrivée.
    this._resolveEvent(nx, ny);

    // Victoire : atteinte de la sortie.
    if (nx === this.maze.exit.x && ny === this.maze.exit.y && !this.over) {
      this.won = true;
      this.over = true;
      this.emit('log', '🎉 Tu as trouvé la sortie ! Niveau terminé.');
      this.emit('gameover', { won: true });
      this.emit('update');
      return;
    }

    // Tour du Minotaure.
    if (!this.over) this._minotaurTurn();

    this.emit('update');
  }

  // Révèle la case et ses voisines immédiates (petit champ de vision).
  _reveal(x, y) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const vx = x + dx;
        const vy = y + dy;
        if (this.maze.inBounds(vx, vy)) this.visited[vy][vx] = true;
      }
    }
  }

  // Déclenche l'événement de la case (une seule fois par case).
  _resolveEvent(x, y, silent = false) {
    const key = `${x},${y}`;
    if (this.resolvedCells.has(key)) return;
    this.resolvedCells.add(key);

    const ev = computeEvent(this.maze, x, y);
    if (ev.type !== EVENT.NONE) this.revealedEvents.set(key, ev);
    if (silent || ev.type === EVENT.NONE) return;

    switch (ev.type) {
      case EVENT.TRAP: {
        this.player.damage(ev.damage);
        this.emit('log', `⚠️ Piège : ${ev.name} ! Tu perds ${ev.damage} PV.`);
        break;
      }
      case EVENT.MONSTER: {
        this.player.damage(ev.damage);
        this.emit('log', `⚔️ Rencontre : ${ev.name} t'inflige ${ev.damage} PV de dégâts.`);
        break;
      }
      case EVENT.TREASURE: {
        this.player.addItem(ev.item);
        let msg = `💰 Trésor : ${ev.name}`;
        if (ev.gold) {
          this.player.addGold(ev.gold);
          msg += ` (+${ev.gold} or)`;
        }
        if (ev.heal) {
          this.player.heal(ev.heal);
          msg += ` (+${ev.heal} PV)`;
        }
        this.emit('log', msg + ' !');
        break;
      }
    }

    this._checkDeath();
  }

  // Fait jouer le Minotaure et gère la détection / le contact.
  _minotaurTurn() {
    const res = this.minotaur.step(this.maze, this.player, this.rng);

    if (res.firstDetection) {
      this.emit('log', '👁️ Le Minotaure a flairé ta présence... Il te poursuit !');
      this._onFirstDetection();
    }

    if (res.contact) {
      const [min, max] = this.minotaur.contactDamage;
      const dmg = this.rng.int(min, max);
      this.player.damage(dmg);
      this.emit('log', `🐂 Le Minotaure te charge ! Tu perds ${dmg} PV.`);
      this._checkDeath();
    }
  }

  // Crochet déclenché à la toute première détection par le Minotaure.
  // (Fonctionnalité future : reconfiguration du labyrinthe. Ici, simple signal.)
  _onFirstDetection() {
    this.mazeShifted = false; // prêt à être activé plus tard
    this.emit('detected');
  }

  _checkDeath() {
    if (!this.player.isAlive() && !this.over) {
      this.over = true;
      this.emit('log', '💀 Tu es mort. Le niveau recommence...');
      this.emit('gameover', { won: false });
    }
  }
}
