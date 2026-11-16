// Lumenfall's world: the whole simulation — the Warden, the Hollow, bullets,
// particles, pickups, the combo, and the wave flow. It advances in fixed
// 1/60 s steps and uses only its own seeded random source, so a screenshot
// scene replays the same world from the same seed.
import { BOSS, COMBO_MAX, COMBO_MILESTONES, COMBO_WINDOW, DRONE, ELITE, ENEMIES, FIELD, PLAYER, STEP, WAVE } from './config.js';
import { clamp, makeRandom, range } from './random.js';
import { enemyStats, isBossWave, spawnInterval, spawnPoint, waveComposition } from './waves.js';
import { applyUpgrade } from './upgrades.js';

export const EVENT_NONE = 0;
export const EVENT_WAVE_CLEAR = 1;
export const EVENT_OVER = 2;

function makePlayer() {
  return {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    radius: PLAYER.radius,
    speed: PLAYER.speed,
    fireInterval: PLAYER.fireInterval,
    fireTimer: 0,
    bulletSpeed: PLAYER.bulletSpeed,
    bulletDamage: PLAYER.bulletDamage,
    bulletLife: 0.9,
    projectiles: 1,
    pierce: 0,
    ricochet: 0,
    drones: 0,
    droneAngle: 0,
    droneFireTimer: 0,
    shield: 0,
    magnetTimer: 0,
    ghostTimer: 0,
    dashTimer: 0,
    dashCooldown: 0,
    dashCooldownMax: PLAYER.dashCooldown,
    dashX: 0,
    dashY: 0,
    invulnerable: 0,
    nova: 0,
    novaCooldown: 0,
    magnetRadius: PLAYER.magnetRadius,
    upgrades: {},
    muzzle: 0,
  };
}

/** A fresh world, unplayed. `best` is the saved best score to show. */
export function createWorld(seed, best = 0) {
  const world = {
    seed,
    random: makeRandom(seed),
    time: 0,
    score: 0,
    best,
    combo: 0,
    comboTimer: 0,
    kills: 0,
    wave: 0,
    player: makePlayer(),
    enemies: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    rings: [],
    ghosts: [],
    stars: [],
    ambient: [],
    pickups: [],
    texts: [],
    spawnQueue: [],
    spawnTimer: 0,
    waveCleared: false,
    shake: 0,
    hitStop: 0,
    flash: 0,
    flashColor: 'red',
    bossWarn: 0,
    milestone: 0,
    banner: null,
    stats: { shots: 0, hits: 0, timePlayed: 0 },
    over: false,
  };
  // A fixed backdrop, drawn from the world's own seed: parallax stars and
  // slow-rising embers that make the arena feel alive behind the fight.
  for (let index = 0; index < 80; index += 1) {
    world.stars.push({
      x: world.random() * FIELD.width,
      y: world.random() * FIELD.height,
      size: range(world.random, 0.6, 1.9),
      depth: range(world.random, 0.15, 0.8),
      phase: world.random() * Math.PI * 2,
    });
  }
  for (let index = 0; index < 18; index += 1) {
    world.ambient.push({
      x: world.random() * FIELD.width,
      y: world.random() * FIELD.height,
      speed: range(world.random, 6, 16),
      size: range(world.random, 1, 2.6),
      phase: world.random() * Math.PI * 2,
    });
  }
  return world;
}

/** Returns the world to its unplayed state, keeping the best score and the
 * view transform main.js attached (the aim math reads it every step). */
export function resetWorld(world) {
  const best = world.best;
  const viewScale = world.viewScale;
  const viewOffsetX = world.viewOffsetX;
  const viewOffsetY = world.viewOffsetY;
  const fresh = createWorld(world.seed, best);
  Object.keys(world).forEach((key) => delete world[key]);
  Object.assign(world, fresh);
  if (viewScale !== undefined) world.viewScale = viewScale;
  if (viewOffsetX !== undefined) world.viewOffsetX = viewOffsetX;
  if (viewOffsetY !== undefined) world.viewOffsetY = viewOffsetY;
}

/** Starts a fresh run: wave 1 begins. */
export function beginRun(world) {
  resetWorld(world);
  world.wave = 1;
  startWave(world);
}

/** Begins the current wave: fills the spawn queue and raises its banner. */
export function startWave(world) {
  world.spawnQueue = waveComposition(world.wave, world.random);
  world.spawnTimer = 0.6;
  world.waveCleared = false;
  world.banner = {
    text: isBossWave(world.wave) ? `WAVE ${world.wave} — THE GLOOMLORD` : `WAVE ${world.wave}`,
    sub: isBossWave(world.wave) ? 'Something vast stirs in the dark' : `${world.spawnQueue.length} of the Hollow approach`,
    timer: 2.2,
  };
  // The Gloomlord does not arrive quietly: a warning shake and a red edge.
  if (isBossWave(world.wave)) {
    world.bossWarn = 2.2;
    world.shake = Math.max(world.shake, 12);
  }
}

