// A small seeded random source (mulberry32), so screenshot scenes and the
// autopilot replay the same world from the same seed, and the live game can
// still draw from Math.random through the same helpers.
export function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** A random integer in [min, max]. */
export function rangeInt(random, min, max) {
  return Math.floor(range(random, min, max + 1));
}

/** One random element of an array. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

/** The array shuffled in place (Fisher-Yates), returned for chaining. */
export function shuffle(random, items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const held = items[index];
    items[index] = items[other];
    items[other] = held;
  }
  return items;
}

/** Clamp a value into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between two numbers. */
export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

/** The shortest signed angle from `from` to `to`, in (-PI, PI]. */
export function angleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}
