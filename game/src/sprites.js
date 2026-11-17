// Sprite atlas: model-generated neon PNGs in game/assets/, loaded lazily in
// the browser and keyed from black to transparent at load time (the art is
// neon-on-black, so luminance becomes alpha and the glow survives). Every
// draw goes through drawSprite(), which returns false when the sprite is
// missing — the renderer then falls back to its procedural shapes, so a
// missing or failed image can never break the game. In Node (the sim tests)
// there is no DOM, so everything stays null and the procedural art is used.
const DEFS = {
  player: { file: 'player.png', size: 64 },
  drifter: { file: 'drifter.png', size: 48 },
  skitter: { file: 'skitter.png', size: 40 },
  spitter: { file: 'spitter.png', size: 48 },
  shooter: { file: 'shooter.png', size: 52 },
  brute: { file: 'brute.png', size: 76 },
  splitter: { file: 'splitter.png', size: 52 },
  dasher: { file: 'dasher.png', size: 44 },
  boss: { file: 'boss.png', size: 130 },
  bullet: { file: 'bullet.png', size: 24 },
  'enemy-bullet': { file: 'enemy-bullet.png', size: 26 },
  'pickup-shield': { file: 'pickup-shield.png', size: 44 },
  'pickup-magnet': { file: 'pickup-magnet.png', size: 44 },
  // Arena hazards (v7.5): the drifting boulder and the falling meteor,
  // same neon-on-black art as the other sprites. The meteor art's ember
  // trail points down in the file, so the renderer draws it rotated PI.
  boulder: { file: 'boulder.png', size: 64 },
  meteor: { file: 'meteor.png', size: 30 },
  // Shop header emblem (v7.5): a small golden lantern above the title.
  lantern: { file: 'lantern.png', size: 36 },
  // Draft-card icons (v6 integration): one per upgrade, same neon-on-black
  // art, so they key out exactly like the sprites above.
  'icon-heavy-rounds': { file: 'icon-heavy-rounds.png', size: 64 },
  'icon-rapid-trigger': { file: 'icon-rapid-trigger.png', size: 64 },
  'icon-split-shot': { file: 'icon-split-shot.png', size: 64 },
  'icon-piercing': { file: 'icon-piercing.png', size: 64 },
  'icon-swift-boots': { file: 'icon-swift-boots.png', size: 64 },
  'icon-lantern-heart': { file: 'icon-lantern-heart.png', size: 64 },
  'icon-quick-dash': { file: 'icon-quick-dash.png', size: 64 },
  'icon-ember-magnet': { file: 'icon-ember-magnet.png', size: 64 },
  'icon-long-barrel': { file: 'icon-long-barrel.png', size: 64 },
  'icon-nova-burst': { file: 'icon-nova-burst.png', size: 64 },
  'icon-orbital-drone': { file: 'icon-orbital-drone.png', size: 64 },
  'icon-ricochet-rounds': { file: 'icon-ricochet-rounds.png', size: 64 },
  'icon-scatter-shot': { file: 'icon-scatter-shot.png', size: 64 },
  'icon-lance-beam': { file: 'icon-lance-beam.png', size: 64 },
  'icon-mine-layer': { file: 'icon-mine-layer.png', size: 64 },
};

/** name -> { canvas, w, h } once loaded, null otherwise. */
export const SPRITES = {};
for (const name of Object.keys(DEFS)) SPRITES[name] = null;

let loadStarted = false;

/** Loads every sprite once. Never rejects; a failed image just stays null. */
export function loadSprites() {
  if (loadStarted) return Promise.resolve(SPRITES);
  loadStarted = true;
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(SPRITES);
  }
  const jobs = Object.entries(DEFS).map(([name, def]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        SPRITES[name] = { canvas: keyOut(img), w: def.size, h: 0 };
        SPRITES[name].h = (def.size * img.naturalHeight) / img.naturalWidth;
        // Icons carry wide black margins in the source art (the visible
        // glyph is 12–98px of a 128px canvas), so record the content box
        // now — drawIcon() crops to it and the glyph fills its card slot.
        if (name.startsWith('icon-')) {
          SPRITES[name].box = contentBox(SPRITES[name].canvas);
        }
      } catch {
        SPRITES[name] = null;
      }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = new URL(`../assets/${def.file}`, import.meta.url).href;
  }));
  return Promise.all(jobs).then(() => SPRITES);
}

/** Background plates: full-frame art, drawn raw — never keyed. The nebula
 * must stay opaque (its dark areas are the arena's floor, not holes), and
 * the ring is composited additively instead, so black adds nothing. */
const BACKGROUNDS = {
  nebula: { file: 'bg-nebula-far.jpg', img: null },
  ring: { file: 'bg-ring-mid.jpg', img: null },
  // Title-screen hero plate (v7.5): the title draws this instead of the
  // arena backdrop, so the two never fight. Drawn raw, never keyed.
  hero: { file: 'bg-hero.jpg', img: null },
};

let backgroundsStarted = false;

/** Loads the background plates once. Never rejects; a failed image just
 * stays null and the renderer falls back to the procedural arena. */
export function loadBackgrounds() {
  if (backgroundsStarted) return Promise.resolve(BACKGROUNDS);
  backgroundsStarted = true;
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(BACKGROUNDS);
  }
  const jobs = Object.entries(BACKGROUNDS).map(([name, def]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      def.img = img;
      resolve();
    };
    img.onerror = () => resolve();
    img.src = new URL(`../assets/${def.file}`, import.meta.url).href;
  }));
  return Promise.all(jobs).then(() => BACKGROUNDS);
}

/** The loaded background plate, or null when it failed / is not loaded. */
export function backgroundImage(name) {
  return BACKGROUNDS[name]?.img ?? null;
}

/** Neon-on-black keying: luminance becomes alpha, colour stays as-is. */
function keyOut(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = Math.max(px[i], px[i + 1], px[i + 2]);
    px[i + 3] = lum < 20 ? 0 : lum;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** The tight box around the keyed art's visible pixels, or null when the
 * canvas is empty. Used to crop icons whose source art has wide black
 * margins — without it a 6px-wide beam would stay 6px wide at any size. */
function contentBox(canvas) {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Draws a loaded sprite centred at (x, y), rotated by `angle` (the art
 * faces right, so angle 0 points along +x). Returns false when the sprite
 * is not loaded — the caller draws its procedural shape instead.
 */
export function drawSprite(ctx, name, x, y, angle = 0, alpha = 1) {
  const sprite = SPRITES[name];
  if (!sprite) return false;
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
  ctx.restore();
  return true;
}

/**
 * Draws an icon cropped to its visible content and scaled to fit `size`
 * on its long side, centred at (cx, cy). A thin glyph (a 6px-wide beam)
 * fills the slot instead of staying a hairline. Returns false when the
 * icon is not loaded; falls back to the plain draw when no content box
 * was recorded.
 */
export function drawIcon(ctx, name, cx, cy, size = 64) {
  const sprite = SPRITES[name];
  if (!sprite) return false;
  if (!sprite.box) return drawSprite(ctx, name, cx, cy);
  const { x, y, w, h } = sprite.box;
  const scale = Math.min(size / w, size / h);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.drawImage(sprite.canvas, x, y, w, h, (-w * scale) / 2, (-h * scale) / 2, w * scale, h * scale);
  ctx.restore();
  return true;
}
