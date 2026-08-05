// main.js — Point d'entrée : relie le jeu au DOM (canvas, HUD, contrôles).

import { Game } from './game.js';
import { Renderer } from './render.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);

// Éléments du HUD.
const hpFill = document.getElementById('hp-fill');
const hpText = document.getElementById('hp-text');
const goldText = document.getElementById('gold-text');
const turnText = document.getElementById('turn-text');
const invList = document.getElementById('inventory-list');
const logEl = document.getElementById('log');
const seedInput = document.getElementById('seed-input');
const seedLabel = document.getElementById('seed-label');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const overlayBtn = document.getElementById('overlay-btn');

// Seed initiale : aléatoire ou celle passée dans l'URL (?seed=...).
const urlSeed = new URLSearchParams(location.search).get('seed');
let currentSeed = urlSeed || randomSeed();
seedInput.value = currentSeed;

const game = new Game(currentSeed);
wireGame(game);

// --- Rendu continu (boucle d'animation légère) ---
function loop() {
  renderer.draw(game);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- Branche les événements du jeu sur l'interface ---
function wireGame(g) {
  seedLabel.textContent = g.seed;
  g.on('log', (msg) => addLog(msg));
  g.on('update', () => updateHud(g));
  g.on('detected', () => flashDetection());
  g.on('gameover', ({ won }) => showOverlay(g, won));
  updateHud(g);
}

function updateHud(g) {
  const p = g.player;
  const pct = Math.max(0, (p.hp / p.maxHp) * 100);
  hpFill.style.width = pct + '%';
  hpFill.style.background = pct > 50 ? '#2ecc71' : pct > 25 ? '#f1c40f' : '#e74c3c';
  hpText.textContent = `${p.hp} / ${p.maxHp}`;
  goldText.textContent = p.gold;
  turnText.textContent = g.turn;

  invList.innerHTML = '';
  const items = p.items();
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Inventaire vide';
    invList.appendChild(li);
  } else {
    for (const it of items) {
      const li = document.createElement('li');
      li.textContent = it.qty > 1 ? `${it.name} ×${it.qty}` : it.name;
      invList.appendChild(li);
    }
  }
}

function addLog(msg) {
  const p = document.createElement('div');
  p.className = 'log-line';
  p.textContent = msg;
  logEl.appendChild(p);
  // Conserve les 40 dernières lignes.
  while (logEl.children.length > 40) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}

function flashDetection() {
  document.body.classList.add('alert');
  setTimeout(() => document.body.classList.remove('alert'), 600);
}

function showOverlay(g, won) {
  overlayTitle.textContent = won ? 'Niveau terminé 🎉' : 'Game Over 💀';
  overlayText.textContent = won
    ? `Sortie atteinte en ${g.turn} tours avec ${g.player.gold} or.`
    : 'Le labyrinthe a eu raison de toi.';
  overlayBtn.textContent = won ? 'Nouveau labyrinthe' : 'Recommencer';
  overlay.dataset.won = won ? '1' : '0';
  overlay.classList.add('visible');
}

overlayBtn.addEventListener('click', () => {
  overlay.classList.remove('visible');
  logEl.innerHTML = '';
  if (overlay.dataset.won === '1') {
    // Victoire : on génère un nouveau labyrinthe.
    currentSeed = randomSeed();
    seedInput.value = currentSeed;
    game.load(currentSeed);
    seedLabel.textContent = game.seed;
  } else {
    // Défaite : on recommence le même niveau.
    game.restart();
  }
});

// --- Contrôles clavier ---
const KEY_DIRS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  z: 'up', // clavier AZERTY
  q: 'left',
};
window.addEventListener('keydown', (e) => {
  const dir = KEY_DIRS[e.key];
  if (dir) {
    e.preventDefault();
    game.move(dir);
  }
});

// --- Contrôles tactiles (croix directionnelle) ---
document.querySelectorAll('[data-dir]').forEach((btn) => {
  const handler = (e) => {
    e.preventDefault();
    game.move(btn.dataset.dir);
  };
  btn.addEventListener('click', handler);
});

// --- Boutons de la barre d'outils ---
document.getElementById('new-seed-btn').addEventListener('click', () => {
  currentSeed = seedInput.value.trim() || randomSeed();
  seedInput.value = currentSeed;
  logEl.innerHTML = '';
  overlay.classList.remove('visible');
  game.load(currentSeed);
  seedLabel.textContent = game.seed;
});
document.getElementById('random-seed-btn').addEventListener('click', () => {
  currentSeed = randomSeed();
  seedInput.value = currentSeed;
  logEl.innerHTML = '';
  overlay.classList.remove('visible');
  game.load(currentSeed);
  seedLabel.textContent = game.seed;
});
document.getElementById('restart-btn').addEventListener('click', () => {
  logEl.innerHTML = '';
  overlay.classList.remove('visible');
  game.restart();
});

function randomSeed() {
  const words = ['ariane', 'dedale', 'thesee', 'minos', 'crete', 'fil', 'corne', 'ombre'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(Math.random() * 100000)}`;
}

// --- Enregistrement du service worker (PWA) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* mode hors-ligne indisponible si le SW ne s'enregistre pas */
    });
  });
}
