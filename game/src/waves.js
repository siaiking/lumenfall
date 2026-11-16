// The wave director: how many of the Hollow arrive, in what mix, and how
// they scale as the waves go on. A wave is a budget of points; the director
// buys the strongest mix it can afford and trickles it in from the edge.
import { ENEMIES, WAVE } from './config.js';
import { range, shuffle } from './random.js';

const COSTS = { drifter: 1, skitter: 1, spitter: 2, shooter: 2, splitter: 2, dasher: 2, brute: 4 };
const UNLOCKS = { drifter: 1, skitter: 2, spitter: 3, shooter: 3, splitter: 4, dasher: 3, brute: 5 };

// The wave the shooter and the splitter first appear on; their share of the
// director's picks ramps up from there, so they join the fight without
// crowding out the Hollow the player already knows.
const RAMP_START = { shooter: 3, splitter: 4 };

/** A kind's pick weight on this wave: basics always 1, the newer kinds ramp
 * from 0.3 at their debut wave toward 1.6 as the waves climb. */
function kindWeight(kind, wave) {
  const debut = RAMP_START[kind];
  if (debut === undefined) return 1;
  return Math.min(1.6, 0.3 + (wave - debut) * 0.3);
}

/** One kind from the list, weighted by kindWeight. */
function weightedPick(random, kinds, wave) {
  let total = 0;
  const weights = kinds.map((kind) => {
    const weight = kindWeight(kind, wave);
    total += weight;
    return weight;
  });
  let roll = random() * total;
  for (let index = 0; index < kinds.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return kinds[index];
  }
  return kinds[kinds.length - 1];
}

/** The point budget of a wave. */
export function waveBudget(wave) {
  return WAVE.budgetBase + WAVE.budgetPerWave * (wave - 1);
}

/** True on every fifth wave, when the Gloomlord arrives. */
export function isBossWave(wave) {
  return wave % WAVE.bossEvery === 0;
}

/** The kinds the director may buy on this wave. */
export function unlockedKinds(wave) {
  return Object.keys(UNLOCKS).filter((kind) => UNLOCKS[kind] <= wave);
}

/**
 * The spawn queue for a wave: an array of enemy kinds, strongest first, so
 * the early trickle is the wave's teeth and the tail is its fodder.
 */
export function waveComposition(wave, random) {
  const kinds = unlockedKinds(wave);
  let budget = waveBudget(wave);
  const queue = [];
  if (isBossWave(wave)) {
    queue.push('boss');
    budget = Math.floor(budget * 0.5);
  }
  while (budget > 0) {
    const affordable = kinds.filter((kind) => COSTS[kind] <= budget);
    if (affordable.length === 0) break;
    const kind = weightedPick(random, affordable, wave);
    queue.push(kind);
    budget -= COSTS[kind];
  }
  // Heavier kinds first, then shuffle the tail so the wave never feels flat.
  // The boss has no cost (it is pushed, never bought), so it counts as the
  // heaviest kind — otherwise both filters below would drop it and a boss
  // wave would arrive with no Gloomlord at all.
  const heavy = queue.filter((kind) => (COSTS[kind] ?? 99) >= 2);
  const light = queue.filter((kind) => (COSTS[kind] ?? 99) < 2);
  shuffle(random, heavy);
  shuffle(random, light);
  const ordered = [...heavy.slice(0, Math.ceil(heavy.length / 2)), ...light, ...heavy.slice(Math.ceil(heavy.length / 2))];
  // The Gloomlord leads its wave: keep it first instead of shuffled in.
  const bossIndex = ordered.indexOf('boss');
  if (bossIndex > 0) {
    ordered.splice(bossIndex, 1);
    ordered.unshift('boss');
  }
  return ordered;
}

/** Seconds between spawns on this wave, tightening as the waves climb. */
export function spawnInterval(wave) {
  return Math.max(WAVE.spawnIntervalMin, WAVE.spawnInterval - wave * 0.06);
}

/**
 * An enemy's stats on this wave: health grows about 12% a wave, speed a
 * little, so later waves are denser and tougher rather than just more.
 */
export function enemyStats(kind, wave) {
  const base = ENEMIES[kind];
  const growth = 1 + (wave - 1) * 0.12;
  return {
    radius: base.radius,
    speed: base.speed * (1 + Math.min(0.4, (wave - 1) * 0.02)),
    hp: Math.round(base.hp * growth),
    maxHp: Math.round(base.hp * growth),
    damage: base.damage,
    score: base.score,
    color: base.color,
    ember: base.ember,
  };
}

/** A spawn point on the arena's edge, at least 220 px from the player. */
export function spawnPoint(random, player) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const side = Math.floor(random() * 4);
    let x;
    let y;
    if (side === 0) {
      x = range(random, 24, 936);
      y = 24;
    } else if (side === 1) {
      x = range(random, 24, 936);
      y = 576;
    } else if (side === 2) {
      x = 24;
      y = range(random, 24, 576);
    } else {
      x = 936;
      y = range(random, 24, 576);
    }
    if (Math.hypot(x - player.x, y - player.y) > 220) return { x, y };
  }
  return { x: 24, y: 24 };
}
