// player.js — Aventurier : PV, or, 5 emplacements d'équipement, sac de 5 places.

// Les cinq emplacements d'équipement. `accepts` = type de sol d'objet accepté.
export const SLOTS = [
  { key: 'tete', label: 'Tête', accepts: 'tete', emoji: '🪖' },
  { key: 'corps', label: 'Corps', accepts: 'corps', emoji: '🧥' },
  { key: 'jambes', label: 'Jambes', accepts: 'jambes', emoji: '👖' },
  { key: 'brasD', label: 'Bras droit', accepts: 'arm', emoji: '🗡️' },
  { key: 'brasG', label: 'Bras gauche', accepts: 'arm', emoji: '🛡️' },
];

// Nombre de places dans le sac.
export const INVENTORY_SIZE = 5;

// Catalogue des objets (indexés par nom).
//  kind: 'equip' (équipable), 'consumable' (à boire), 'misc' (butin divers)
//  slot: pour les équipements, le type d'emplacement ('tete','corps','jambes','arm')
//  stack: true = plusieurs unités tiennent dans une seule place du sac
export const ITEM_DEFS = {
  'Glaive': { name: 'Glaive', emoji: '🗡️', kind: 'equip', slot: 'arm', damage: 3, hitChance: 0.8 },
  'Dague rouillée': { name: 'Dague rouillée', emoji: '🔪', kind: 'equip', slot: 'arm', damage: 2, hitChance: 0.85 },
  'Bouclier de bois': { name: 'Bouclier de bois', emoji: '🛡️', kind: 'equip', slot: 'arm', armor: 2 },
  'Tunique en tissu': { name: 'Tunique en tissu', emoji: '🧥', kind: 'equip', slot: 'corps', armor: 1 },
  'Casque de cuir': { name: 'Casque de cuir', emoji: '🪖', kind: 'equip', slot: 'tete', armor: 1 },
  'Jambières de cuir': { name: 'Jambières de cuir', emoji: '👖', kind: 'equip', slot: 'jambes', armor: 1 },
  'Potion mineure': { name: 'Potion mineure', emoji: '🧪', kind: 'consumable', heal: 5, stack: true },
  'Potion de soin': { name: 'Potion de soin', emoji: '⚗️', kind: 'consumable', heal: 8, stack: true },
  'Vieille clé': { name: 'Vieille clé', emoji: '🗝️', kind: 'misc', stack: true },
  'Gemme scintillante': { name: 'Gemme scintillante', emoji: '💎', kind: 'misc', stack: true },
};

// Attaque à mains nues (aucune arme équipée).
export const FISTS = { name: 'Poings', emoji: '👊', damage: 1, hitChance: 0.7 };

// Retourne la définition d'un objet (valeur de repli pour les inconnus).
export function itemDef(name) {
  return ITEM_DEFS[name] || { name, emoji: '❔', kind: 'misc', stack: true };
}

