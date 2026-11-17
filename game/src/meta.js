// Meta-progression (v7): Lumen, a currency earned after every run and spent
// between runs on permanent starting bonuses. The bonuses are deliberately
// small — a few percent or one point of health per level — so they never
// break a single run's balance; they are a slow drip across many runs.
//
// This module is pure: it never touches the DOM or localStorage directly.
// The caller passes a storage-shaped object ({ getItem, setItem }), so the
// same code runs in the browser (window.localStorage) and in Node tests
// (a fake). A missing, corrupt or hostile stored value quietly falls back
// to an empty wallet — never an exception.

export const META_KEY = 'lumenfall-meta';

/** The five permanent upgrade tracks. Prices are per level, rising. */
export const META_TRACKS = [
  {
    id: 'warden-heart',
    name: "Warden's Heart",
    desc: '+1 max health',
    max: 3,
    prices: [40, 80, 140],
  },
  {
    id: 'ember-rounds',
    name: 'Ember Rounds',
    desc: '+5% bullet damage',
    max: 4,
    prices: [25, 45, 75, 115],
  },
  {
    id: 'swift-step',
    name: 'Swift Step',
    desc: '+4% move speed',
    max: 4,
    prices: [25, 45, 75, 115],
  },
  {
    id: 'wide-net',
    name: 'Wide Net',
    desc: '+15% pickup radius',
    max: 4,
    prices: [20, 40, 65, 100],
  },
  {
    id: 'lumen-greed',
    name: 'Lumen Greed',
    desc: '+10% Lumen earned per run',
    max: 4,
    prices: [30, 55, 90, 135],
  },
];

/** The run payout: a flat purse, a little per wave survived, a little per
 * ten Hollow slain. A wave-1 death with a few kills pays 10; a wave-5 run
 * with 60 kills pays 28 — the cheapest first level (20) lands after one
 * decent run, a full track after many. */
export const META_EARN = { base: 10, perWave: 3, perKills: 10 };

/** A fresh, empty wallet. */
export function defaultMeta() {
  return { balance: 0, owned: {} };
}

/** How many levels of a track the wallet holds (0 when unowned). */
export function metaLevel(owned, id) {
  const level = owned?.[id];
  return Number.isInteger(level) && level > 0 ? level : 0;
}

/** The price of the next level of a track, or null when maxed/unknown. */
export function metaPrice(track, level) {
  if (!track || !Number.isInteger(level) || level < 0) return null;
  if (level >= track.max) return null;
  return track.prices[level] ?? null;
}

/**
 * The Lumen a finished run pays. `world` needs only `wave` and `kills`;
 * `owned` is the wallet's owned map (Lumen Greed multiplies the purse).
 */
export function earnLumen(world, owned = {}) {
  const wave = Math.max(0, Math.floor(world?.wave ?? 1));
  const kills = Math.max(0, Math.floor(world?.kills ?? 0));
  const raw = META_EARN.base
    + META_EARN.perWave * Math.max(0, wave - 1)
    + Math.floor(kills / META_EARN.perKills);
  const greed = metaLevel(owned, 'lumen-greed');
  return Math.floor(raw * (1 + 0.1 * greed));
}

/**
 * Buys the next level of a track. Returns { ok, state, reason }: on success
 * `state` is a new wallet with the price deducted and the level raised; on
 * failure `state` is the wallet unchanged and `reason` says why
 * ('unknown' | 'maxed' | 'broke'). The caller saves the returned state.
 */
export function buyMetaUpgrade(state, id) {
  const track = META_TRACKS.find((t) => t.id === id);
  if (!track) return { ok: false, state, reason: 'unknown' };
  const level = metaLevel(state?.owned, id);
  const price = metaPrice(track, level);
  if (price === null) return { ok: false, state, reason: 'maxed' };
  const balance = Number.isInteger(state?.balance) && state.balance > 0 ? state.balance : 0;
  if (balance < price) return { ok: false, state, reason: 'broke' };
  return {
    ok: true,
    state: {
      balance: balance - price,
      owned: { ...state.owned, [id]: level + 1 },
    },
    reason: null,
  };
}

/**
 * Applies the wallet's owned levels to a fresh player (call after
 * beginRun, which rebuilds the player from config). Only starting stats
 * move, and only a little: +1 max health per Heart, +5% damage per Ember
 * Rounds, +4% speed per Swift Step, +15% pickup radius per Wide Net.
 * Lumen Greed pays at the end of a run, so it touches no player stat.
 */
export function applyMetaBonuses(player, owned = {}) {
  const heart = metaLevel(owned, 'warden-heart');
  if (heart > 0) {
    player.maxHp += heart;
    player.hp = player.maxHp;
  }
  const rounds = metaLevel(owned, 'ember-rounds');
  if (rounds > 0) player.bulletDamage *= 1 + 0.05 * rounds;
  const swift = metaLevel(owned, 'swift-step');
  if (swift > 0) player.speed *= 1 + 0.04 * swift;
  const net = metaLevel(owned, 'wide-net');
  if (net > 0) player.magnetRadius *= 1 + 0.15 * net;
  return player;
}

/**
 * Reads the wallet from storage. Anything unexpected — no storage, a
 * missing key, unparsable JSON, a wrong shape, a negative balance, a
 * level above a track's max — quietly yields a sanitised wallet (unknown
 * tracks dropped, over-max levels clamped), never an exception.
 */
export function loadMeta(storage) {
  const fallback = defaultMeta();
  let raw = null;
  try {
    raw = storage?.getItem?.(META_KEY) ?? null;
  } catch {
    return fallback;
  }
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
  const balance = Number.isInteger(parsed.balance) && parsed.balance > 0 ? parsed.balance : 0;
  const owned = {};
  if (parsed.owned && typeof parsed.owned === 'object' && !Array.isArray(parsed.owned)) {
    for (const track of META_TRACKS) {
      const level = parsed.owned[track.id];
      if (Number.isInteger(level) && level > 0) {
        owned[track.id] = Math.min(level, track.max);
      }
    }
  }
  return { balance, owned };
}

/** Writes the wallet to storage; a hostile storage object fails silently. */
export function saveMeta(storage, state) {
  try {
    storage?.setItem?.(META_KEY, JSON.stringify(state ?? defaultMeta()));
  } catch {
    // Private mode or no storage: the wallet simply does not persist.
  }
}

// --- Shop and title hit geometry (logical 960x600 field coordinates) -----

/** The shop's rows and back button, shared by the renderer and the input
 * handling so the drawn boxes and the clickable boxes can never drift. */
export function shopLayout() {
  const rows = META_TRACKS.map((track, index) => ({
    id: track.id,
    x: 130,
    y: 158 + index * (64 + 12),
    width: 700,
    height: 64,
  }));
  return {
    rows,
    back: { x: 380, y: 544, width: 200, height: 34 },
  };
}

/** The title screen's shop button. */
export function titleShopButton() {
  return { x: 350, y: 446, width: 260, height: 42 };
}

function inside(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** Which shop element a logical point hits: { action: 'buy', id },
 * { action: 'back' }, or null. */
export function shopHit(point) {
  const layout = shopLayout();
  for (const row of layout.rows) {
    if (inside(point, row)) return { action: 'buy', id: row.id };
  }
  if (inside(point, layout.back)) return { action: 'back' };
  return null;
}

/** 'shop' when a logical point hits the title screen's shop button. */
export function titleHit(point) {
  return inside(point, titleShopButton()) ? 'shop' : null;
}
