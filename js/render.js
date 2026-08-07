// render.js — Rendu du jeu sur un canvas 2D en vue de dessus (topdown).
// Une caméra suit le joueur. Les cases déjà visitées sont mémorisées pour
// dessiner un léger "brouillard" sur les zones non explorées.

import { TILE, TERRAIN } from './maze.js';
import { EVENT } from './events.js';

const TILE_SIZE = 40; // taille d'une case en pixels

// Palette de couleurs par terrain.
const TERRAIN_COLORS = {
  [TERRAIN.STONE]: '#6b7280',
  [TERRAIN.GRASS]: '#4d7c4d',
  [TERRAIN.SAND]: '#c2a56b',
  [TERRAIN.MUD]: '#6b5334',
  [TERRAIN.WATER]: '#3b6ea5',
};

const WALL_COLOR = '#2a2a35';
const WALL_TOP = '#3a3a48';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tileSize = TILE_SIZE;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    // Adapte le canvas à son conteneur avec la densité de pixels de l'écran.
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = rect.width;
    this.viewH = rect.height;
  }

  // Dessine une frame complète.
  draw(game) {
    const ctx = this.ctx;
    const ts = this.tileSize;
    const maze = game.maze;
    const player = game.player;

    // Caméra centrée sur le joueur.
    const camX = player.x * ts + ts / 2 - this.viewW / 2;
    const camY = player.y * ts + ts / 2 - this.viewH / 2;

    ctx.clearRect(0, 0, this.viewW, this.viewH);
    ctx.fillStyle = '#15151c';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // Détermine la plage de cases visibles pour ne dessiner que le nécessaire.
    const startCol = Math.max(0, Math.floor(camX / ts));
    const endCol = Math.min(maze.size - 1, Math.ceil((camX + this.viewW) / ts));
    const startRow = Math.max(0, Math.floor(camY / ts));
    const endRow = Math.min(maze.size - 1, Math.ceil((camY + this.viewH) / ts));

    for (let y = startRow; y <= endRow; y++) {
      for (let x = startCol; x <= endCol; x++) {
        const sx = Math.round(x * ts - camX);
        const sy = Math.round(y * ts - camY);
        const visited = game.visited[y][x];

        if (maze.grid[y][x] === TILE.WALL) {
          ctx.fillStyle = WALL_COLOR;
          ctx.fillRect(sx, sy, ts, ts);
          ctx.fillStyle = WALL_TOP;
          ctx.fillRect(sx, sy, ts, 4);
        } else {
          const terrain = maze.terrainAt(x, y);
          ctx.fillStyle = TERRAIN_COLORS[terrain] || '#555';
          ctx.fillRect(sx, sy, ts, ts);
          // Léger quadrillage.
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);

          // Marqueur d'événement révélé sur les cases déjà visitées.
          const ev = game.revealedEvents.get(`${x},${y}`);
          if (ev && ev.type !== EVENT.NONE) {
            this._drawEventMarker(ctx, sx, sy, ts, ev);
          }

          // Marqueur d'objets déposés au sol.
          if (game.groundItems && game.groundItems.has(`${x},${y}`)) {
            this._drawGroundMarker(ctx, sx, sy, ts);
          }
        }

        // Entrée et sortie.
        if (x === maze.entrance.x && y === maze.entrance.y) {
          this._drawGlyph(ctx, sx, sy, ts, '⌂', '#e8e8f0');
        }
        if (x === maze.exit.x && y === maze.exit.y) {
          this._drawGlyph(ctx, sx, sy, ts, '⚑', '#ffe066');
        }

        // Brouillard sur les cases non encore visitées.
        if (!visited) {
          ctx.fillStyle = 'rgba(6,6,10,0.55)';
          ctx.fillRect(sx, sy, ts, ts);
        }
      }
    }

    // Minotaure (dessiné seulement s'il a déjà été aperçu).
    const mino = game.minotaur;
    if (game.visited[mino.y][mino.x] || mino.chasing) {
      this._drawEntity(ctx, mino.x, mino.y, ts, camX, camY, '#c0392b', '🐂');
    }

    // Joueur.
    this._drawEntity(ctx, player.x, player.y, ts, camX, camY, '#2ec4b6', '🗡');
  }

  _drawEntity(ctx, x, y, ts, camX, camY, color, glyph) {
    const sx = Math.round(x * ts - camX);
    const sy = Math.round(y * ts - camY);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx + ts / 2, sy + ts / 2, ts * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${Math.floor(ts * 0.5)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, sx + ts / 2, sy + ts / 2 + 1);
  }

  _drawEventMarker(ctx, sx, sy, ts, ev) {
    const colors = {
      [EVENT.TRAP]: '#e07a5f',
      [EVENT.MONSTER]: '#b5179e',
      [EVENT.TREASURE]: '#ffd166',
    };
    ctx.fillStyle = colors[ev.type] || '#fff';
    ctx.beginPath();
    ctx.arc(sx + ts / 2, sy + ts / 2, ts * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  // Petit sac au sol : carré ambré posé en bas de la case.
  _drawGroundMarker(ctx, sx, sy, ts) {
    const s = ts * 0.22;
    const x = sx + ts / 2 - s / 2;
    const y = sy + ts - s - ts * 0.14;
    ctx.fillStyle = '#d9a441';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, s, s);
    ctx.strokeRect(x, y, s, s);
  }

  _drawGlyph(ctx, sx, sy, ts, glyph, color) {
    ctx.fillStyle = color;
    ctx.font = `${Math.floor(ts * 0.6)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, sx + ts / 2, sy + ts / 2 + 1);
  }
}