export class Player {
  constructor(x, y, maxHp = 20) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.gold = 0;
    // Sac : tableau de piles { name, qty }, au plus INVENTORY_SIZE places.
    this.bag = [];
    // Équipement : un objet { name } (ou null) par emplacement.
    this.equipment = { tete: null, corps: null, jambes: null, brasD: null, brasG: null };
    this._equipStartingGear();
  }

  // Équipement et sac de départ (aussi à chaque relance de niveau).
  _equipStartingGear() {
    this.bag = [];
    this.equipment = { tete: null, corps: null, jambes: null, brasD: null, brasG: null };
    this.equipment.brasD = { name: 'Glaive' };       // glaive en main droite
    this.equipment.corps = { name: 'Tunique en tissu' }; // tunique sur le corps
    this.addItem('Potion mineure', 3);               // 3 potions dans le sac
  }

  isAlive() {
    return this.hp > 0;
  }

  // Somme de l'armure de tous les objets équipés (mitigation des dégâts).
  armorValue() {
    let a = 0;
    for (const k in this.equipment) {
      const it = this.equipment[k];
      if (it) a += itemDef(it.name).armor || 0;
    }
    return a;
  }

  // Arme active pour le combat : première main portant une arme, sinon les poings.
  activeWeapon() {
    for (const k of ['brasD', 'brasG']) {
      const it = this.equipment[k];
      if (it) {
        const d = itemDef(it.name);
        if (d.damage) return d;
      }
    }
    return FISTS;
  }

  // Inflige des dégâts en tenant compte de l'armure. Retourne les dégâts subis.
  damage(amount) {
    const dealt = Math.max(0, amount - this.armorValue());
    this.hp = Math.max(0, this.hp - dealt);
    return dealt;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp;
  }

  addGold(amount) {
    this.gold += amount;
  }

  bagFull() {
    return this.bag.length >= INVENTORY_SIZE;
  }

  // Ajoute un objet au sac. Retourne true si placé, false si le sac est plein.
  addItem(name, qty = 1) {
    const def = itemDef(name);
    if (def.stack) {
      const stack = this.bag.find((s) => s.name === name);
      if (stack) { stack.qty += qty; return true; }
      if (this.bagFull()) return false;
      this.bag.push({ name, qty });
      return true;
    }
    // Objets non empilables : une place par unité.
    let placed = 0;
    for (let i = 0; i < qty; i++) {
      if (this.bagFull()) break;
      this.bag.push({ name, qty: 1 });
      placed++;
    }
    return placed === qty;
  }

  // Retire une unité de la pile à l'index i. Retourne { name, qty } ou null.
  removeAt(i, qty = 1) {
    const s = this.bag[i];
    if (!s) return null;
    const taken = { name: s.name, qty: Math.min(qty, s.qty) };
    s.qty -= taken.qty;
    if (s.qty <= 0) this.bag.splice(i, 1);
    return taken;
  }

  // Liste du sac pour l'affichage (avec index et définition).
  items() {
    return this.bag.map((s, i) => ({ name: s.name, qty: s.qty, index: i, def: itemDef(s.name) }));
  }

  // Liste des emplacements d'équipement pour l'affichage.
  equippedList() {
    return SLOTS.map((slot) => {
      const it = this.equipment[slot.key];
      return { ...slot, name: it ? it.name : null, def: it ? itemDef(it.name) : null };
    });
  }

  // Emplacement cible pour un type d'objet (les armes vont dans une main libre).
  _targetSlot(slotType) {
    if (slotType === 'arm') {
      if (!this.equipment.brasD) return 'brasD';
      if (!this.equipment.brasG) return 'brasG';
      return 'brasD';
    }
    return slotType;
  }

  // Équipe l'objet du sac à l'index donné. L'ancien équipement retourne au sac.
  equip(index) {
    const s = this.bag[index];
    if (!s) return { ok: false, reason: 'empty' };
    const def = itemDef(s.name);
    if (def.kind !== 'equip') return { ok: false, reason: 'not-equippable' };
    const slotKey = this._targetSlot(def.slot);
    const prev = this.equipment[slotKey];
    // On retire une unité du sac (libère une place pour l'objet remplacé).
    this.removeAt(index, 1);
    this.equipment[slotKey] = { name: s.name };
    if (prev) this.addItem(prev.name, 1);
    return { ok: true, slotKey, name: s.name, replaced: prev ? prev.name : null };
  }

  // Déséquipe l'emplacement donné : l'objet retourne au sac (si de la place).
  unequip(slotKey) {
    const it = this.equipment[slotKey];
    if (!it) return { ok: false, reason: 'empty' };
    if (this.bagFull()) return { ok: false, reason: 'full' };
    this.equipment[slotKey] = null;
    this.addItem(it.name, 1);
    return { ok: true, name: it.name };
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.hp = this.maxHp;
    this.gold = 0;
    this._equipStartingGear();
  }
}
