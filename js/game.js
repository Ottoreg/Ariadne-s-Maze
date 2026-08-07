// game.js — Contrôleur principal du jeu.
// Gère l'état, les tours (déplacement joueur puis Minotaure), les événements,
// les points de vie, la mort/relance de niveau et l'inventaire.

import { Maze, TILE } from './maze.js';
import { Player, CONSUMABLES } from './player.js';
import { Minotaur } from './minotaur.js';
import { computeEvent, EVENT } from './events.js';
import { Combat } from './combat.js';
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

    // État de combat (modale interactive).
    this.inCombat = false;
    this.combat = null;
    this._combatCell = null;   // case où se déroule le combat
    this._combatReturn = null; // case de repli en cas de fuite réussie

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
    if (this.over || this.inCombat) return;
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

    // Case d'où l'on vient (repli en cas de fuite d'un combat).
    this._combatReturn = { x: this.player.x, y: this.player.y };

    this.player.x = nx;
    this.player.y = ny;
    this.turn++;
    this._reveal(nx, ny);

    // Résout l'événement de la case d'arrivée. Peut déclencher un combat :
    // dans ce cas le « monde » se met en pause (le Minotaure attend la fin).
    this._resolveEvent(nx, ny);
    if (this.inCombat) {
      this.emit('update');
      return;
    }

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

  // Action « Attendre » : passe un tour sans bouger.
  // Le Minotaure, lui, se déplace : utile tactiquement (le laisser passer,
  // guetter, etc.). Sert de bouton d'action principal sur mobile.
  wait() {
    if (this.over || this.inCombat) return;
    this.turn++;
    this.emit('log', '⏳ Tu attends, aux aguets...');
    this._minotaurTurn();
    this.emit('update');
  }

  // ---------- Combat (modale interactive) ----------

  // Démarre un combat contre le monstre de la case (x, y).
  _startCombat(ev, x, y) {
    this.inCombat = true;
    this._combatCell = { x, y };
    const enemy = {
      name: ev.name,
      emoji: ev.emoji,
      maxHp: ev.hp,
      hp: ev.hp,
      dmg: ev.dmg,
      hitChance: ev.hit,
    };
    this.combat = new Combat(this.player, enemy, this.rng);
    this.emit('log', `⚔️ Un ${ev.name} surgit !`);
    this.emit('combat-start', this.combat);
  }

  // Actions déclenchées par l'interface pendant un combat.
  combatAttack() { this._combatAction('attack'); }
  combatParry() { this._combatAction('parry'); }
  combatFlee() { this._combatAction('flee'); }

  _combatAction(kind) {
    if (!this.inCombat || !this.combat || this.combat.over) return;
    const c = this.combat;
    if (kind === 'attack') c.attack();
    else if (kind === 'parry') c.parry();
    else if (kind === 'flee') c.flee();

    this.emit('combat-update', c);
    if (c.over) this._endCombat(c);
  }

  // Applique les conséquences de la fin du combat, puis relance le « monde ».
  _endCombat(c) {
    this.inCombat = false;
    const cell = this._combatCell;
    const key = `${cell.x},${cell.y}`;

    if (c.result === 'win') {
      // Le monstre disparaît : on retire son marqueur, la case reste résolue.
      this.revealedEvents.delete(key);
      const loot = this.rng.int(2, 6);
      this.player.addGold(loot);
      this.emit('log', `🏆 ${c.enemy.name} vaincu ! Tu récupères ${loot} or.`);
      this._resumeWorld();
    } else if (c.result === 'flee') {
      // On autorise un futur combat sur cette case et on recule d'une case.
      this.resolvedCells.delete(key);
      if (this._combatReturn) {
        this.player.x = this._combatReturn.x;
        this.player.y = this._combatReturn.y;
      }
      this._resumeWorld();
    } else if (c.result === 'lose') {
      this.emit('log', `💀 ${c.enemy.name} a eu raison de toi...`);
      this._checkDeath();
    }

    this.combat = null;
    this._combatCell = null;
    this.emit('combat-end', c);
    this.emit('update');
  }

  // Le Minotaure joue le tour mis en pause pendant le combat.
  _resumeWorld() {
    if (!this.over) this._minotaurTurn();
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
        const dealt = this.player.damage(ev.damage);
        const absorbed = ev.damage - dealt;
        const suffix = absorbed > 0 ? ` (armure -${absorbed})` : '';
        this.emit('log', `⚠️ Piège : ${ev.name} ! Tu perds ${dealt} PV${suffix}.`);
        break;
      }
      case EVENT.MONSTER: {
        // Une rencontre déclenche un combat en modale (au lieu de dégâts secs).
        this._startCombat(ev, x, y);
        return; // le combat prend le relais ; on ne vérifie pas la mort ici
      }
      case EVENT.TREASURE: {
        this.player.addItem(ev.item);
        let msg = `💰 Trésor : ${ev.name}`;
        if (ev.gold) {
          this.player.addGold(ev.gold);
          msg += ` (+${ev.gold} or)`;
        }
        // Les potions ne se boivent plus automatiquement : elles vont dans le
        // sac et se consomment depuis l'inventaire (voir useItem).
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
      const dealt = this.player.damage(dmg);
      const absorbed = dmg - dealt;
      const suffix = absorbed > 0 ? ` (armure -${absorbed})` : '';
      this.emit('log', `🐂 Le Minotaure te charge ! Tu perds ${dealt} PV${suffix}.`);
      this._checkDeath();
    }
  }

  // Utilise un objet consommable de l'inventaire (potion de soin).
  // Action de menu : n'avance pas le tour du monde.
  useItem(name) {
    if (this.over || this.inCombat) return;
    const def = CONSUMABLES[name];
    if (!def || !this.player.inventory.get(name)) return;
    if (this.player.hp >= this.player.maxHp) {
      this.emit('log', 'Tes PV sont déjà au maximum.');
      this.emit('update');
      return;
    }
    const before = this.player.hp;
    this.player.heal(def.heal);
    this.player.removeItem(name);
    const gained = this.player.hp - before;
    this.emit('log', `🧪 Tu bois une ${name} (+${gained} PV).`);
    this.emit('update');
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
