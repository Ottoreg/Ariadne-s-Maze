// player.js — État de l'aventurier : PV, or, inventaire, équipement.

// Objets consommables et leur effet (soin). Sert au jeu pour l'utilisation
// depuis l'inventaire et pour peupler l'équipement de départ.
export const CONSUMABLES = {
  'Potion mineure': { heal: 5, emoji: '🧪' },
  'Potion de soin': { heal: 8, emoji: '⚗️' },
};

// Équipement de départ (réutilisé au démarrage et à chaque relance de niveau).
function startingWeapon() {
  return { name: 'Glaive', damage: 3, hitChance: 0.8, emoji: '🗡️' };
}
function startingArmor() {
  return { name: 'Tunique en tissu', armor: 1, emoji: '🧥' };
}

export class Player {
  constructor(x, y, maxHp = 20) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.gold = 0;
    // Inventaire simple : map nom d'objet -> quantité.
    this.inventory = new Map();
    this._equipStartingGear();
  }

  // Arme + armure équipées et objets de départ.
  _equipStartingGear() {
    this.weapon = startingWeapon();
    this.armor = startingArmor();
    // Trois potions mineures dans le sac au départ.
    this.addItem('Potion mineure', 3);
  }

  isAlive() {
    return this.hp > 0;
  }

  // Valeur d'armure actuelle (mitigation des dégâts).
  armorValue() {
    return this.armor ? this.armor.armor || 0 : 0;
  }

  // Inflige des dégâts en tenant compte de l'armure (mitigation).
  // Retourne les dégâts réellement subis (après armure).
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

  addItem(name, qty = 1) {
    this.inventory.set(name, (this.inventory.get(name) || 0) + qty);
  }

  // Retire une (ou plusieurs) unité(s) d'un objet ; supprime l'entrée à 0.
  removeItem(name, qty = 1) {
    const cur = this.inventory.get(name) || 0;
    const next = cur - qty;
    if (next <= 0) this.inventory.delete(name);
    else this.inventory.set(name, next);
  }

  // Retourne l'inventaire sous forme de liste pour l'affichage.
  items() {
    return Array.from(this.inventory.entries()).map(([name, qty]) => ({ name, qty }));
  }

  // Réinitialise l'état pour recommencer un niveau (position fournie par le jeu).
  reset(x, y) {
    this.x = x;
    this.y = y;
    this.hp = this.maxHp;
    this.gold = 0;
    this.inventory.clear();
    this._equipStartingGear();
  }
}
