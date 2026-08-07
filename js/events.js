// events.js — Détermination des événements par case.
//
// Principe : l'événement d'une case dépend
//   1. de l'aléatoire (déterministe par seed + coordonnées),
//   2. du type de sol de la case,
//   3. des types de sol des 8 cases alentours (les 9 cases au total).
//
// On calcule un profil de terrain des 9 cases, on en déduit des poids
// pour chaque catégorie d'événement, puis on tire un événement stable
// pour la case (reproductible tant que la seed ne change pas).

import { TERRAIN } from './maze.js';
import { cellRandom } from './rng.js';

// Catégories d'événements (base du jeu : quelques événements simples).
export const EVENT = {
  NONE: 'none',
  TRAP: 'trap',
  MONSTER: 'monster',
  TREASURE: 'treasure',
};

// Influence de chaque terrain sur les poids des catégories.
// Chaque terrain "pousse" certaines catégories.
const TERRAIN_WEIGHTS = {
  [TERRAIN.STONE]: { none: 6, trap: 1, monster: 1, treasure: 1 },
  [TERRAIN.GRASS]: { none: 4, trap: 0.5, monster: 1, treasure: 3 },
  [TERRAIN.SAND]:  { none: 3, trap: 1, monster: 4, treasure: 1 },
  [TERRAIN.MUD]:   { none: 3, trap: 4, monster: 1, treasure: 0.5 },
  [TERRAIN.WATER]: { none: 7, trap: 0.5, monster: 0.5, treasure: 1 },
};

// Contenu concret de chaque catégorie d'événement.
// Le contenu précis (dégâts, butin) est lui aussi tiré de façon déterministe.
// hp : points de vie du monstre en combat · dmg : dégâts par attaque
// hit : probabilité que l'attaque du monstre touche · emoji : sprite de combat
const MONSTERS = [
  { name: 'Rat des cavernes', hp: 4, dmg: [1, 2], hit: 0.7, emoji: '🐀' },
  { name: 'Chauve-souris', hp: 4, dmg: [1, 3], hit: 0.78, emoji: '🦇' },
  { name: 'Squelette errant', hp: 8, dmg: [2, 4], hit: 0.7, emoji: '💀' },
  { name: 'Araignée géante', hp: 9, dmg: [2, 5], hit: 0.62, emoji: '🕷️' },
];

const TRAPS = [
  { name: 'Pieux dissimulés', dmg: [1, 3] },
  { name: 'Dalle piégée', dmg: [2, 4] },
  { name: 'Nuage de spores', dmg: [1, 2] },
];

const TREASURES = [
  { name: 'Pièces d\'or', item: 'Pièces d\'or', gold: [3, 12] },
  { name: 'Potion de soin', item: 'Potion de soin' },
  { name: 'Vieille clé', item: 'Vieille clé' },
  { name: 'Gemme scintillante', item: 'Gemme scintillante', gold: [8, 20] },
  // Équipements à trouver (pour alimenter le système d'équipement).
  { name: 'Casque de cuir', item: 'Casque de cuir' },
  { name: 'Jambières de cuir', item: 'Jambières de cuir' },
  { name: 'Bouclier de bois', item: 'Bouclier de bois' },
  { name: 'Dague rouillée', item: 'Dague rouillée' },
];

// Retourne le profil pondéré (somme des poids par catégorie) des 9 cases.
function neighborhoodWeights(maze, x, y) {
  const acc = { none: 0, trap: 0, monster: 0, treasure: 0 };
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = maze.terrainAt(x + dx, y + dy);
      // Une case-mur n'a pas de terrain : on la traite comme du STONE neutre,
      // ce qui rend les zones bordées de murs plus calmes.
      const weights = TERRAIN_WEIGHTS[t] || TERRAIN_WEIGHTS[TERRAIN.STONE];
      // La case centrale compte double : c'est le sol où l'on met le pied.
      const factor = dx === 0 && dy === 0 ? 2 : 1;
      acc.none += weights.none * factor;
      acc.trap += weights.trap * factor;
      acc.monster += weights.monster * factor;
      acc.treasure += weights.treasure * factor;
    }
  }
  return acc;
}

// Détermine l'événement d'une case (catégorie + détails).
// Déterministe : même seed + mêmes coordonnées => même événement.
export function computeEvent(maze, x, y) {
  // Ni l'entrée, ni les murs ne portent d'événement.
  if (!maze.isFloor(x, y)) return { type: EVENT.NONE };
  if (x === maze.entrance.x && y === maze.entrance.y) return { type: EVENT.NONE };

  const w = neighborhoodWeights(maze, x, y);
  const rand = cellRandom(maze.seed, x, y, 101);

  const total = w.none + w.trap + w.monster + w.treasure;
  let r = rand() * total;
  let type = EVENT.NONE;
  if ((r -= w.none) < 0) type = EVENT.NONE;
  else if ((r -= w.trap) < 0) type = EVENT.TRAP;
  else if ((r -= w.monster) < 0) type = EVENT.MONSTER;
  else type = EVENT.TREASURE;

  return buildEventDetails(maze, x, y, type);
}

// Construit les détails concrets d'un événement de façon déterministe.
function buildEventDetails(maze, x, y, type) {
  const rand = cellRandom(maze.seed, x, y, 202);
  const pickIdx = (arr) => Math.floor(rand() * arr.length);
  const range = ([min, max]) => min + Math.floor(rand() * (max - min + 1));

  switch (type) {
    case EVENT.MONSTER: {
      const m = MONSTERS[pickIdx(MONSTERS)];
      // On transmet les stats de combat (les dégâts sont retirés à chaque
      // attaque, pas ici, pour varier d'un coup à l'autre pendant le combat).
      return { type, name: m.name, hp: m.hp, dmg: m.dmg, hit: m.hit, emoji: m.emoji };
    }
    case EVENT.TRAP: {
      const t = TRAPS[pickIdx(TRAPS)];
      return { type, name: t.name, damage: range(t.dmg) };
    }
    case EVENT.TREASURE: {
      const t = TREASURES[pickIdx(TREASURES)];
      const out = { type, name: t.name, item: t.item };
      if (t.gold) out.gold = range(t.gold);
      if (t.heal) out.heal = range(t.heal);
      return out;
    }
    default:
      return { type: EVENT.NONE };
  }
}
