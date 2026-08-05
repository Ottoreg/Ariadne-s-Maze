// rng.js — Générateur de nombres pseudo-aléatoires déterministe basé sur une seed.
// Tout l'aléatoire du jeu passe par ici pour que le labyrinthe et les événements
// soient reproductibles à partir d'une même seed.

// Hash une chaîne de caractères en un entier 32 bits (xmur3).
// Permet d'accepter une seed textuelle comme "ariane" ou "12345".
export function hashSeed(str) {
  str = String(str);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

// Mulberry32 : un PRNG rapide et de bonne qualité pour un jeu.
// Retourne une fonction qui produit des flottants dans [0, 1).
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Classe pratique qui enveloppe un PRNG et fournit des helpers de jeu.
export class RNG {
  constructor(seed) {
    this.seed = seed;
    const seeder = hashSeed(seed);
    this._next = mulberry32(seeder());
  }

  // Flottant dans [0, 1).
  float() {
    return this._next();
  }

  // Entier dans [min, max] inclus.
  int(min, max) {
    return Math.floor(this._next() * (max - min + 1)) + min;
  }

  // Retourne true avec la probabilité p (0..1).
  chance(p) {
    return this._next() < p;
  }

  // Choisit un élément au hasard dans un tableau.
  pick(arr) {
    return arr[Math.floor(this._next() * arr.length)];
  }

  // Choisit un élément selon des poids : entries = [[valeur, poids], ...].
  weighted(entries) {
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = this._next() * total;
    for (const [value, w] of entries) {
      r -= w;
      if (r < 0) return value;
    }
    return entries[entries.length - 1][0];
  }
}

// PRNG déterministe pour UNE case précise (seed + coordonnées).
// Permet de calculer un événement stable par case sans stocker d'état,
// et sans consommer le flux principal du RNG.
export function cellRandom(seed, x, y, salt = 0) {
  const seeder = hashSeed(`${seed}:${x}:${y}:${salt}`);
  return mulberry32(seeder());
}