function burstParticles(world, x, y, color, count, speed, life, size) {
  for (let index = 0; index < count; index += 1) {
    const angle = world.random() * Math.PI * 2;
    const velocity = range(world.random, speed * 0.3, speed);
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: range(world.random, life * 0.5, life),
      maxLife: life,
      size: range(world.random, size * 0.6, size * 1.4),
      color,
      drag: 0.88,
    });
  }
}

function addText(world, x, y, text, color, size = 14) {
  world.texts.push({ x, y, text, life: 0.9, maxLife: 0.9, color, size });
}

/** An expanding shockwave ring: the visual punch of a big kill. */
function pushRing(world, x, y, maxRadius, color, life = 0.45) {
  world.rings.push({ x, y, radius: 8, maxRadius, life, maxLife: life, color });
}

function spawnEnemy(world, kind, x, y, allowElite = true, summoned = false) {
  const stats = enemyStats(kind, world.wave);
  const elite = allowElite && kind !== 'boss' && world.wave >= ELITE.minWave && world.random() < ELITE.chance;
  const enemy = {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: elite ? Math.round(stats.hp * ELITE.hpMult) : stats.hp,
    maxHp: elite ? Math.round(stats.hp * ELITE.hpMult) : stats.hp,
    radius: elite ? stats.radius * ELITE.radiusMult : stats.radius,
    speed: stats.speed,
    damage: stats.damage,
    score: elite ? stats.score * ELITE.scoreMult : stats.score,
    color: stats.color,
    ember: elite ? stats.ember * ELITE.emberMult : stats.ember,
    elite,
    // True when the Gloomlord summoned this one: the summon cap counts them.
    summoned,
    angle: 0,
    fireTimer: range(world.random, 1.2, 2.4),
    burstTimer: 3,
    summonTimer: 7,
    wobble: world.random() * Math.PI * 2,
    flash: 0,
    knockX: 0,
    knockY: 0,
    // The dasher's hunt: stalk in, telegraph the charge, then burst at the
    // Warden along the line it locked when the telegraph ended.
    state: 'stalk',
    stateTimer: range(world.random, 0.8, 1.4),
    chargeX: 0,
    chargeY: 0,
    // The shooter's burst: how many orbs are left in the volley, and the
    // beat between them.
    burstLeft: 0,
    burstTick: 0,
    // The Gloomlord's attack modes: 0 radial burst, 1 gapped ring, 2 summon.
    modeIndex: 0,
    modeTimer: BOSS.attackCycle,
  };
  world.enemies.push(enemy);
  return enemy;
}

function dropPickup(world, x, y, kind) {
  world.pickups.push({
    kind,
    x,
    y,
    vx: range(world.random, -40, 40),
    vy: range(world.random, -40, 40),
    value: kind === 'heart' ? 1 : 10,
    life: 12,
  });
}

function killEnemy(world, enemy, audio) {
  world.kills += 1;
  world.combo = Math.min(COMBO_MAX, world.combo + 1);
  world.comboTimer = COMBO_WINDOW;
  const gained = enemy.score * world.combo;
  world.score += gained;
  addText(world, enemy.x, enemy.y - enemy.radius, `+${gained}`, '#ffe66d', world.combo >= 3 ? 17 : 14);
  // Combo milestones pay out once per run: a gold popup, a bonus and embers.
  const milestoneBonus = COMBO_MILESTONES[world.combo];
  if (milestoneBonus !== undefined && world.milestone < world.combo) {
    world.milestone = world.combo;
    world.score += milestoneBonus;
    addText(world, world.player.x, world.player.y - 40, `COMBO x${world.combo}! +${milestoneBonus}`, '#ffd166', 20);
    for (let index = 0; index < 3; index += 1) {
      dropPickup(world, world.player.x + range(world.random, -30, 30), world.player.y + range(world.random, -30, 30), 'ember');
    }
    audio?.draft();
  }
  burstParticles(world, enemy.x, enemy.y, enemy.color, enemy.kind === 'boss' ? 60 : enemy.elite ? 34 : 14, 260, 0.6, 4);
  burstParticles(world, enemy.x, enemy.y, '#ffffff', 6, 160, 0.35, 2.5);
  if (enemy.kind === 'brute' || enemy.elite) {
    pushRing(world, enemy.x, enemy.y, enemy.elite ? 110 : 80, enemy.color);
  }
  for (let index = 0; index < enemy.ember; index += 1) {
    dropPickup(world, enemy.x + range(world.random, -14, 14), enemy.y + range(world.random, -14, 14), 'ember');
  }
  if (enemy.kind === 'brute' || enemy.kind === 'boss') {
    if (world.random() < 0.5) dropPickup(world, enemy.x, enemy.y, 'heart');
  }
  // Elites always leave a shield behind; brutes sometimes leave a magnet.
  if (enemy.elite) dropPickup(world, enemy.x, enemy.y, 'shield');
  if (enemy.kind === 'brute' && world.random() < 0.3) dropPickup(world, enemy.x, enemy.y, 'magnet');
  if (enemy.kind === 'splitter') {
    // The split is the point: a green ring, a SPLIT! callout, and the two
    // mites bursting apart so the player sees the threat double.
    pushRing(world, enemy.x, enemy.y, 64, '#7dff9e', 0.5);
    addText(world, enemy.x, enemy.y - enemy.radius - 8, 'SPLIT!', '#7dff9e', 15);
    const left = spawnEnemy(world, 'skitter', enemy.x - 12, enemy.y, false);
    const right = spawnEnemy(world, 'skitter', enemy.x + 12, enemy.y, false);
    left.knockX = -140;
    right.knockX = 140;
  }
  if (enemy.kind === 'brute') world.shake = Math.max(world.shake, 5);
  if (enemy.kind === 'boss') {
    world.shake = 14;
    world.hitStop = 0.12;
    world.flash = 0.35;
    world.flashColor = 'red';
    pushRing(world, enemy.x, enemy.y, 220, '#ff2e63', 0.7);
    world.banner = { text: 'THE GLOOMLORD FALLS', sub: `+${gained} — the light holds`, timer: 2.4 };
  }
  audio?.enemyDie();
}

