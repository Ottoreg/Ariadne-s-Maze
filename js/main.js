// main.js — Point d'entrée : relie le jeu au DOM (canvas plein écran, HUD en
// surimpression, tiroirs, contrôles tactiles pensés pour le mobile paysage).

import { Game } from './game.js';
import { Renderer3D } from './raycaster.js';
import { EVENT } from './events.js';
import { itemDef } from './player.js';

const $ = (id) => document.getElementById(id);

const canvas = $('game');
const renderer = new Renderer3D(canvas);

// Éléments du HUD.
const hpFill = $('hp-fill');
const hpText = $('hp-text');
const goldText = $('gold-text');
const goldText2 = $('gold-text-2');
const armorText = $('armor-text');
const turnText = $('turn-text');
const equipList = $('equip-list');
const bagList = $('bag-list');
const bagCount = $('bag-count');
const groundSection = $('ground-section');
const groundList = $('ground-list');
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

// Éléments du combat (surimpression sur la vue 3D).
const combatEl = $('battle');
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
  if (armorText) armorText.textContent = p.armorValue();
  turnText.textContent = g.turn;

  renderEquipment(p);
  renderBag(p);
  renderGround(g);
}

// Fabrique le bloc principal (icône + textes) d'un objet/emplacement.
function slotMain(emoji, label, name, stat) {
  const main = document.createElement('div');
  main.className = 'slot-main';
  const icon = document.createElement('span');
  icon.className = 'slot-icon';
  icon.textContent = emoji;
  const text = document.createElement('div');
  text.className = 'slot-text';
  if (label) {
    const l = document.createElement('span');
    l.className = 'slot-label';
    l.textContent = label;
    text.appendChild(l);
  }
  const n = document.createElement('span');
  n.className = 'slot-name';
  n.innerHTML = name;
  text.appendChild(n);
  if (stat) {
    const s = document.createElement('span');
    s.className = 'slot-stat';
    s.textContent = stat;
    text.appendChild(s);
  }
  main.appendChild(icon);
  main.appendChild(text);
  return main;
}

function actionBtn(label, cls, onClick) {
  const b = document.createElement('button');
  if (cls) b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function statOf(def) {
  if (!def) return '';
  if (def.damage) return `${def.damage} dégâts`;
  if (def.armor) return `${def.armor} armure`;
  if (def.heal) return `soigne ${def.heal}`;
  return '';
}

// Les 5 emplacements d'équipement (bouton « Retirer » si occupé).
function renderEquipment(p) {
  equipList.innerHTML = '';
  for (const slot of p.equippedList()) {
    const li = document.createElement('li');
    li.className = 'slot' + (slot.name ? '' : ' empty');
    const emoji = slot.def ? slot.def.emoji : slot.emoji;
    li.appendChild(slotMain(emoji, slot.label, slot.name || 'vide', statOf(slot.def)));
    if (slot.name) {
      const actions = document.createElement('div');
      actions.className = 'slot-actions';
      actions.appendChild(actionBtn('Retirer', 'danger', () => game.unequipItem(slot.key)));
      li.appendChild(actions);
    }
    equipList.appendChild(li);
  }
}

// Le sac (5 places) : boutons Équiper / Boire / Jeter selon le type d'objet.
function renderBag(p) {
  bagList.innerHTML = '';
  if (bagCount) bagCount.textContent = p.bag.length;
  const items = p.items();
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'slot empty';
    li.appendChild(slotMain('🎒', '', 'Sac vide', ''));
    bagList.appendChild(li);
    return;
  }
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'slot';
    const nameHtml = it.qty > 1 ? `${it.name} <span class="qty">×${it.qty}</span>` : it.name;
    li.appendChild(slotMain(it.def.emoji, '', nameHtml, statOf(it.def)));
    const actions = document.createElement('div');
    actions.className = 'slot-actions';
    if (it.def.kind === 'equip') {
      actions.appendChild(actionBtn('Équiper', 'primary', () => game.equipItem(it.index)));
    }
    if (it.def.kind === 'consumable' && it.def.heal) {
      actions.appendChild(actionBtn('Boire', 'primary', () => game.useItem(it.index)));
    }
    actions.appendChild(actionBtn('Jeter', 'danger', () => game.dropItem(it.index)));
    li.appendChild(actions);
    bagList.appendChild(li);
  }
}

