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
  boss: '#ff2e63',
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
  brute: { radius: 26, speed: 34, hp: 14, damage: 2, score: 40, color: '#e07bff', ember: 4 },
  splitter: { radius: 17, speed: 78, hp: 4, damage: 1, score: 25, color: '#7dff9e', ember: 2 },
  boss: { radius: 46, speed: 40, hp: 220, damage: 2, score: 500, color: '#ff2e63', ember: 20 },
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