function damagePlayer(world, amount, audio) {
  const player = world.player;
  if (player.invulnerable > 0 || player.dashTimer > 0 || world.over) return;
  // A shield takes the hit instead: no health lost, no combo lost, just a
  // bright ring and the shield shattering.
  if (player.shield > 0) {
    player.shield -= 1;
    player.invulnerable = 0.6;
    pushRing(world, player.x, player.y, 70, '#7ef0e0');
    burstParticles(world, player.x, player.y, '#7ef0e0', 16, 260, 0.5, 3);
    addText(world, player.x, player.y - 28, 'SHIELD!', '#7ef0e0', 16);
    audio?.shield();
    return;
  }
  player.hp -= amount;
  player.invulnerable = PLAYER.invulnerableTime;
  world.shake = Math.max(world.shake, 9);
  world.flash = 0.25;
  world.flashColor = 'red';
  world.combo = 0;
  world.comboTimer = 0;
  burstParticles(world, player.x, player.y, '#ff4d6d', 18, 300, 0.6, 4);
  audio?.hurt();
  if (player.hp <= 0) {
    player.hp = 0;
    world.over = true;
    world.best = Math.max(world.best, world.score);
    burstParticles(world, player.x, player.y, '#7ef0e0', 50, 380, 1.1, 5);
    burstParticles(world, player.x, player.y, '#ffd166', 30, 260, 0.9, 4);
    audio?.gameOver();
  }
}

function fireBullets(world, audio) {
  const player = world.player;
  const count = player.projectiles;
  const spread = 0.14;
  for (let index = 0; index < count; index += 1) {
    const offset = count === 1 ? 0 : (index - (count - 1) / 2) * spread;
    const angle = player.angle + offset;
    world.bullets.push({
      x: player.x + Math.cos(angle) * (player.radius + 6),
      y: player.y + Math.sin(angle) * (player.radius + 6),
      vx: Math.cos(angle) * player.bulletSpeed,
      vy: Math.sin(angle) * player.bulletSpeed,
      damage: player.bulletDamage,
      pierce: player.pierce,
      ricochet: player.ricochet,
      life: player.bulletLife,
      maxLife: player.bulletLife,
      radius: 4,
      trail: [],
      hit: new Set(),
    });
  }
  player.muzzle = 0.06;
  world.stats.shots += count;
  audio?.shoot();
}

function fireEnemyOrb(world, enemy, speed = 185, spread = 0, color = '#ff4d8d') {
  const player = world.player;
  const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x) + spread;
  world.enemyBullets.push({
    x: enemy.x + Math.cos(angle) * (enemy.radius + 4),
    y: enemy.y + Math.sin(angle) * (enemy.radius + 4),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage: enemy.damage,
    life: 5,
    radius: 6,
    color,
  });
}

function radialBurst(world, enemy, count, speed) {
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + world.random() * 0.3;
    world.enemyBullets.push({
      x: enemy.x + Math.cos(angle) * (enemy.radius + 4),
      y: enemy.y + Math.sin(angle) * (enemy.radius + 4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: enemy.damage,
      life: 6,
      radius: 6,
      color: '#ff4d8d',
    });
  }
}