// Objets posés au sol sur la case actuelle (bouton « Ramasser »).
function renderGround(g) {
  const ground = g.groundHere();
  if (!ground.length) {
    groundSection.hidden = true;
    groundList.innerHTML = '';
    return;
  }
  groundSection.hidden = false;
  groundList.innerHTML = '';
  for (const it of ground) {
    const def = itemDef(it.name);
    const li = document.createElement('li');
    li.className = 'slot';
    const nameHtml = it.qty > 1 ? `${it.name} <span class="qty">×${it.qty}</span>` : it.name;
    li.appendChild(slotMain(def.emoji, '', nameHtml, statOf(def)));
    const actions = document.createElement('div');
    actions.className = 'slot-actions';
    actions.appendChild(actionBtn('Ramasser', 'primary', () => game.pickUp(it.name)));
    li.appendChild(actions);
    groundList.appendChild(li);
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
  // Le combat cède la place à l'écran de fin.
  closeBattle();
  overlayTitle.textContent = won ? 'Niveau terminé 🎉' : 'Game Over 💀';
  overlayText.textContent = won
    ? `Sortie atteinte en ${g.turn} tours avec ${g.player.gold} or.`
    : 'Le labyrinthe a eu raison de toi.';
  overlayBtn.textContent = won ? 'Nouveau labyrinthe' : 'Recommencer';
  overlay.dataset.won = won ? '1' : '0';
  overlay.classList.add('visible');
}

// ---------- Combat (le monstre surgit au centre, interface en bas) ----------
let combatClosing = null;

function openCombat(c) {
  clearTimeout(combatClosing);
  cbtEnemyName.textContent = c.enemy.name;
  cbtEnemySprite.textContent = c.enemy.emoji || '👹';
  combatLog.innerHTML = '';
  setActionsDisabled(false);
  renderCombat(c, false);
  document.body.classList.add('in-combat'); // masque le d-pad, fige le décor
  combatEl.classList.add('visible', 'surge'); // animation d'apparition du monstre
  combatEl.setAttribute('aria-hidden', 'false');
  // Retire la classe d'apparition après l'animation.
  setTimeout(() => combatEl.classList.remove('surge'), 500);
}

function renderCombat(c, animate) {
  const p = game.player;
  const ePct = Math.max(0, (c.enemy.hp / c.enemy.maxHp) * 100);
  const pPct = Math.max(0, (p.hp / p.maxHp) * 100);
  cbtEnemyHp.style.width = ePct + '%';
  cbtPlayerHp.style.width = pPct + '%';
  cbtEnemyHpText.textContent = `${c.enemy.hp} / ${c.enemy.maxHp}`;
  cbtPlayerHpText.textContent = `${p.hp} / ${p.maxHp}`;

  // On n'affiche que la dernière ligne du journal (sous le monstre).
  combatLog.textContent = c.log[c.log.length - 1] || '';

  if (animate) {
    const last = c.log[c.log.length - 1] || '';
    // Le monstre encaisse un coup -> il tremble.
    if (last.includes('Tu frappes')) bump(cbtEnemySprite);
    // Le joueur est touché -> flash rouge de l'écran.
    if (last.includes('te touche')) flashDetection();
  }
}

function bump(el) {
  if (!el) return;
  el.classList.remove('hit');
  void el.offsetWidth; // force le reflow pour rejouer l'animation
  el.classList.add('hit');
}

function closeBattle() {
  combatEl.classList.remove('visible', 'surge');
  combatEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('in-combat');
}

function endCombat(c) {
  setActionsDisabled(true);
  // On laisse le temps de lire l'issue avant de refermer.
  const delay = c.result === 'lose' ? 500 : 950;
  combatClosing = setTimeout(closeBattle, delay);
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

// ---------- Contrôles (vue 3D : avancer/reculer + pivoter) ----------
// data-dir : up = avancer, down = reculer, left = pivoter à gauche,
//            right = pivoter à droite.
const ACTIONS = {
  up: () => game.forward(),
  down: () => game.back(),
  left: () => game.turnLeft(),
  right: () => game.turnRight(),
};

const KEY_DIRS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  z: 'up', q: 'left', // AZERTY
};
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openPanel) { closePanel(); return; }
  if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); game.wait(); return; }
  const dir = KEY_DIRS[e.key];
  if (dir) { e.preventDefault(); ACTIONS[dir](); }
});

// ---------- Contrôles tactiles ----------
// Avancer/reculer se répètent au maintien ; pivoter agit à chaque appui
// (rotation de 90° par pression, plus lisible qu'une rotation continue).
function bindHold(el, action) {
  let timer = null;
  let repeat = null;
  const start = (e) => {
    e.preventDefault();
    if (game.over) return;
    action();
    timer = setTimeout(() => { repeat = setInterval(action, 160); }, 320);
  };
  const stop = () => { clearTimeout(timer); clearInterval(repeat); timer = repeat = null; };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('contextmenu', (ev) => ev.preventDefault());
}
function bindTap(el, action) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); action(); });
  el.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

document.querySelectorAll('[data-dir]').forEach((btn) => {
  const dir = btn.dataset.dir;
  if (dir === 'up' || dir === 'down') bindHold(btn, ACTIONS[dir]);
  else bindTap(btn, ACTIONS[dir]);
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
