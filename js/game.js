// game.js — Contrôleur principal du jeu.
// Gère l'état, les tours (déplacement joueur puis Minotaure), les événements,
// les points de vie, la mort/relance de niveau et l'inventaire.

import { Maze, TILE } from './maze.js';
import { Player, itemDef } from './player.js';
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
    this.groundItems = new Map();   // objets déposés/lâchés par case ("x,y" -> [{name,qty}])

    this.turn = 0;
    this.over = false;
    this.won = false;
    this.mazeShifted = false;

    // État de combat (modale interactive).
    this.inCombat = false;
    this.combat = null;
    this._combatCell = null;   // case où se déroule le combat
    this._combatReturn = null; // case de repli en cas de fuite réussie

    // Orientation en vue 3D (0=Nord, 1=Est, 2=Sud, 3=Ouest).
    this.facing = this._initFacing();

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

  // Oriente le joueur vers une première case ouverte (pour la vue 3D).
  _initFacing() {
    const order = [1, 2, 3, 0]; // Est, Sud, Ouest, Nord
    const delta = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };
    for (const f of order) {
      const [dx, dy] = delta[f];
      if (this.maze.isFloor(this.player.x + dx, this.player.y + dy)) return f;
    }
    return 1;
  }

  // Direction absolue (up/down/left/right) correspondant à une orientation.
  _facingToDir(f) {
    return ['up', 'right', 'down', 'left'][f];
  }

  // Vue 3D : avancer / reculer (consomment un tour) et pivoter (gratuit).
  forward() { this.move(this._facingToDir(this.facing)); }
  back() { this.move(this._facingToDir((this.facing + 2) % 4)); }
  turnLeft() {
    if (this.over || this.inCombat) return;
    this.facing = (this.facing + 3) % 4;
    this.emit('update');
  }
  turnRight() {
    if (this.over || this.inCombat) return;
    this.facing = (this.facing + 1) % 4;
    this.emit('update');
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
        let msg = `💰 Trésor : ${ev.name}`;
        if (ev.gold) {
          this.player.addGold(ev.gold);
          msg += ` (+${ev.gold} or)`;
        }
        // L'or (pièces, gemme) ne prend pas de place ; les autres objets vont
        // dans le sac. Si le sac est plein, l'objet reste au sol sur la case.
        const isMoney = ev.item === "Pièces d'or" || ev.item === 'Gemme scintillante';
        if (!isMoney) {
          const ok = this.player.addItem(ev.item);
          if (!ok) {
            this._dropOnGround(ev.item, 1, x, y);
            msg += ` — sac plein, ${ev.item} reste au sol`;
          }
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
      const dealt = this.player.damage(dmg);
      const absorbed = dmg - dealt;
      const suffix = absorbed > 0 ? ` (armure -${absorbed})` : '';
      this.emit('log', `🐂 Le Minotaure te charge ! Tu perds ${dealt} PV${suffix}.`);
      this._checkDeath();
    }
  }

  // ---------- Inventaire / équipement (actions de menu, sans tour de jeu) ----------

  // Boit un consommable du sac (par index de pile).
  useItem(index) {
    if (this.over || this.inCombat) return;
    const stack = this.player.bag[index];
    if (!stack) return;
    const def = itemDef(stack.name);
    if (def.kind !== 'consumable' || !def.heal) return;
    if (this.player.hp >= this.player.maxHp) {
      this.emit('log', 'Tes PV sont déjà au maximum.');
      this.emit('update');
      return;
    }
    const before = this.player.hp;
    this.player.heal(def.heal);
    this.player.removeAt(index, 1);
    this.emit('log', `🧪 Tu bois une ${stack.name} (+${this.player.hp - before} PV).`);
    this.emit('update');
  }

  // Équipe l'objet du sac à l'index donné.
  equipItem(index) {
    if (this.over || this.inCombat) return;
    const res = this.player.equip(index);
    if (!res.ok) return;
    let msg = `🧷 Tu équipes ${res.name}.`;
    if (res.replaced) msg += ` (${res.replaced} rangé dans le sac)`;
    this.emit('log', msg);
    this.emit('update');
  }

  // Déséquipe l'emplacement donné (l'objet retourne au sac).
  unequipItem(slotKey) {
    if (this.over || this.inCombat) return;
    const res = this.player.unequip(slotKey);
    if (!res.ok) {
      if (res.reason === 'full') this.emit('log', 'Sac plein : libère une place avant de déséquiper.');
      return;
    }
    this.emit('log', `↩️ Tu retires ${res.name}.`);
    this.emit('update');
  }

  // Jette une unité d'un objet du sac au sol, sur la case actuelle.
  dropItem(index) {
    if (this.over || this.inCombat) return;
    const taken = this.player.removeAt(index, 1);
    if (!taken) return;
    this._dropOnGround(taken.name, taken.qty, this.player.x, this.player.y);
    this.emit('log', `⬇️ Tu déposes ${taken.name} au sol.`);
    this.emit('update');
  }

  // Ramasse un objet posé au sol sur la case actuelle.
  pickUp(name) {
    if (this.over || this.inCombat) return;
    const key = `${this.player.x},${this.player.y}`;
    const arr = this.groundItems.get(key);
    if (!arr) return;
    const i = arr.findIndex((s) => s.name === name);
    if (i < 0) return;
    if (!this.player.addItem(name, 1)) {
      this.emit('log', 'Sac plein : libère une place pour ramasser.');
      this.emit('update');
      return;
    }
    arr[i].qty -= 1;
    if (arr[i].qty <= 0) arr.splice(i, 1);
    if (arr.length === 0) this.groundItems.delete(key);
    this.emit('log', `⬆️ Tu ramasses ${name}.`);
    this.emit('update');
  }

  // Objets au sol sur la case actuelle (pour l'interface).
  groundHere() {
    return this.groundItems.get(`${this.player.x},${this.player.y}`) || [];
  }

  // Dépose un objet au sol sur une case (empile les objets empilables).
  _dropOnGround(name, qty, x, y) {
    const key = `${x},${y}`;
    const arr = this.groundItems.get(key) || [];
    const def = itemDef(name);
    const existing = def.stack ? arr.find((s) => s.name === name) : null;
    if (existing) existing.qty += qty;
    else arr.push({ name, qty });
    this.groundItems.set(key, arr);
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
