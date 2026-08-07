// main.js — Point d'entrée : relie le jeu au DOM (canvas plein écran, HUD en
// surimpression, tiroirs, contrôles tactiles pensés pour le mobile paysage).

import { Game } from './game.js';
import { Renderer } from './render.js';
import { EVENT } from './events.js';
import { CONSUMABLES } from './player.js';

const $ = (id) => document.getElementById(id);

const canvas = $('game');
const renderer = new Renderer(canvas);

// Éléments du HUD.
const hpFill = $('hp-fill');
const hpText = $('hp-text');
const goldText = $('gold-text');
const goldText2 = $('gold-text-2');
const turnText = $('turn-text');
const invList = $('inventory-list');
const logEl = $('log');
const toastsEl = $('toasts');
const seedInput = $('seed-input');
const seedLabel = $('seed-label');
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const overlayText = $('overlay-text');
const overlayBtn = $('overlay-btn');
const drawer = $('drawer');
const drawerTitle = $('drawer-title');
const scrim = $('scrim');

// Éléments de la modale de combat.
const combatEl = $('combat');
const combatLog = $('combat-log');
const cbtEnemyName = $('cbt-enemy-name');
const cbtEnemySprite = $('cbt-enemy-sprite');
const cbtEnemyHp = $('cbt-enemy-hp');
const cbtEnemyHpText = $('cbt-enemy-hp-text');
const cbtPlayerHp = $('cbt-player-hp');
const cbtPlayerHpText = $('cbt-player-hp-text');
const cbtBtns = {
  attack: $('cbt-attack'),
  parry: $('cbt-parry'),
  flee: $('cbt-flee'),
};

// Seed initiale : ?seed=... dans l'URL, sinon aléatoire.
const urlSeed = new URLSearchParams(location.search).get('seed');
let currentSeed = urlSeed || randomSeed();
seedInput.value = currentSeed;

const game = new Game(currentSeed);
wireGame(game);

// --- Boucle de rendu ---
function loop() {
  renderer.draw(game);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- Liaison des événements du jeu à l'interface ---
function wireGame(g) {
  seedLabel.textContent = g.seed;
  g.on('log', (msg) => addLog(msg));
  g.on('update', () => updateHud(g));
  g.on('detected', () => flashDetection());
  g.on('gameover', ({ won }) => showOverlay(g, won));
  g.on('combat-start', (c) => openCombat(c));
  g.on('combat-update', (c) => renderCombat(c, true));
  g.on('combat-end', (c) => endCombat(c));
  updateHud(g);
}

function updateHud(g) {
  const p = g.player;
  const pct = Math.max(0, (p.hp / p.maxHp) * 100);
  hpFill.style.width = pct + '%';
  hpFill.style.background = pct > 50 ? '#2ecc71' : pct > 25 ? '#f1c40f' : '#e74c3c';
  hpText.textContent = `${p.hp} / ${p.maxHp}`;
  goldText.textContent = p.gold;
  if (goldText2) goldText2.textContent = p.gold;
  turnText.textContent = g.turn;

  renderEquipment(p);
  renderBag(p);
}

// Affiche l'arme et l'armure équipées (emplacements façon Diablo).
function renderEquipment(p) {
  const w = p.weapon;
  const a = p.armor;
  const setSlot = (id, gear, statText) => {
    const el = $(id);
    if (!el) return;
    el.querySelector('.equip-icon').textContent = gear ? gear.emoji || '⬚' : '⬚';
    el.querySelector('.equip-name').textContent = gear ? gear.name : '—';
    el.querySelector('.equip-stat').textContent = gear ? statText : '';
  };
  setSlot('equip-weapon', w, w ? `${w.damage} dégâts` : '');
  setSlot('equip-armor', a, a ? `${a.armor} armure` : '');
}

// Affiche le sac ; les consommables reçoivent un bouton « Boire ».
function renderBag(p) {
  invList.innerHTML = '';
  const items = p.items();
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sac vide';
    invList.appendChild(li);
    return;
  }
  for (const it of items) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'item-name';
    label.textContent = it.name;
    li.appendChild(label);
    if (it.qty > 1) {
      const qty = document.createElement('span');
      qty.className = 'item-qty';
      qty.textContent = `×${it.qty}`;
      li.appendChild(qty);
    }
    if (CONSUMABLES[it.name]) {
      const btn = document.createElement('button');
      btn.className = 'item-use';
      btn.textContent = 'Boire';
      btn.addEventListener('click', () => game.useItem(it.name));
      li.appendChild(btn);
    }
    invList.appendChild(li);
  }
}

