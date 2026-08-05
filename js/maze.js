// maze.js — Génération du labyrinthe et des types de sol (terrains).
// Le labyrinthe est produit par un algorithme "recursive backtracker"
// (parcours en profondeur), entièrement déterministe grâce au RNG seedé.

import { RNG, cellRandom } from './rng.js';

// Types de cases du labyrinthe.
export const TILE = {
  WALL: 0,
  FLOOR: 1,
};

// Types de sol (terrain) pour les cases praticables.
// Ils influencent la nature des événements des cases alentours.
export const TERRAIN = {
  STONE: 'stone', // neutre
  GRASS: 'grass', // favorise les trésors / soins
  SAND: 'sand',   // favorise les monstres
  MUD: 'mud',     // favorise les pièges
  WATER: 'water', // calme, peu d'événements
};

export const TERRAIN_LIST = [
  TERRAIN.STONE,
  TERRAIN.GRASS,
  TERRAIN.SAND,
  TERRAIN.MUD,
  TERRAIN.WATER,
];

// Génère un labyrinthe carré de taille impaire (murs sur les cases paires).
// Retourne un objet Maze avec la grille, les terrains, l'entrée et la sortie.
export class Maze {
  constructor(seed, size = 21) {
    // Garantit une taille impaire pour l'algorithme de labyrinthe parfait.
    this.seed = seed;
    this.size = size % 2 === 0 ? size + 1 : size;
    this.rng = new RNG(`maze:${seed}`);
    this.grid = [];
    this.terrain = [];
    this.entrance = { x: 1, y: 1 };
    this.exit = { x: this.size - 2, y: this.size - 2 };
    this._generate();
    this._assignTerrain();
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  isWall(x, y) {
    if (!this.inBounds(x, y)) return true;
    return this.grid[y][x] === TILE.WALL;
  }

  isFloor(x, y) {
    return this.inBounds(x, y) && this.grid[y][x] === TILE.FLOOR;
  }

  terrainAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    return this.terrain[y][x];
  }

  // Recursive backtracker : creuse des couloirs à partir de l'entrée.
  _generate() {
    const n = this.size;
    // Tout en mur au départ.
    this.grid = Array.from({ length: n }, () => new Array(n).fill(TILE.WALL));

    const start = this.entrance;
    this.grid[start.y][start.x] = TILE.FLOOR;

    const stack = [start];
    const dirs = [
      { dx: 0, dy: -2 },
      { dx: 2, dy: 0 },
      { dx: 0, dy: 2 },
      { dx: -2, dy: 0 },
    ];

    while (stack.length) {
      const cur = stack[stack.length - 1];
      // Voisins non visités à distance 2 (au-delà d'un mur).
      const neighbors = [];
      for (const d of dirs) {
        const nx = cur.x + d.dx;
        const ny = cur.y + d.dy;
        if (nx > 0 && ny > 0 && nx < n - 1 && ny < n - 1 && this.grid[ny][nx] === TILE.WALL) {
          neighbors.push({ nx, ny, wx: cur.x + d.dx / 2, wy: cur.y + d.dy / 2 });
        }
      }

      if (neighbors.length === 0) {
        stack.pop();
        continue;
      }

      const chosen = neighbors[this.rng.int(0, neighbors.length - 1)];
      // Perce le mur intermédiaire puis la case cible.
      this.grid[chosen.wy][chosen.wx] = TILE.FLOOR;
      this.grid[chosen.ny][chosen.nx] = TILE.FLOOR;
      stack.push({ x: chosen.nx, y: chosen.ny });
    }

    // Assure que la sortie est bien praticable.
    this.grid[this.exit.y][this.exit.x] = TILE.FLOOR;

    // Ajoute quelques boucles pour éviter un labyrinthe trop "parfait"
    // (rend le déplacement et la fuite face au Minotaure plus intéressants).
    const extra = Math.floor((n * n) / 40);
    for (let i = 0; i < extra; i++) {
      const x = this.rng.int(1, n - 2);
      const y = this.rng.int(1, n - 2);
      if (this.grid[y][x] === TILE.WALL) {
        // N'ouvre que si cela relie deux couloirs (évite les murs isolés).
        const openH = this.isFloor(x - 1, y) && this.isFloor(x + 1, y);
        const openV = this.isFloor(x, y - 1) && this.isFloor(x, y + 1);
        if (openH || openV) this.grid[y][x] = TILE.FLOOR;
      }
    }
  }

  // Attribue un terrain à chaque case praticable de façon déterministe.
  // On utilise un bruit par blocs pour créer des "zones" cohérentes plutôt
  // qu'un terrain totalement aléatoire case par case.
  _assignTerrain() {
    const n = this.size;
    this.terrain = Array.from({ length: n }, () => new Array(n).fill(null));
    const blockSize = 4; // taille des zones de terrain
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (this.grid[y][x] !== TILE.FLOOR) continue;
        const bx = Math.floor(x / blockSize);
        const by = Math.floor(y / blockSize);
        // Terrain de base de la zone.
        const zoneRoll = cellRandom(this.seed, bx, by, 7)();
        let t;
        if (zoneRoll < 0.4) t = TERRAIN.STONE;
        else if (zoneRoll < 0.6) t = TERRAIN.GRASS;
        else if (zoneRoll < 0.75) t = TERRAIN.SAND;
        else if (zoneRoll < 0.9) t = TERRAIN.MUD;
        else t = TERRAIN.WATER;

        // Petite variation locale pour casser l'uniformité des blocs.
        const localRoll = cellRandom(this.seed, x, y, 11)();
        if (localRoll < 0.12) {
          t = TERRAIN_LIST[Math.floor(cellRandom(this.seed, x, y, 13)() * TERRAIN_LIST.length)];
        }
        this.terrain[y][x] = t;
      }
    }
    // L'entrée est toujours un sol sûr et neutre.
    this.terrain[this.entrance.y][this.entrance.x] = TERRAIN.STONE;
  }

  // Liste toutes les cases praticables (utile pour placer joueur/minotaure).
  floorCells() {
    const cells = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.grid[y][x] === TILE.FLOOR) cells.push({ x, y });
      }
    }
    return cells;
  }
}
