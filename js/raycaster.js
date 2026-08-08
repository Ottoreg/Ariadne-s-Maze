// raycaster.js — Rendu 3D « à la Doom » (raycasting façon Wolfenstein 3D).
//
// Le labyrinthe étant une grille de murs, on lance un rayon par colonne de
// l'écran, on avance dans la grille (DDA) jusqu'au premier mur, et on dessine
// une tranche verticale d'autant plus haute que le mur est proche. Les entités
// (Minotaure, sortie, objets au sol) sont dessinées en « sprites » (billboards)
// avec un tampon de profondeur pour l'occlusion par les murs.
//
// Le jeu reste au tour par tour, calé sur la grille : le rendu interpole
// simplement la position et l'angle pour un déplacement/rotation fluides.

import { TILE } from './maze.js';

// Couleurs de terrain (teinte des murs et du sol selon la zone).
const TERR_COLORS = {
  stone: '#6b7280', grass: '#4d7c4d', sand: '#c2a56b', mud: '#6b5334', water: '#3b6ea5',
};

const FOG_DIST = 9;      // distance à laquelle tout devient noir
const COL_WIDTH = 4;     // largeur d'une colonne de rendu (pixellisation rétro)
const EASE = 0.22;       // vitesse d'interpolation position/rotation

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fov = Math.PI / 3; // 60°
    // État interpolé (position caméra + angle).
    this.px = null;
    this.py = null;
    this.angle = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = rect.width;
    this.viewH = rect.height;
  }

  // Angle cible (radians) pour une direction cardinale (0=N,1=E,2=S,3=O).
  _targetAngle(facing) {
    return [-Math.PI / 2, 0, Math.PI / 2, Math.PI][facing];
  }

  draw(game) {
    const ctx = this.ctx;
    const maze = game.maze;
    const p = game.player;

    // Cibles (centre de la case) et interpolation douce.
    const tx = p.x + 0.5;
    const ty = p.y + 0.5;
    const ta = this._targetAngle(game.facing);
    if (this.px === null) { this.px = tx; this.py = ty; this.angle = ta; }
    this.px += (tx - this.px) * EASE;
    this.py += (ty - this.py) * EASE;
    let da = ta - this.angle;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    this.angle += da * EASE;

    const W = this.viewW;
    const H = this.viewH;
    const px = this.px, py = this.py, ang = this.angle;

    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    const planeMag = Math.tan(this.fov / 2);
    const planeX = -dirY * planeMag, planeY = dirX * planeMag;

    // --- Ciel / sol ---
    const ceil = ctx.createLinearGradient(0, 0, 0, H / 2);
    ceil.addColorStop(0, '#07070d');
    ceil.addColorStop(1, '#191922');
    ctx.fillStyle = ceil;
    ctx.fillRect(0, 0, W, H / 2);

    const groundTerr = maze.terrainAt(Math.floor(px), Math.floor(py)) || 'stone';
    const fc = TERR_COLORS[groundTerr] || '#3a3320';
    const floor = ctx.createLinearGradient(0, H / 2, 0, H);
    floor.addColorStop(0, shade(fc, -0.55));
    floor.addColorStop(1, shade(fc, -0.8));
    ctx.fillStyle = floor;
    ctx.fillRect(0, H / 2, W, H / 2);

    // --- Murs (raycasting DDA) ---
    const cols = Math.ceil(W / COL_WIDTH);
    const zBuffer = new Array(cols);

    for (let c = 0; c < cols; c++) {
      const cameraX = (2 * c) / cols - 1;
      const rayX = dirX + planeX * cameraX;
      const rayY = dirY + planeY * cameraX;

      let mapX = Math.floor(px), mapY = Math.floor(py);
      const deltaX = Math.abs(rayX) < 1e-9 ? 1e30 : Math.abs(1 / rayX);
      const deltaY = Math.abs(rayY) < 1e-9 ? 1e30 : Math.abs(1 / rayY);

      let stepX, stepY, sideDistX, sideDistY;
      if (rayX < 0) { stepX = -1; sideDistX = (px - mapX) * deltaX; }
      else { stepX = 1; sideDistX = (mapX + 1 - px) * deltaX; }
      if (rayY < 0) { stepY = -1; sideDistY = (py - mapY) * deltaY; }
      else { stepY = 1; sideDistY = (mapY + 1 - py) * deltaY; }

      let side = 0, hit = false, guard = 0;
      while (!hit && guard++ < 64) {
        if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0; }
        else { sideDistY += deltaY; mapY += stepY; side = 1; }
        if (!maze.inBounds(mapX, mapY) || maze.grid[mapY][mapX] === TILE.WALL) hit = true;
      }

      const perp = side === 0 ? sideDistX - deltaX : sideDistY - deltaY;
      const dist = Math.max(0.05, perp);
      zBuffer[c] = dist;

      // Point d'impact sur la face du mur (0..1) pour le motif de briques.
      let wallX = side === 0 ? py + perp * rayY : px + perp * rayX;
      wallX -= Math.floor(wallX);

      // Teinte du mur : terrain de la case adjacente mêlé à de la pierre.
      const fx = side === 0 ? mapX - stepX : mapX;
      const fy = side === 1 ? mapY - stepY : mapY;
      const terr = maze.terrainAt(fx, fy) || 'stone';
      let col = mix(TERR_COLORS[terr] || '#6b7280', '#5a5a66', 0.5);

      // Éclairage : distance (brume) + face (N/S plus sombre) + joints.
      let bright = Math.max(0.12, 1 - dist / FOG_DIST);
      if (side === 1) bright *= 0.72;
      const seam = wallX * 4;
      if (seam - Math.floor(seam) < 0.06) bright *= 0.6; // joints verticaux
      col = shade(col, bright - 1);

      const lineH = H / dist;
      let y0 = H / 2 - lineH / 2;
      let y1 = H / 2 + lineH / 2;
      ctx.fillStyle = col;
      ctx.fillRect(c * COL_WIDTH, y0, COL_WIDTH + 1, y1 - y0);
    }

    // Pendant un combat, on fige le décor (pas de sprites monde ni minimap) :
    // le monstre et l'interface sont gérés en surimpression HTML.
    if (game.inCombat) return;

    // --- Sprites (Minotaure, sortie, objets au sol) ---
    const sprites = this._collectSprites(game);
    // Distance au carré pour trier du plus loin au plus proche.
    for (const s of sprites) {
      s.d = (s.x - px) * (s.x - px) + (s.y - py) * (s.y - py);
    }
    sprites.sort((a, b) => b.d - a.d);

    const invDet = 1 / (planeX * dirY - dirX * planeY);
    for (const s of sprites) {
      const relX = s.x - px, relY = s.y - py;
      const transformX = invDet * (dirY * relX - dirX * relY);
      const transformY = invDet * (-planeY * relX + planeX * relY); // profondeur
      if (transformY <= 0.15) continue;

      const screenX = (W / 2) * (1 + transformX / transformY);
      const spriteH = Math.abs(H / transformY) * s.scale;
      const yShift = s.low ? spriteH * 0.35 : 0;
      const cy = H / 2 + yShift;

      // Occlusion : la colonne centrale doit être devant le mur.
      const centerCol = Math.floor(screenX / COL_WIDTH);
      if (centerCol < 0 || centerCol >= cols) continue;
      if (transformY >= zBuffer[centerCol]) continue;

      const bright = Math.max(0.25, 1 - transformY / FOG_DIST);
      ctx.save();
      if (s.kind === 'chest') {
        this._drawChest(ctx, screenX, cy, spriteH, bright);
      } else {
        ctx.globalAlpha = Math.min(1, bright + 0.1);
        ctx.fillStyle = shade(s.color, bright - 1);
        ctx.beginPath();
        ctx.ellipse(screenX, cy, spriteH * 0.34, spriteH * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = bright;
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.floor(spriteH * 0.55)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.glyph, screenX, cy);
      }
      ctx.restore();
    }

    // --- Minimap ---
    this._drawMinimap(game);
  }

  _collectSprites(game) {
    const maze = game.maze;
    const list = [];
    // Sortie : balise lumineuse.
    list.push({ x: maze.exit.x + 0.5, y: maze.exit.y + 0.5, color: '#ffd166', glyph: '⚑', scale: 0.95 });
    // Minotaure (visible s'il a déjà été aperçu ou s'il poursuit).
    const m = game.minotaur;
    if (game.visited[m.y][m.x] || m.chasing) {
      list.push({ x: m.x + 0.5, y: m.y + 0.5, color: '#c0392b', glyph: '🐂', scale: 1.05 });
    }
    // Objets déposés au sol : petit coffre.
    for (const key of game.groundItems.keys()) {
      const [gx, gy] = key.split(',').map(Number);
      list.push({ x: gx + 0.5, y: gy + 0.5, kind: 'chest', scale: 0.5, low: true });
    }
    return list;
  }

  // Dessine un petit coffre (billboard) à l'écran.
  _drawChest(ctx, cx, cy, spriteH, bright) {
    const w = spriteH * 0.62;
    const h = spriteH * 0.4;
    const x = cx - w / 2;
    const y = cy - h / 2 + spriteH * 0.06;
    const body = shade('#8a5a2b', bright - 1);
    const lid = shade('#a56b33', bright - 1);
    const band = shade('#4a2f16', bright - 1);
    const gold = shade('#ffd166', bright - 1);
    // Corps.
    ctx.fillStyle = body;
    ctx.fillRect(x, y, w, h);
    // Couvercle bombé.
    ctx.fillStyle = lid;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cx, y - h * 0.55, x + w, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x, y);
    ctx.fill();
    ctx.fillRect(x, y - 1, w, h * 0.18);
    // Ferrures verticales + serrure.
    ctx.fillStyle = band;
    ctx.fillRect(x + w * 0.44, y - h * 0.5, w * 0.12, h * 1.5);
    ctx.fillStyle = gold;
    ctx.fillRect(x + w * 0.45, y + h * 0.28, w * 0.1, h * 0.28);
    // Contour.
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  // Minimap compacte en bas à droite.
  _drawMinimap(game) {
    const ctx = this.ctx;
    const maze = game.maze;
    const size = maze.size;
    const cell = Math.max(2, Math.floor(120 / size));
    const dim = cell * size;
    const ox = this.viewW - dim - 16;
    const oy = this.viewH - dim - 16;

    ctx.save();
    ctx.globalAlpha = 0.85;
    // Fond.
    ctx.fillStyle = 'rgba(10,10,16,0.7)';
    ctx.fillRect(ox - 4, oy - 4, dim + 8, dim + 8);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!game.visited[y][x]) continue;
        const sx = ox + x * cell, sy = oy + y * cell;
        if (maze.grid[y][x] === TILE.WALL) {
          ctx.fillStyle = '#2a2a35';
        } else {
          ctx.fillStyle = TERR_COLORS[maze.terrainAt(x, y)] || '#555';
        }
        ctx.fillRect(sx, sy, cell, cell);
      }
    }

    // Sortie.
    if (game.visited[maze.exit.y][maze.exit.x]) {
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(ox + maze.exit.x * cell, oy + maze.exit.y * cell, cell, cell);
    }
    // Minotaure (si aperçu).
    const m = game.minotaur;
    if (game.visited[m.y][m.x] || m.chasing) {
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(ox + m.x * cell, oy + m.y * cell, cell, cell);
    }
    // Joueur : triangle orienté selon l'angle.
    const cx = ox + (game.player.x + 0.5) * cell;
    const cy = oy + (game.player.y + 0.5) * cell;
    const a = this.angle;
    const r = cell * 1.3;
    ctx.fillStyle = '#2ec4b6';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a + 2.5) * r * 0.7, cy + Math.sin(a + 2.5) * r * 0.7);
    ctx.lineTo(cx + Math.cos(a - 2.5) * r * 0.7, cy + Math.sin(a - 2.5) * r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// --- Utilitaires couleur ---

function parseHex(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function toHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
// Éclaircit (amount>0) ou assombrit (amount<0) une couleur, amount ∈ [-1,1].
function shade(hex, amount) {
  const [r, g, b] = parseHex(hex);
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  return toHex([r + (t - r) * p, g + (t - g) * p, b + (t - b) * p]);
}
// Mélange deux couleurs (t = part de la seconde).
function mix(a, b, t) {
  const A = parseHex(a), B = parseHex(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
