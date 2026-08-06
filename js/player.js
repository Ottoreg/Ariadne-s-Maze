// player.js — État de l'aventurier : position, points de vie, inventaire.

export class Player {
  constructor(x, y, maxHp = 20) {
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.gold = 0;
    // Inventaire simple : map nom d'objet -> quantité.
    this.inventory = new Map();
    // Arme équipée par défaut : un glaive de base (3 dégâts par coup).
    this.weapon = { name: 'Glaive', damage: 3, hitChance: 0.8 };
  }

  isAlive() {
    return this.hp > 0;
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    return this.hp;
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

  // Retourne l'inventaire sous forme de liste triée pour l'affichage.
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
    // On repart toujours avec le glaive de base.
    this.weapon = { name: 'Glaive', damage: 3, hitChance: 0.8 };
  }
}
