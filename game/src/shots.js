// The screenshot scenes behind ?shot=start|play|draft|over. Each one plays
// the real rules forward from a fresh world for a fixed time, steered by a
// simple autopilot, so the frame is what a short game really looks like and
// the same seed always gives the same frame.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WAVE_CLEAR, applyDraftPick, beginRun, resetWorld, startWave, stepWorld } from './world.js';
import { SCREEN_DRAFT, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { rollDraft, UPGRADES } from './upgrades.js';

const START_SECONDS = 8;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 300;
const SAMPLE = STEP;

/** The autopilot's fake input: it steers the Warden and aims for it. */
export function makeAutopilot(world, view, mode) {
  const pilot = {
    move: { x: 0, y: 0 },
    wantFire: false,
    wantDash: false,
    queue: [],
    aim: { x: FIELD.width / 2, y: FIELD.height / 2 - 100 },
    moveVector() {
      return this.move;
    },
    firing() {
      return this.wantFire;
    },
    dashHeld() {
      return this.wantDash;
    },
    mouse() {
      return this.aim;
    },
  };
  pilot.update = () => {
    const player = world.player;
    let nearest = null;
    let nearestDistance = Infinity;
    let nearCount = 0;
    for (const enemy of world.enemies) {
      const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
      if (distance < 110) nearCount += 1;
    }
    pilot.wantFire = mode !== 'still' && nearest !== null;
    if (mode === 'showcase') {
      // Fires in bursts, so the Hollow pile up around the Warden instead of
      // being mopped up before the frame is taken.
      pilot.wantFire = pilot.wantFire && Math.floor(world.time * 2) % 2 === 0;
    }
    pilot.wantDash = (mode === 'skilled' || mode === 'showcase') && nearCount >= 3 && player.dashCooldown <= 0;
    if (mode === 'still' || nearest === null) {
      pilot.move = { x: 0, y: 0 };
      return;
    }
    // Aim at the nearest Hollow, in canvas pixels.
    pilot.aim = {
      x: nearest.x * view.scale + view.offsetX,
      y: nearest.y * view.scale + view.offsetY,
    };
    const awayX = player.x - nearest.x;
    const awayY = player.y - nearest.y;
    const awayLength = Math.hypot(awayX, awayY) || 1;
    if (mode === 'careless') {
      // A hurried player walks into the swarm and never dashes.
      pilot.move = { x: -awayX / awayLength, y: -awayY / awayLength };
      pilot.wantDash = false;
      return;
    }
    if (nearestDistance < 120) {
      pilot.move = { x: awayX / awayLength, y: awayY / awayLength };
    } else if (nearestDistance > 260) {
      pilot.move = { x: -awayX / awayLength, y: -awayY / awayLength };
    } else {
      // Strafe around the prey, keeping the ideal range.
      pilot.move = { x: -awayY / awayLength, y: awayX / awayLength };
    }
    // Keep off the walls: steer back toward the centre near the edge.
    const margin = 70;
    if (player.x < margin) pilot.move.x = Math.abs(pilot.move.x);
    if (player.x > FIELD.width - margin) pilot.move.x = -Math.abs(pilot.move.x);
    if (player.y < margin) pilot.move.y = Math.abs(pilot.move.y);
    if (player.y > FIELD.height - margin) pilot.move.y = -Math.abs(pilot.move.y);
    const length = Math.hypot(pilot.move.x, pilot.move.y) || 1;
    pilot.move = { x: pilot.move.x / length, y: pilot.move.y / length };
  };
  return pilot;
}

function simulate(world, view, seconds, mode) {
  const pilot = makeAutopilot(world, view, mode);
  const steps = Math.floor(seconds / SAMPLE);
  for (let index = 0; index < steps; index += 1) {
    pilot.update();
    const event = stepWorld(world, SAMPLE, pilot, null);
    if (event === EVENT_OVER) return EVENT_OVER;
    if (event === EVENT_WAVE_CLEAR) return EVENT_WAVE_CLEAR;
  }
  return 0;
}

/**
 * Set `world` to the named scene (start, play, draft or over; any other name
 * is start) and return the screen to draw over it, the draft cards for the
 * draft scene, and the best score to show.
 */
export function stageShot(name, world, view) {
  beginRun(world);
  if (name === 'weapons' || name === 'laser') {
    // The v4 showcase: the Warden already holds the new weapons, so the
    // frame shows them firing instead of hoping a draft rolls them.
    const pick = (id) => applyDraftPick(world, UPGRADES.find((u) => u.id === id));
    if (name === 'weapons') {
      pick('mine-layer');
      pick('scatter-shot');
    } else {
      pick('heavy-rounds');
      pick('heavy-rounds');
      pick('lance-beam');
    }
    // Nine seconds of showcase play; a cleared wave rolls straight into
    // the next one (no draft pick — the weapons are the point), so the
    // frame always shows a live fight.
    const pilot = makeAutopilot(world, view, 'showcase');
    for (let step = 0; step < 9 * 60; step += 1) {
      pilot.update();
      const event = stepWorld(world, SAMPLE, pilot, null);
      if (event === EVENT_WAVE_CLEAR) {
        world.wave += 1;
        startWave(world);
      }
      if (event === EVENT_OVER) break;
    }
    // One last shot, fired point-blank at the frame: a beam lives 0.18 s
    // and pellets 0.6 s, so without this the captured frame could catch
    // the weapon between volleys and show nothing of it.
    if (!world.over) {
      world.player.fireTimer = 0;
      pilot.update();
      pilot.wantFire = true;
      stepWorld(world, SAMPLE, pilot, null);
    }
    return { screen: SCREEN_PLAY, draft: null, best: world.best };
  }
  if (name === 'boss') {
    // Jump straight to wave 5 (a boss wave): the Gloomlord is first in the
    // spawn queue, so a few seconds of showcase play puts it on screen.
    world.wave = 5;
    startWave(world);
    simulate(world, view, 6, 'showcase');
    return { screen: SCREEN_PLAY, draft: null, best: world.best };
  }
  if (name === 'bosskill') {
    // The v5 boss-kill frame: wave 5, the Gloomlord on screen, then a
    // point-blank killing bolt — the frame catches the slow-motion
    // vignette, the fall banner, the ring and the burst mid-flight.
    world.wave = 5;
    startWave(world);
    simulate(world, view, 6, 'showcase');
    const boss = world.enemies.find((e) => e.kind === 'boss');
    if (boss && !world.over) {
      boss.hp = 1;
      world.bullets.push({
        x: boss.x, y: boss.y, vx: 0, vy: 0, damage: 5, pierce: 0, ricochet: 0,
        life: 0.5, maxLife: 0.5, radius: 4, kind: 'bolt', color: '#ffe66d',
        trailColor: 'rgba(255, 230, 109, 0.35)', trail: [], hit: new Set(),
      });
      const pilot = makeAutopilot(world, view, 'still');
      stepWorld(world, SAMPLE, pilot, null);
      // A few more steps so the streak callout fades in and the frame
      // catches it mid-flight (the kill itself is one step old, so the
      // callout would otherwise still be at ~10% opacity).
      for (let i = 0; i < 12; i += 1) stepWorld(world, SAMPLE, pilot, null);
    }
    return { screen: SCREEN_PLAY, draft: null, best: world.best };
  }
  if (name === 'streak') {
    // The v5 game-feel frame: ten seconds of skilled play, then the
    // streak callout and a spray of damage numbers staged on the field —
    // the frame shows what a hot run looks like mid-fight.
    simulate(world, view, 10, 'skilled');
    world.streak = 5;
    world.streakBest = 5;
    world.killCallout = {
      text: 'RAMPAGE',
      sub: '5 kills without a scratch',
      timer: 1.4,
      maxLife: 1.6,
    };
    for (const enemy of world.enemies.slice(0, 4)) {
      world.damageNumbers.push({
        x: enemy.x, y: enemy.y - enemy.radius - 6,
        text: enemy.hp >= 3 ? '3!' : '1', heavy: enemy.hp >= 3,
        life: 0.6, maxLife: 0.7,
      });
    }
    return { screen: SCREEN_PLAY, draft: null, best: world.best };
  }
  if (name !== 'play' && name !== 'draft' && name !== 'over') {
    simulate(world, view, START_SECONDS, 'skilled');
    return { screen: SCREEN_TITLE, draft: null, best: world.best };
  }
  if (name === 'play') {
    // Play through to wave 3 (applying a draft pick at each clear, as a
    // player would), then capture 10 s into it: spitters, shooters and
    // splitters are on the field by then and the frame is dense, not a
    // fresh wave's first trickle.
    let event = 0;
    let guard = 0;
    while (world.wave < 3 && guard < 6) {
      event = simulate(world, view, 90, 'skilled');
      if (event === EVENT_WAVE_CLEAR) {
        guard += 1;
        const draft = rollDraft(world.random, world.player);
        applyDraftPick(world, draft[0]);
        world.wave += 1;
        startWave(world);
      } else {
        break;
      }
    }
    if (event !== EVENT_OVER) {
      // Capture 8 s into the wave with a showcase pilot that fires in
      // bursts: the Hollow pile up around the Warden instead of being
      // mopped up before the frame is taken.
      simulate(world, view, 8, 'showcase');
    }
    return { screen: SCREEN_PLAY, draft: null, best: world.best };
  }
  if (name === 'draft') {
    for (let wave = 0; wave < 4; wave += 1) {
      const event = simulate(world, view, 90, 'skilled');
      if (event === EVENT_WAVE_CLEAR) {
        const draft = rollDraft(world.random, world.player);
        return { screen: SCREEN_DRAFT, draft, best: world.best };
      }
      if (event === EVENT_OVER) break;
    }
    resetWorld(world);
    beginRun(world);
    simulate(world, view, 12, 'skilled');
    return { screen: SCREEN_DRAFT, draft: rollDraft(world.random, world.player), best: world.best };
  }
  // Over: a careless Warden walks into the swarm; a cleared wave rolls into
  // the next one so the Hollow are always there, and if it somehow survives
  // it stops moving and lets them finish the job.
  let event = 0;
  let guard = 0;
  while (event !== EVENT_OVER && guard < 6) {
    event = simulate(world, view, 90, 'careless');
    if (event === EVENT_WAVE_CLEAR) {
      guard += 1;
      world.wave += 1;
      startWave(world);
    }
  }
  if (event !== EVENT_OVER) {
    event = simulate(world, view, 120, 'still');
  }
  if (event !== EVENT_OVER) {
    world.player.hp = 0;
    world.over = true;
    world.best = Math.max(world.best, world.score);
  }
  return { screen: SCREEN_OVER, draft: null, best: world.best };
}
