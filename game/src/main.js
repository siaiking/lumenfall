// Lumenfall's entry point: boots the canvas, runs the fixed-step loop, and
// owns the screen state machine (title, play, draft, pause, game over). In
// shot mode (?shot=<scene>&seed=<n>) it stages one deterministic scene,
// draws it once, and raises window.__shotReady for the screenshot taker.
import { AudioEngine } from './audio.js';
import { FIELD, STEP } from './config.js';
import { Input } from './input.js';
import { drawGame, SCREEN_DRAFT, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { makeAutopilot, stageShot } from './shots.js';
import { loadSprites } from './sprites.js';
import { applyDraftPick, beginRun, createWorld, EVENT_OVER, EVENT_WAVE_CLEAR, startWave, stepWorld, timeScale } from './world.js';
import { rollDraft } from './upgrades.js';

const BEST_KEY = 'lumenfall-best';
const DRAFT_CARD = { width: 240, height: 200, gap: 28, y: 200 };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const input = new Input(canvas);
const audio = new AudioEngine();

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

let best = 0;
try {
  best = Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
} catch {
  best = 0;
}

const world = createWorld(seed, best);
const view = { scale: 1, offsetX: 0, offsetY: 0 };
let screen = SCREEN_TITLE;
let draft = null;
let hover = -1;
let isNewBest = false;

// A read-only handle for play-testing (and for the live browser's checks):
// the world, the current screen and the draft cards, nothing that plays the
// game by itself.
window.__lumenfall = { world, screen: () => screen, draft: () => draft };

function saveBest() {
  try {
    window.localStorage.setItem(BEST_KEY, String(world.best));
  } catch {
    // Private mode or no storage: the best score simply does not persist.
  }
}

/** Fits the 960x600 field into the window, letterboxed, at device pixels. */
function resize() {
  const deviceRatio = window.devicePixelRatio || 1;
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;
  const scale = Math.min(cssWidth / FIELD.width, cssHeight / FIELD.height);
  view.scale = scale;
  view.offsetX = (cssWidth - FIELD.width * scale) / 2;
  view.offsetY = (cssHeight - FIELD.height * scale) / 2;
  canvas.width = Math.round(cssWidth * deviceRatio);
  canvas.height = Math.round(cssHeight * deviceRatio);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  world.viewScale = scale;
  world.viewOffsetX = view.offsetX;
  world.viewOffsetY = view.offsetY;
}
window.addEventListener('resize', resize);
resize();

/** The mouse position in the field's logical coordinates. */
function logicalMouse() {
  const mouse = input.mouse();
  return {
    x: (mouse.x - view.offsetX) / view.scale,
    y: (mouse.y - view.offsetY) / view.scale,
  };
}

/** Which draft card (if any) the mouse hovers, by the renderer's layout. */
function draftHover() {
  const mouse = logicalMouse();
  const total = DRAFT_CARD.width * 3 + DRAFT_CARD.gap * 2;
  const startX = (FIELD.width - total) / 2;
  if (mouse.y < DRAFT_CARD.y || mouse.y > DRAFT_CARD.y + DRAFT_CARD.height) return -1;
  for (let index = 0; index < 3; index += 1) {
    const x = startX + index * (DRAFT_CARD.width + DRAFT_CARD.gap);
    if (mouse.x >= x && mouse.x <= x + DRAFT_CARD.width) return index;
  }
  return -1;
}

function drawFrame(drawWorld) {
  const deviceRatio = window.devicePixelRatio || 1;
  ctx.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);
  ctx.fillStyle = '#070a14';
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.setTransform(deviceRatio * view.scale, 0, 0, deviceRatio * view.scale, deviceRatio * view.offsetX, deviceRatio * view.offsetY);
  drawGame(ctx, drawWorld, screen, { draft, hover, isNewBest });
}

function startGame() {
  audio.ensure();
  beginRun(world);
  screen = SCREEN_PLAY;
  isNewBest = false;
  audio.waveHorn();
  status.textContent = 'Wave 1. Hold the light.';
}

function pickDraft(index) {
  if (!draft || index < 0 || index >= draft.length) return;
  applyDraftPick(world, draft[index]);
  draft = null;
  world.wave += 1;
  startWave(world);
  screen = SCREEN_PLAY;
  audio.waveHorn();
}

function gameOver() {
  screen = SCREEN_OVER;
  isNewBest = world.score >= world.best && world.score > 0;
  world.best = Math.max(world.best, world.score);
  saveBest();
  status.textContent = `Game over. Score ${world.score}, wave ${world.wave}.`;
}

// Sprites load before the first frame in either mode, so a screenshot
// never catches the procedural stand-ins; a failed load just falls back.
await loadSprites();

if (shotName) {
  // Shot mode: one deterministic frame, then signal readiness.
  const staged = stageShot(shotName, world, view);
  screen = staged.screen;
  draft = staged.draft;
  world.best = staged.best;
  drawFrame(world);
  window.__shotReady = true;
} else {
  // Live mode: an autopilot demo world plays itself behind the title.
  const demoWorld = createWorld(7, best);
  beginRun(demoWorld);
  const demoPilot = makeAutopilot(demoWorld, view, 'skilled');
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min(0.1, (now - last) / 1000);
    last = now;
    // Boss-kill slow motion (v5): the active world runs at quarter speed
    // while its slowMo timer counts down in real time.
    const active = screen === SCREEN_TITLE ? demoWorld : world;
    if (active.slowMo > 0) active.slowMo = Math.max(0, active.slowMo - delta);
    accumulator += delta * timeScale(active);

    if (input.wasPressed('KeyM')) {
      audio.setMuted(!audio.muted);
    }

    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        accumulator -= STEP;
        demoPilot.update();
        const event = stepWorld(demoWorld, STEP, demoPilot, null);
        if (event === EVENT_OVER || event === EVENT_WAVE_CLEAR) {
          beginRun(demoWorld);
        }
      }
      if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter') || input.wasClicked()) {
        startGame();
      }
      drawFrame(demoWorld);
    } else if (screen === SCREEN_PLAY) {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        screen = SCREEN_PAUSED;
      } else {
        while (accumulator >= STEP) {
          accumulator -= STEP;
          const event = stepWorld(world, STEP, input, audio);
          if (event === EVENT_WAVE_CLEAR) {
            // A wave clear ends any slow motion still running: the draft
            // screen should not reopen into quarter speed.
            world.slowMo = 0;
            draft = rollDraft(world.random, world.player);
            screen = SCREEN_DRAFT;
            audio.draft();
            break;
          }
          if (event === EVENT_OVER) {
            gameOver();
            break;
          }
        }
        audio.updateMusic(delta, world.wave);
      }
      drawFrame(world);
    } else if (screen === SCREEN_DRAFT) {
      hover = draftHover();
      if (input.wasPressed('Digit1')) pickDraft(0);
      else if (input.wasPressed('Digit2')) pickDraft(1);
      else if (input.wasPressed('Digit3')) pickDraft(2);
      else if (input.wasClicked() && hover >= 0) pickDraft(hover);
      drawFrame(world);
    } else if (screen === SCREEN_PAUSED) {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape') || input.wasClicked()) {
        screen = SCREEN_PLAY;
      }
      drawFrame(world);
    } else if (screen === SCREEN_OVER) {
      if (input.wasPressed('KeyR') || input.wasPressed('Enter') || input.wasClicked()) {
        startGame();
      }
      drawFrame(world);
    }
    input.endFrame();
  }
  requestAnimationFrame(frame);
}