/**
 * The Gloomlord's ring: a full circle of orbs with a gap of BOSS.ringGap
 * missing in a row, so the Warden can slip through instead of only tanking
 * it. The gap's position is random each ring.
 */
function gappedRing(world, enemy) {
  const count = BOSS.ringCount;
  const gapStart = Math.floor(world.random() * count);
  for (let index = 0; index < count; index += 1) {
    const offset = (index - gapStart + count) % count;
    if (offset < BOSS.ringGap) continue;
    const angle = (index / count) * Math.PI * 2;
    world.enemyBullets.push({
      x: enemy.x + Math.cos(angle) * (enemy.radius + 4),
      y: enemy.y + Math.sin(angle) * (enemy.radius + 4),
      vx: Math.cos(angle) * BOSS.ringSpeed,
      vy: Math.sin(angle) * BOSS.ringSpeed,
      damage: enemy.damage,
      life: 6,
      radius: 6,
      color: '#ff4d8d',
    });
  }
  pushRing(world, enemy.x, enemy.y, 110, '#ff2e63', 0.5);
}

/**
 * The Gloomlord's summons: a batch of drifters and skitters, but never more
 * than BOSS.summonCap of its minions alive at once — the arena stays
 * readable no matter how long the fight runs.
 */
function summonMinions(world, enemy) {
  let alive = 0;
  for (const other of world.enemies) {
    if (other.summoned) alive += 1;
  }
  const batch = Math.min(BOSS.summonBatch, Math.max(0, BOSS.summonCap - alive));
  for (let count = 0; count < batch; count += 1) {
    const kind = world.random() < 0.6 ? 'drifter' : 'skitter';
    spawnEnemy(world, kind, enemy.x + range(world.random, -60, 60), enemy.y + range(world.random, -60, 60), false, true);
  }
  if (batch > 0) {
    burstParticles(world, enemy.x, enemy.y, '#ff2e63', 18, 220, 0.5, 3);
    addText(world, enemy.x, enemy.y - enemy.radius - 10, `SUMMON x${batch}`, '#ff8fa3', 15);
  }
}

function updatePlayer(world, dt, input, audio) {
  const player = world.player;
  if (player.fireTimer > 0) player.fireTimer -= dt;
  if (player.dashCooldown > 0) player.dashCooldown -= dt;
  if (player.invulnerable > 0) player.invulnerable -= dt;
  if (player.muzzle > 0) player.muzzle -= dt;
  if (player.novaCooldown > 0) player.novaCooldown -= dt;
  if (player.magnetTimer > 0) player.magnetTimer -= dt;
  if (player.droneFireTimer > 0) player.droneFireTimer -= dt;
  if (player.drones > 0) player.droneAngle += DRONE.orbitSpeed * dt;

  const move = input.moveVector();
  const mouse = input.mouse();
  const scale = world.viewScale ?? 1;
  const offsetX = world.viewOffsetX ?? 0;
  const offsetY = world.viewOffsetY ?? 0;
  const aimX = (mouse.x - offsetX) / scale;
  const aimY = (mouse.y - offsetY) / scale;
  player.angle = Math.atan2(aimY - player.y, aimX - player.x);

  const wantDash = (input.dashHeld() || input.queue.includes('Dash')) && player.dashCooldown <= 0 && player.dashTimer <= 0;
  if (wantDash) {
    const direction = move.x !== 0 || move.y !== 0 ? move : { x: Math.cos(player.angle), y: Math.sin(player.angle) };
    player.dashTimer = PLAYER.dashTime;
    player.dashCooldown = player.dashCooldownMax;
    player.dashX = direction.x;
    player.dashY = direction.y;
    burstParticles(world, player.x, player.y, '#7ef0e0', 10, 200, 0.4, 3);
    audio?.dash();
  }
  input.queue.length = 0;

  if (player.dashTimer > 0) {
    player.dashTimer -= dt;
    player.vx = player.dashX * PLAYER.dashSpeed;
    player.vy = player.dashY * PLAYER.dashSpeed;
    // The dash leaves afterimages: a ghost every few steps, fading fast.
    player.ghostTimer -= dt;
    if (player.ghostTimer <= 0) {
      player.ghostTimer = 0.03;
      world.ghosts.push({ x: player.x, y: player.y, angle: player.angle, life: 0.28, maxLife: 0.28 });
    }
  } else {
    player.vx = move.x * player.speed;
    player.vy = move.y * player.speed;
  }
  player.x = clamp(player.x + player.vx * dt, player.radius, FIELD.width - player.radius);
  player.y = clamp(player.y + player.vy * dt, player.radius, FIELD.height - player.radius);

  if (input.firing() && player.fireTimer <= 0) {
    player.fireTimer = player.fireInterval;
    fireBullets(world, audio);
  }

  // Orbital drones: each one circles the Warden and, on its own beat,
  // shoots the nearest Hollow in range.
  if (player.drones > 0 && player.droneFireTimer <= 0 && world.enemies.length > 0) {
    player.droneFireTimer = DRONE.fireInterval;
    for (let drone = 0; drone < player.drones; drone += 1) {
      const orbit = player.droneAngle + (drone * Math.PI * 2) / player.drones;
      const droneX = player.x + Math.cos(orbit) * DRONE.orbitRadius;
      const droneY = player.y + Math.sin(orbit) * DRONE.orbitRadius;
      let target = null;
      let targetDistance = DRONE.range;
      for (const enemy of world.enemies) {
        const distance = Math.hypot(enemy.x - droneX, enemy.y - droneY);
        if (distance < targetDistance) {
          targetDistance = distance;
          target = enemy;
        }
      }
      if (target) {
        const angle = Math.atan2(target.y - droneY, target.x - droneX);
        world.bullets.push({
          x: droneX + Math.cos(angle) * 10,
          y: droneY + Math.sin(angle) * 10,
          vx: Math.cos(angle) * DRONE.bulletSpeed,
          vy: Math.sin(angle) * DRONE.bulletSpeed,
          damage: DRONE.damage,
          pierce: 0,
          ricochet: 0,
          life: 0.8,
          maxLife: 0.8,
          radius: 3,
          trail: [],
          hit: new Set(),
        });
        world.stats.shots += 1;
        audio?.shoot();
      }
    }
  }

  // The nova answers a crowd: three or more of the Hollow within reach set
  // off a shockwave that blasts them back.
  if (player.nova > 0 && player.novaCooldown <= 0) {
    let near = 0;
    for (const enemy of world.enemies) {
      if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < 150) near += 1;
    }
    if (near >= 3) {
      player.novaCooldown = 6;
      const damage = 3 * player.nova;
      burstParticles(world, player.x, player.y, '#ffd166', 40, 420, 0.7, 5);
      world.shake = Math.max(world.shake, 6);
      audio?.noise({ duration: 0.25, volume: 0.25, frequency: 700 });
      for (let index = world.enemies.length - 1; index >= 0; index -= 1) {
        const enemy = world.enemies[index];
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (distance < 190) {
          enemy.hp -= damage;
          enemy.flash = 0.12;
          const push = 320 / Math.max(40, distance);
          enemy.knockX += ((enemy.x - player.x) / distance) * push;
          enemy.knockY += ((enemy.y - player.y) / distance) * push;
          if (enemy.hp <= 0) {
            killEnemy(world, enemy, audio);
            world.enemies.splice(index, 1);
          }
        }
      }
    }
  }
}