// Classe le message selon son contenu pour colorer le toast et le journal.
function classifyLog(msg) {
  if (msg.includes('Piège')) return EVENT.TRAP;
  if (msg.includes('Rencontre')) return EVENT.MONSTER;
  if (msg.includes('Trésor')) return EVENT.TREASURE;
  if (msg.includes('Minotaure') || msg.includes('mort')) return 'danger';
  return '';
}

function addLog(msg) {
  // Journal complet (historique).
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = msg;
  logEl.insertBefore(line, logEl.firstChild); // plus récent en haut
  while (logEl.children.length > 60) logEl.removeChild(logEl.lastChild);

  // Toast éphémère sur la vue principale.
  showToast(msg, classifyLog(msg));
}

function showToast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  toastsEl.appendChild(t);
  // Retire après la fin de l'animation de sortie.
  setTimeout(() => t.remove(), 3100);
  // Ne garde que les 3 derniers toasts affichés.
  while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
}

function flashDetection() {
  document.body.classList.add('alert');
  setTimeout(() => document.body.classList.remove('alert'), 600);
}

function showOverlay(g, won) {
  // La modale de combat cède la place à l'écran de fin.
  combatEl.classList.remove('visible');
  overlayTitle.textContent = won ? 'Niveau terminé 🎉' : 'Game Over 💀';
  overlayText.textContent = won
    ? `Sortie atteinte en ${g.turn} tours avec ${g.player.gold} or.`
    : 'Le labyrinthe a eu raison de toi.';
  overlayBtn.textContent = won ? 'Nouveau labyrinthe' : 'Recommencer';
  overlay.dataset.won = won ? '1' : '0';
  overlay.classList.add('visible');
}

// ---------- Modale de combat ----------
let combatClosing = null;

function openCombat(c) {
  clearTimeout(combatClosing);
  cbtEnemyName.textContent = c.enemy.name;
  cbtEnemySprite.textContent = c.enemy.emoji || '👹';
  combatLog.innerHTML = '';
  setActionsDisabled(false);
  renderCombat(c, false);
  combatEl.classList.add('visible');
  combatEl.setAttribute('aria-hidden', 'false');
}

function renderCombat(c, animate) {
  const p = game.player;
  const ePct = Math.max(0, (c.enemy.hp / c.enemy.maxHp) * 100);
  const pPct = Math.max(0, (p.hp / p.maxHp) * 100);
  cbtEnemyHp.style.width = ePct + '%';
  cbtPlayerHp.style.width = pPct + '%';
  cbtEnemyHpText.textContent = `${c.enemy.hp} / ${c.enemy.maxHp}`;
  cbtPlayerHpText.textContent = `${p.hp} / ${p.maxHp}`;

  // Journal du combat (on affiche l'historique complet du combat en cours).
  combatLog.innerHTML = '';
  for (const line of c.log) {
    const div = document.createElement('div');
    div.className = 'cl';
    div.textContent = line;
    combatLog.appendChild(div);
  }
  combatLog.scrollTop = combatLog.scrollHeight;

  if (animate) {
    // Petite secousse sur le dernier combattant touché.
    const last = c.log[c.log.length - 1] || '';
    if (last.includes('te touche') || last.includes('pares')) bump(cbtPlayerSprite());
    if (last.includes('Tu frappes')) bump(cbtEnemySprite);
  }
}

function cbtPlayerSprite() { return $('cbt-player-sprite'); }

function bump(el) {
  if (!el) return;
  el.classList.remove('hit');
  // Force le reflow pour rejouer l'animation.
  void el.offsetWidth;
  el.classList.add('hit');
}

function endCombat(c) {
  setActionsDisabled(true);
  // On laisse le temps de lire l'issue avant de fermer la modale.
  const delay = c.result === 'lose' ? 500 : 950;
  combatClosing = setTimeout(() => {
    combatEl.classList.remove('visible');
    combatEl.setAttribute('aria-hidden', 'true');
  }, delay);
}

function setActionsDisabled(v) {
  cbtBtns.attack.disabled = v;
  cbtBtns.parry.disabled = v;
  cbtBtns.flee.disabled = v;
}

cbtBtns.attack.addEventListener('click', () => game.combatAttack());
cbtBtns.parry.addEventListener('click', () => game.combatParry());
cbtBtns.flee.addEventListener('click', () => game.combatFlee());

