// combat.js — Système de combat rudimentaire au tour par tour.
//
// Trois actions pour le joueur, aucune garantie à 100 % :
//   - Attaquer : inflige les dégâts de l'arme si le coup touche.
//   - Parer    : tente de bloquer la prochaine attaque ennemie.
//   - Fuir     : tente de quitter le combat (le monstre, lui, ne peut pas fuir).
//
// Après chaque action du joueur (sauf fuite réussie), l'ennemi riposte, lui
// aussi avec une probabilité de toucher. Le combat se termine quand l'ennemi
// est vaincu (victoire), le joueur tombe à 0 PV (défaite), ou la fuite réussit.

export class Combat {
  constructor(player, enemy, rng) {
    this.player = player; // référence au Player (hp, weapon)
    this.enemy = enemy;   // { name, hp, maxHp, dmg:[min,max], hitChance, emoji }
    this.rng = rng;
    this.over = false;
    this.result = null;   // 'win' | 'lose' | 'flee'
    this.round = 1;
    this.log = [];

    // Probabilités de réussite des actions du joueur.
    this.parryChance = 0.6; // chance de parer avec succès
    this.fleeChance = 0.5;  // chance de fuir avec succès
  }

  _say(msg) {
    this.log.push(msg);
  }

  // --- Action : attaquer ---
  attack() {
    if (this.over) return;
    const w = this.player.weapon;
    if (this.rng.chance(w.hitChance)) {
      this.enemy.hp = Math.max(0, this.enemy.hp - w.damage);
      this._say(`⚔️ Tu frappes ${this.enemy.name} avec ton ${w.name} : -${w.damage} PV.`);
    } else {
      this._say(`💨 Tu attaques, mais ${this.enemy.name} esquive !`);
    }
    if (this._checkEnemyDefeated()) return;
    this._enemyTurn(false);
  }

  // --- Action : parer ---
  parry() {
    if (this.over) return;
    const success = this.rng.chance(this.parryChance);
    if (success) this._say('🛡️ Tu te mets en garde, prêt à parer.');
    else this._say('😖 Ta garde est mal assurée...');
    // L'ennemi attaque : si la parade a réussi, le coup est bloqué.
    this._enemyTurn(success);
  }

  // --- Action : fuir ---
  flee() {
    if (this.over) return;
    if (this.rng.chance(this.fleeChance)) {
      this._say(`🏃 Tu parviens à fuir ${this.enemy.name} !`);
      this.over = true;
      this.result = 'flee';
      return;
    }
    this._say('❌ Fuite ratée ! Le monstre en profite.');
    this._enemyTurn(false);
  }

  // Tour de l'ennemi. `blocked` = true si la parade du joueur a réussi.
  _enemyTurn(blocked) {
    if (this.over) return;
    if (this.rng.chance(this.enemy.hitChance)) {
      const raw = this.rng.int(this.enemy.dmg[0], this.enemy.dmg[1]);
      if (blocked) {
        this._say(`🛡️ Tu pares l'attaque de ${this.enemy.name} ! Aucun dégât.`);
      } else {
        this.player.damage(raw);
        this._say(`🩸 ${this.enemy.name} te touche : -${raw} PV.`);
      }
    } else {
      this._say(`✨ ${this.enemy.name} attaque, mais te manque !`);
    }
    this.round++;
    this._checkPlayerDefeated();
  }

  _checkEnemyDefeated() {
    if (this.enemy.hp <= 0) {
      this._say(`🏆 ${this.enemy.name} est vaincu !`);
      this.over = true;
      this.result = 'win';
      return true;
    }
    return false;
  }

  _checkPlayerDefeated() {
    if (this.player.hp <= 0) {
      this.over = true;
      this.result = 'lose';
      return true;
    }
    return false;
  }
}