function updateEnemies(world, dt, audio) {
  const player = world.player;
  for (let index = world.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = world.enemies[index];
    if (enemy.flash > 0) enemy.flash -= dt;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;
    enemy.angle = Math.atan2(dy, dx);

    if (enemy.kind === 'skitter') {
      enemy.wobble += dt * 6;
      const wobbleX = -ny * Math.sin(enemy.wobble) * 0.6;
      const wobbleY = nx * Math.sin(enemy.wobble) * 0.6;
      enemy.vx = (nx + wobbleX) * enemy.speed;
      enemy.vy = (ny + wobbleY) * enemy.speed;
    } else if (enemy.kind === 'spitter') {
      enemy.fireTimer -= dt;
      if (distance > 280) {
        enemy.vx = nx * enemy.speed;
        enemy.vy = ny * enemy.speed;
      } else if (distance < 180) {
        enemy.vx = -nx * enemy.speed * 0.8;
        enemy.vy = -ny * enemy.speed * 0.8;
      } else {
        enemy.vx = 0;
        enemy.vy = 0;
      }
      if (enemy.fireTimer <= 0 && distance < 420) {
        enemy.fireTimer = 2.2;
        fireEnemyOrb(world, enemy);
        audio?.tone({ frequency: 340, end: 180, type: 'square', duration: 0.1, volume: 0.1 });
      }
    } else if (enemy.kind === 'dasher') {
      enemy.stateTimer -= dt;
      if (enemy.state === 'stalk') {
        // Creep in at half pace, sizing up the Warden.
        enemy.vx = nx * enemy.speed * 0.55;
        enemy.vy = ny * enemy.speed * 0.55;
        if (enemy.stateTimer <= 0 && distance < 380) {
          enemy.state = 'telegraph';
          enemy.stateTimer = 0.55;
          audio?.tone({ frequency: 880, end: 660, type: 'sine', duration: 0.12, volume: 0.1 });
        }
      } else if (enemy.state === 'telegraph') {
        // Planted, shaking, lit up — the charge is coming.
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.wobble += dt * 30;
        if (enemy.stateTimer <= 0) {
          enemy.state = 'charge';
          enemy.stateTimer = 0.45;
          enemy.chargeX = nx;
          enemy.chargeY = ny;
        }
      } else {
        // The burst itself: fast, straight, and committed.
        enemy.vx = enemy.chargeX * 520;
        enemy.vy = enemy.chargeY * 520;
        if (enemy.stateTimer <= 0) {
          enemy.state = 'stalk';
          enemy.stateTimer = range(world.random, 1.0, 1.6);
        }
      }
    } else if (enemy.kind === 'shooter') {
      // The ranged shooter: hold its ground at mid-range, plant its feet,
      // draw a bead on the Warden (the renderer shows the aim line), then
      // fire a three-round burst — fast enough to threaten, slow enough
      // to sidestep.
      enemy.stateTimer -= dt;
      if (enemy.state === 'stalk') {
        if (distance > 360) {
          enemy.vx = nx * enemy.speed;
          enemy.vy = ny * enemy.speed;
        } else if (distance < 260) {
          enemy.vx = -nx * enemy.speed * 0.8;
          enemy.vy = -ny * enemy.speed * 0.8;
        } else {
          // Strafe around the Warden at firing range.
          enemy.vx = -ny * enemy.speed * 0.5;
          enemy.vy = nx * enemy.speed * 0.5;
        }
        if (enemy.stateTimer <= 0 && distance < 460) {
          enemy.state = 'aim';
          enemy.stateTimer = 0.7;
          audio?.tone({ frequency: 520, end: 940, type: 'sine', duration: 0.15, volume: 0.08 });
        }
      } else if (enemy.state === 'aim') {
        // Planted and aiming: the aim line is the warning.
        enemy.vx = 0;
        enemy.vy = 0;
        if (enemy.stateTimer <= 0) {
          enemy.state = 'fire';
          enemy.stateTimer = 0.45;
          enemy.burstLeft = 3;
          enemy.burstTick = 0;
        }
      } else {
        // The burst: one amber orb every 0.15 s, slight spread.
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.burstTick -= dt;
        if (enemy.burstLeft > 0 && enemy.burstTick <= 0) {
          enemy.burstTick = 0.15;
          enemy.burstLeft -= 1;
          const spread = (enemy.burstLeft - 1) * 0.12;
          fireEnemyOrb(world, enemy, 230, spread, '#ffb703');
          audio?.tone({ frequency: 420, end: 240, type: 'square', duration: 0.08, volume: 0.08 });
        }
        if (enemy.stateTimer <= 0) {
          enemy.state = 'stalk';
          enemy.stateTimer = range(world.random, 1.2, 2.0);
        }
      }
    } else if (enemy.kind === 'boss') {
      const enraged = enemy.hp < enemy.maxHp * 0.5;
      const speed = enemy.speed * (enraged ? 1.6 : 1);
      enemy.vx = nx * speed;
      enemy.vy = ny * speed;
      // The Gloomlord rotates its attack every BOSS.attackCycle seconds:
      // radial burst, then the gapped ring, then summoning minions — each
      // switch announced, so the player can read the phase change.
      enemy.modeTimer -= dt;
      if (enemy.modeTimer <= 0) {
        enemy.modeIndex = (enemy.modeIndex + 1) % 3;
        enemy.modeTimer = BOSS.attackCycle;
        enemy.burstTimer = 1.2;
        enemy.summonTimer = 1.2;
        const names = ['RADIAL BURST', 'THORN RING', 'CALL THE HOLLOW'];
        addText(world, enemy.x, enemy.y - enemy.radius - 34, names[enemy.modeIndex], '#ff2e63', 18);
        audio?.bossRoar();
      }
      if (enemy.modeIndex === 0) {
        enemy.burstTimer -= dt * (enraged ? 1.6 : 1);
        if (enemy.burstTimer <= 0) {
          enemy.burstTimer = 4;
          radialBurst(world, enemy, 10, 150);
          audio?.bossRoar();
        }
      } else if (enemy.modeIndex === 1) {
        enemy.burstTimer -= dt * (enraged ? 1.4 : 1);
        if (enemy.burstTimer <= 0) {
          enemy.burstTimer = 3.2;
          gappedRing(world, enemy);
          audio?.bossRoar();
        }
      } else {
        enemy.summonTimer -= dt * (enraged ? 1.4 : 1);
        if (enemy.summonTimer <= 0) {
          enemy.summonTimer = 6;
          summonMinions(world, enemy);
        }
      }
    } else {
      enemy.vx = nx * enemy.speed;
      enemy.vy = ny * enemy.speed;
    }

    enemy.x += (enemy.vx + enemy.knockX) * dt;
    enemy.y += (enemy.vy + enemy.knockY) * dt;
    enemy.knockX *= 0.86;
    enemy.knockY *= 0.86;
    enemy.x = clamp(enemy.x, enemy.radius, FIELD.width - enemy.radius);
    enemy.y = clamp(enemy.y, enemy.radius, FIELD.height - enemy.radius);

    // Touching the Warden hurts; the Hollow is shoved back so it cannot
    // land a second hit in the same breath.
    if (distance < enemy.radius + player.radius + 2) {
      const before = player.hp;
      damagePlayer(world, enemy.damage, audio);
      if (player.hp < before) {
        enemy.knockX -= nx * 260;
        enemy.knockY -= ny * 260;
      }
    }
  }
}

