// The draft: after every cleared wave the Warden picks one of three cards.
// Each upgrade stacks to its cap; the draft never offers one already maxed,
// and never offers the same card twice in one draft.
import { shuffle } from './random.js';
import { DRAFT_CHOICES } from './config.js';

export const UPGRADES = [
  {
    id: 'heavy-rounds',
    name: 'Heavy Rounds',
    desc: '+1 bullet damage',
    max: 5,
    apply: (player) => { player.bulletDamage += 1; },
  },
  {
    id: 'rapid-trigger',
    name: 'Rapid Trigger',
    desc: 'Shoot 12% faster',
    max: 5,
    apply: (player) => { player.fireInterval *= 0.88; },
  },
  {
    id: 'split-shot',
    name: 'Split Shot',
    desc: '+1 bullet per shot',
    max: 3,
    apply: (player) => { player.projectiles += 1; },
  },
  {
    id: 'piercing',
    name: 'Piercing Light',
    desc: 'Bullets pierce +1 enemy',
    max: 3,
    apply: (player) => { player.pierce += 1; },
  },
  {
    id: 'swift-boots',
    name: 'Swift Boots',
    desc: '+10% move speed',
    max: 4,
    apply: (player) => { player.speed *= 1.1; },
  },
  {
    id: 'lantern-heart',
    name: 'Lantern Heart',
    desc: '+1 max health, heal 1',
    max: 4,
    apply: (player) => {
      player.maxHp += 1;
      player.hp = Math.min(player.maxHp, player.hp + 1);
    },
  },
  {
    id: 'quick-dash',
    name: 'Quick Dash',
    desc: 'Dash recharges 20% faster',
    max: 3,
    apply: (player) => { player.dashCooldownMax *= 0.8; },
  },
  {
    id: 'ember-magnet',
    name: 'Ember Magnet',
    desc: '+60% pickup radius',
    max: 3,
    apply: (player) => { player.magnetRadius *= 1.6; },
  },
  {
    id: 'long-barrel',
    name: 'Long Barrel',
    desc: '+15% bullet speed and range',
    max: 3,
    apply: (player) => {
      player.bulletSpeed *= 1.15;
      player.bulletLife *= 1.15;
    },
  },
  {
    id: 'nova-burst',
    name: 'Nova Burst',
    desc: 'A shockwave blasts the Hollow when they crowd you',
    max: 3,
    apply: (player) => { player.nova += 1; },
  },
  {
    id: 'orbital-drone',
    name: 'Orbital Drone',
    desc: 'A drone circles you and shoots the Hollow',
    max: 3,
    apply: (player) => { player.drones += 1; },
  },
  {
    id: 'ricochet-rounds',
    name: 'Ricochet Rounds',
    desc: 'Bullets bounce to a nearby enemy on hit',
    max: 3,
    apply: (player) => { player.ricochet += 1; },
  },
];

/** How many times the player already holds an upgrade. */
export function upgradeLevel(player, id) {
  return player.upgrades[id] ?? 0;
}

/** Three draft cards, drawn from the upgrades the player can still take. */
export function rollDraft(random, player) {
  const available = UPGRADES.filter((upgrade) => upgradeLevel(player, upgrade.id) < upgrade.max);
  shuffle(random, available);
  return available.slice(0, DRAFT_CHOICES);
}

/** Applies a card to the player and records its level. */
export function applyUpgrade(player, upgrade) {
  player.upgrades[upgrade.id] = upgradeLevel(player, upgrade.id) + 1;
  upgrade.apply(player);
}
