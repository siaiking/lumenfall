// Lumenfall tuning: every number the game plays by lives here, so the rest of
// the code reads intent instead of magic numbers.
export const FIELD = { width: 960, height: 600 };

// Fixed simulation step: the world advances in 1/60 s slices, so a recorded
// play and a screenshot scene play back identically on any machine.
export const STEP = 1 / 60;

export const PALETTE = {
  background: '#070a14',
  arenaEdge: '#141a2e',
  grid: '#10162a',
  lantern: '#ffd166',
  lanternGlow: '#ffb703',
  player: '#7ef0e0',
  playerCore: '#e8fff9',
  bullet: '#ffe66d',
  ember: '#ff9f1c',
  heart: '#ff5d8f',
  text: '#e8ecf8',
  dim: '#8b93b8',
  danger: '#ff4d6d',
  hollow: '#b388ff',
  brute: '#e07bff',
  spitter: '#ff7ab8',
  shooter: '#f72585',
  boss: '#ff2e63',
};

// The Gloomlord's attack modes: it rotates between them, announcing each
// switch, so a boss fight has phases instead of one endless radial burst.
export const BOSS = {
  attackCycle: 6, // seconds in one mode before rotating to the next
  ringCount: 16, // orbs in the gapped ring
  ringGap: 2, // missing orbs in a row: the gap the Warden slips through
  ringSpeed: 140,
  summonCap: 8, // boss-summoned minions alive at once, at most
  summonBatch: 3, // minions per summon
};

// The player: a Warden carrying the last lantern.
export const PLAYER = {
  radius: 14,
  speed: 250,
  maxHp: 5,
  fireInterval: 0.22,
  bulletSpeed: 560,
  bulletDamage: 1,
  dashSpeed: 720,
  dashTime: 0.16,
  dashCooldown: 2.4,
  invulnerableTime: 0.9,
  magnetRadius: 90,
  pickupRadius: 26,
};

// The Hollow: one entry per kind. hp scales with the wave (see waves.js).
export const ENEMIES = {
  drifter: { radius: 15, speed: 62, hp: 3, damage: 1, score: 10, color: '#b388ff', ember: 1 },
  skitter: { radius: 10, speed: 148, hp: 1, damage: 1, score: 15, color: '#8ecbff', ember: 1 },
  spitter: { radius: 14, speed: 52, hp: 2, damage: 1, score: 20, color: '#ff7ab8', ember: 2 },
  shooter: { radius: 13, speed: 58, hp: 3, damage: 1, score: 30, color: '#f72585', ember: 2 },
  brute: { radius: 26, speed: 34, hp: 14, damage: 2, score: 40, color: '#e07bff', ember: 4 },
  splitter: { radius: 17, speed: 78, hp: 4, damage: 1, score: 25, color: '#7dff9e', ember: 2 },
  dasher: { radius: 12, speed: 96, hp: 2, damage: 1, score: 30, color: '#ff9f43', ember: 2 },
  boss: { radius: 46, speed: 40, hp: 220, damage: 2, score: 500, color: '#ff2e63', ember: 20 },
};

// Elite variants: from wave 3, a few of the Hollow arrive bigger, tougher and
// richer. They roll per spawn, never for the boss.
export const ELITE = { chance: 0.08, minWave: 3, hpMult: 2.5, radiusMult: 1.35, scoreMult: 2, emberMult: 2 };

// The orbital drone an upgrade can grant: it circles the Warden and shoots.
export const DRONE = { orbitRadius: 56, orbitSpeed: 3.4, fireInterval: 0.85, bulletSpeed: 520, damage: 1, range: 420 };

// Combo milestones: reaching x3 or x5 once per run pays a bonus outright.
export const COMBO_MILESTONES = { 3: 30, 5: 50 };

// The three weapon systems (v4): scatter fires a fan of pellets, the lance
// fires a piercing beam down a line, and the mine layer drops proximity
// mines — the mines are auxiliary, so they stack with either primary.
export const WEAPONS = {
  scatter: { pelletsBase: 5, pelletsPerLevel: 2, spread: 0.16, damageMult: 0.6, rangeMult: 0.7 },
  laser: { fireMult: 2.2, baseLength: 520, lengthPerLevel: 60, widthBase: 12 },
  mine: { intervalBase: 2.4, intervalPerLevel: 0.3, cap: 8, armTime: 0.5, triggerRadius: 62, blastRadius: 110, damageBase: 2, life: 14 },
};

// A wave is a budget of points spent on enemy kinds; the director buys the
// strongest mix it can afford and trickles them in from the arena's edge.
export const WAVE = {
  budgetBase: 10,
  budgetPerWave: 7,
  spawnInterval: 0.9,
  spawnIntervalMin: 0.35,
  clearHeal: 1,
  bossEvery: 5,
};

// Kills chained within this window raise the combo; the combo multiplies score.
export const COMBO_WINDOW = 2.5;
export const COMBO_MAX = 5;

// Draft: after every cleared wave the player picks one of three cards.
export const DRAFT_CHOICES = 3;