function updateBullets(world, dt, audio) {
  const player = world.player;
  for (let index = world.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = world.bullets[index];
    bullet.life -= dt;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.trail.push({ x: bullet.x, y: bullet.y });
    if (bullet.trail.length > 6) bullet.trail.shift();
    let dead = bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20;
    if (!dead) {
      for (let enemyIndex = world.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = world.enemies[enemyIndex];
        if (bullet.hit.has(enemy)) continue;
        const distance = Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y);
        if (distance < enemy.radius + bullet.radius) {
          bullet.hit.add(enemy);
          world.stats.hits += 1;
          enemy.hp -= bullet.damage;
          enemy.flash = 0.1;
          const push = enemy.kind === 'brute' || enemy.kind === 'boss' ? 30 : 160;
          enemy.knockX += (bullet.vx / PLAYER.bulletSpeed) * push;
          enemy.knockY += (bullet.vy / PLAYER.bulletSpeed) * push;
          burstParticles(world, bullet.x, bullet.y, '#ffe66d', 4, 140, 0.3, 2.5);
          audio?.hit();
          if (enemy.hp <= 0) {
            killEnemy(world, enemy, audio);
            world.enemies.splice(enemyIndex, 1);
          }
          if (bullet.pierce > 0) {
            bullet.pierce -= 1;
          } else if (bullet.ricochet > 0) {
            // Bounce to the nearest other Hollow still in reach.
            let target = null;
            let targetDistance = 280;
            for (const other of world.enemies) {
              if (bullet.hit.has(other)) continue;
              const otherDistance = Math.hypot(other.x - bullet.x, other.y - bullet.y);
              if (otherDistance < targetDistance) {
                targetDistance = otherDistance;
                target = other;
              }
            }
            if (target) {
              bullet.ricochet -= 1;
              const speed = Math.hypot(bullet.vx, bullet.vy) || PLAYER.bulletSpeed;
              bullet.vx = ((target.x - bullet.x) / targetDistance) * speed;
              bullet.vy = ((target.y - bullet.y) / targetDistance) * speed;
              burstParticles(world, bullet.x, bullet.y, '#ffe66d', 3, 120, 0.25, 2);
            } else {
              dead = true;
            }
          } else {
            dead = true;
          }
          break;
        }
      }
    }
    if (dead) world.bullets.splice(index, 1);
  }

  for (let index = world.enemyBullets.length - 1; index >= 0; index -= 1) {
    const orb = world.enemyBullets[index];
    orb.life -= dt;
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    const distance = Math.hypot(player.x - orb.x, player.y - orb.y);
    const hitPlayer = distance < player.radius + orb.radius;
    if (hitPlayer) damagePlayer(world, orb.damage, audio);
    if (orb.life <= 0 || hitPlayer || orb.x < -20 || orb.x > FIELD.width + 20 || orb.y < -20 || orb.y > FIELD.height + 20) {
      world.enemyBullets.splice(index, 1);
    }
  }
}

