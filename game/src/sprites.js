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