overlayBtn.addEventListener('click', () => {
  overlay.classList.remove('visible');
  logEl.innerHTML = '';
  if (overlay.dataset.won === '1') {
    currentSeed = randomSeed();
    seedInput.value = currentSeed;
    game.load(currentSeed);
    seedLabel.textContent = game.seed;
  } else {
    game.restart();
  }
});

// ---------- Tiroir (inventaire / journal / menu) ----------
const PANEL_TITLES = { inventory: 'Inventaire', journal: 'Journal des événements', menu: 'Menu' };
let openPanel = null;

function showPanel(name) {
  openPanel = name;
  drawerTitle.textContent = PANEL_TITLES[name] || '';
  drawer.querySelectorAll('[data-panel-content]').forEach((el) => {
    el.hidden = el.dataset.panelContent !== name;
  });
  drawer.classList.add('open');
  scrim.classList.add('visible');
  document.querySelectorAll('[data-panel]').forEach((b) =>
    b.classList.toggle('active', b.dataset.panel === name)
  );
}

function closePanel() {
  openPanel = null;
  drawer.classList.remove('open');
  scrim.classList.remove('visible');
  document.querySelectorAll('[data-panel]').forEach((b) => b.classList.remove('active'));
}

document.querySelectorAll('[data-panel]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (openPanel === btn.dataset.panel) closePanel();
    else showPanel(btn.dataset.panel);
  });
});
$('drawer-close').addEventListener('click', closePanel);
scrim.addEventListener('click', closePanel);

// ---------- Contrôles clavier ----------
const KEY_DIRS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  z: 'up', q: 'left', // AZERTY
};
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openPanel) { closePanel(); return; }
  if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); game.wait(); return; }
  const dir = KEY_DIRS[e.key];
  if (dir) { e.preventDefault(); game.move(dir); }
});

// ---------- Contrôles tactiles avec répétition au maintien ----------
// Chaque bouton déclenche l'action au contact, puis la répète tant qu'on
// maintient le doigt appuyé (confort de jeu sur mobile).
function bindHold(el, action) {
  let timer = null;
  let repeat = null;
  const start = (e) => {
    e.preventDefault();
    if (game.over) return;
    action();
    // Délai avant répétition, puis cadence régulière.
    timer = setTimeout(() => {
      repeat = setInterval(action, 150);
    }, 320);
  };
  const stop = () => {
    clearTimeout(timer);
    clearInterval(repeat);
    timer = repeat = null;
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
  // Évite le menu contextuel sur appui long mobile.
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

document.querySelectorAll('[data-dir]').forEach((btn) => {
  bindHold(btn, () => game.move(btn.dataset.dir));
});
bindHold($('wait-btn'), () => game.wait());

// ---------- Menu : seed et parties ----------
function reloadWith(seed) {
  currentSeed = seed;
  seedInput.value = seed;
  logEl.innerHTML = '';
  toastsEl.innerHTML = '';
  overlay.classList.remove('visible');
  game.load(seed);
  seedLabel.textContent = game.seed;
  closePanel();
}
$('new-seed-btn').addEventListener('click', () => reloadWith(seedInput.value.trim() || randomSeed()));
$('random-seed-btn').addEventListener('click', () => reloadWith(randomSeed()));
$('restart-btn').addEventListener('click', () => {
  logEl.innerHTML = '';
  toastsEl.innerHTML = '';
  overlay.classList.remove('visible');
  game.restart();
  closePanel();
});

function randomSeed() {
  const words = ['ariane', 'dedale', 'thesee', 'minos', 'crete', 'fil', 'corne', 'ombre'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(Math.random() * 100000)}`;
}

// ---------- Verrou d'orientation (best-effort) ----------
// Le jeu est pensé pour le paysage. Le verrou d'orientation n'est possible
// que sur certaines plateformes (surtout en plein écran / PWA installée) ;
// à défaut, l'invite CSS #rotate-notice prend le relais en portrait.
function tryLockLandscape() {
  try {
    const o = screen.orientation;
    if (o && typeof o.lock === 'function') o.lock('landscape').catch(() => {});
  } catch (_) { /* non supporté : on s'appuie sur l'invite CSS */ }
}
tryLockLandscape();
// Nouvel essai au premier contact (certaines plateformes l'exigent).
window.addEventListener('pointerdown', tryLockLandscape, { once: true });

// ---------- Service worker (PWA) ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