function updateParticles(world, dt) {
  for (let index = world.particles.length - 1; index >= 0; index -= 1) {
    const particle = world.particles[index];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= particle.drag;
    particle.vy *= particle.drag;
    if (particle.life <= 0) world.particles.splice(index, 1);
  }
  for (let index = world.rings.length - 1; index >= 0; index -= 1) {
    const ring = world.rings[index];
    ring.life -= dt;
    ring.radius = ring.maxRadius * (1 - Math.max(0, ring.life) / ring.maxLife);
    if (ring.life <= 0) world.rings.splice(index, 1);
  }
  for (let index = world.ghosts.length - 1; index >= 0; index -= 1) {
    const ghost = world.ghosts[index];
    ghost.life -= dt;
    if (ghost.life <= 0) world.ghosts.splice(index, 1);
  }
  for (const ember of world.ambient) {
    ember.y -= ember.speed * dt;
    ember.x += Math.sin(world.time * 0.7 + ember.phase) * 6 * dt;
    if (ember.y < -6) {
      ember.y = FIELD.height + 6;
      ember.x = world.random() * FIELD.width;
    }
  }
  for (let index = world.texts.length - 1; index >= 0; index -= 1) {
    const text = world.texts[index];
    text.life -= dt;
    text.y -= 34 * dt;
    if (text.life <= 0) world.texts.splice(index, 1);
  }
}

function updatePickups(world, dt, audio) {
  const player = world.player;
  for (let index = world.pickups.length - 1; index >= 0; index -= 1) {
    const pickup = world.pickups[index];
    pickup.life -= dt;
    pickup.x += pickup.vx * dt;
    pickup.y += pickup.vy * dt;
    pickup.vx *= 0.9;
    pickup.vy *= 0.9;
    const distance = Math.hypot(player.x - pickup.x, player.y - pickup.y);
    // A live magnet triples the pull radius while it lasts.
    const pullRadius = player.magnetTimer > 0 ? player.magnetRadius * 3 : player.magnetRadius;
    if (distance < pullRadius) {
      const pull = 420 * dt;
      pickup.x += ((player.x - pickup.x) / Math.max(1, distance)) * pull;
      pickup.y += ((player.y - pickup.y) / Math.max(1, distance)) * pull;
    }
    if (distance < PLAYER.pickupRadius) {
      if (pickup.kind === 'ember') {
        world.score += pickup.value;
        audio?.pickup();
      } else if (pickup.kind === 'heart') {
        player.hp = Math.min(player.maxHp, player.hp + pickup.value);
        addText(world, player.x, player.y - 24, '+1 HP', '#ff5d8f', 15);
        audio?.heal();
      } else if (pickup.kind === 'shield') {
        player.shield = Math.min(2, player.shield + pickup.value);
        addText(world, player.x, player.y - 24, 'SHIELD UP', '#7ef0e0', 15);
        audio?.shield();
      } else if (pickup.kind === 'magnet') {
        player.magnetTimer = 8;
        addText(world, player.x, player.y - 24, 'MAGNET 8s', '#ff9f1c', 15);
        audio?.pickup();
      }
      world.pickups.splice(index, 1);
    } else if (pickup.life <= 0) {
      world.pickups.splice(index, 1);
    }
  }
}

/**
 * Advances the world one fixed step. Returns EVENT_WAVE_CLEAR when the wave
 * is cleared, EVENT_OVER when the Warden falls, EVENT_NONE otherwise.
 */
export function stepWorld(world, dt, input, audio) {
  if (world.over) return EVENT_OVER;
  if (world.hitStop > 0) {
    world.hitStop -= dt;
    return EVENT_NONE;
  }
  world.time += dt;
  world.stats.timePlayed += dt;
  if (world.comboTimer > 0) {
    world.comboTimer -= dt;
    if (world.comboTimer <= 0) world.combo = 0;
  }
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 26);
  if (world.flash > 0) world.flash = Math.max(0, world.flash - dt);
  if (world.bossWarn > 0) world.bossWarn = Math.max(0, world.bossWarn - dt);
  if (world.banner && world.banner.timer > 0) world.banner.timer -= dt;

  // Trickle the wave's queue in from the edge, in groups that grow with the
  // wave: later waves arrive as a swarm, not a single file.
  if (world.spawnQueue.length > 0) {
    world.spawnTimer -= dt;
    if (world.spawnTimer <= 0) {
      world.spawnTimer = spawnInterval(world.wave);
      const group = 1 + Math.floor(world.wave / 3);
      for (let count = 0; count < group && world.spawnQueue.length > 0; count += 1) {
        const kind = world.spawnQueue.shift();
        const point = spawnPoint(world.random, world.player);
        spawnEnemy(world, kind, point.x, point.y);
      }
    }
  }

  updatePlayer(world, dt, input, audio);
  if (world.over) return EVENT_OVER;
  updateEnemies(world, dt, audio);
  if (world.over) return EVENT_OVER;
  updateBullets(world, dt, audio);
  if (world.over) return EVENT_OVER;
  updateParticles(world, dt);
  updatePickups(world, dt, audio);

  if (world.spawnQueue.length === 0 && world.enemies.length === 0 && !world.waveCleared) {
    world.waveCleared = true;
    const bonus = 50 * world.wave;
    world.score += bonus;
    if (world.player.hp < world.player.maxHp) world.player.hp = Math.min(world.player.maxHp, world.player.hp + WAVE.clearHeal);
    world.flash = 0.4;
    world.flashColor = 'gold';
    world.banner = { text: `WAVE ${world.wave} CLEARED`, sub: `+${bonus} bonus`, timer: 1.6 };
    return EVENT_WAVE_CLEAR;
  }
  return EVENT_NONE;
}

/** Applies a drafted card to the player. */
export function applyDraftPick(world, upgrade) {
  applyUpgrade(world.player, upgrade);
}

/** The enemy kinds on the field, for the HUD's remaining count. */
export function enemiesRemaining(world) {
  return world.spawnQueue.length + world.enemies.length;
}

export { ENEMIES };
