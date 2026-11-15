// Lumenfall's world: the whole simulation — the Warden, the Hollow, bullets,
// particles, pickups, the combo, and the wave flow. It advances in fixed
// 1/60 s steps and uses only its own seeded random source, so a screenshot
// scene replays the same world from the same seed.
import { COMBO_MAX, COMBO_WINDOW, ENEMIES, FIELD, PLAYER, STEP, WAVE } from './config.js';
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
    pickups: [],
    texts: [],
    spawnQueue: [],
    spawnTimer: 0,
    waveCleared: false,
    shake: 0,
    hitStop: 0,
    flash: 0,
    banner: null,
    stats: { shots: 0, hits: 0, timePlayed: 0 },
    over: false,
  };
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

function spawnEnemy(world, kind, x, y) {
  const stats = enemyStats(kind, world.wave);
  world.enemies.push({
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: stats.hp,
    maxHp: stats.hp,
    radius: stats.radius,
    speed: stats.speed,
    damage: stats.damage,
    score: stats.score,
    color: stats.color,
    ember: stats.ember,
    angle: 0,
    fireTimer: range(world.random, 1.2, 2.4),
    burstTimer: 3,
    summonTimer: 7,
    wobble: world.random() * Math.PI * 2,
    flash: 0,
    knockX: 0,
    knockY: 0,
  });
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
  burstParticles(world, enemy.x, enemy.y, enemy.color, enemy.kind === 'boss' ? 60 : 14, 260, 0.6, 4);
  burstParticles(world, enemy.x, enemy.y, '#ffffff', 6, 160, 0.35, 2.5);
  for (let index = 0; index < enemy.ember; index += 1) {
    dropPickup(world, enemy.x + range(world.random, -14, 14), enemy.y + range(world.random, -14, 14), 'ember');
  }
  if (enemy.kind === 'brute' || enemy.kind === 'boss') {
    if (world.random() < 0.5) dropPickup(world, enemy.x, enemy.y, 'heart');
  }
  if (enemy.kind === 'splitter') {
    spawnEnemy(world, 'skitter', enemy.x - 12, enemy.y);
    spawnEnemy(world, 'skitter', enemy.x + 12, enemy.y);
  }
  if (enemy.kind === 'brute') world.shake = Math.max(world.shake, 5);
  if (enemy.kind === 'boss') {
    world.shake = 14;
    world.hitStop = 0.12;
    world.flash = 0.35;
    world.banner = { text: 'THE GLOOMLORD FALLS', sub: `+${gained} — the light holds`, timer: 2.4 };
  }
  audio?.enemyDie();
}

function damagePlayer(world, amount, audio) {
  const player = world.player;
  if (player.invulnerable > 0 || player.dashTimer > 0 || world.over) return;
  player.hp -= amount;
  player.invulnerable = PLAYER.invulnerableTime;
  world.shake = Math.max(world.shake, 9);
  world.flash = 0.25;
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
      life: player.bulletLife,
      maxLife: player.bulletLife,
      radius: 4,
      hit: new Set(),
    });
  }
  player.muzzle = 0.06;
  world.stats.shots += count;
  audio?.shoot();
}

function fireEnemyOrb(world, enemy) {
  const player = world.player;
  const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  world.enemyBullets.push({
    x: enemy.x + Math.cos(angle) * (enemy.radius + 4),
    y: enemy.y + Math.sin(angle) * (enemy.radius + 4),
    vx: Math.cos(angle) * 185,
    vy: Math.sin(angle) * 185,
    damage: enemy.damage,
    life: 5,
    radius: 6,
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
    });
  }
}

function updatePlayer(world, dt, input, audio) {
  const player = world.player;
  if (player.fireTimer > 0) player.fireTimer -= dt;
  if (player.dashCooldown > 0) player.dashCooldown -= dt;
  if (player.invulnerable > 0) player.invulnerable -= dt;
  if (player.muzzle > 0) player.muzzle -= dt;
  if (player.novaCooldown > 0) player.novaCooldown -= dt;

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
    } else if (enemy.kind === 'boss') {
      const enraged = enemy.hp < enemy.maxHp * 0.5;
      const speed = enemy.speed * (enraged ? 1.6 : 1);
      enemy.vx = nx * speed;
      enemy.vy = ny * speed;
      enemy.burstTimer -= dt * (enraged ? 1.6 : 1);
      enemy.summonTimer -= dt;
      if (enemy.burstTimer <= 0) {
        enemy.burstTimer = 4;
        radialBurst(world, enemy, 10, 150);
        audio?.bossRoar();
      }
      if (enemy.summonTimer <= 0) {
        enemy.summonTimer = 8;
        for (let count = 0; count < 3; count += 1) {
          spawnEnemy(world, 'drifter', enemy.x + range(world.random, -60, 60), enemy.y + range(world.random, -60, 60));
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
    if (distance < player.magnetRadius) {
      const pull = 420 * dt;
      pickup.x += ((player.x - pickup.x) / Math.max(1, distance)) * pull;
      pickup.y += ((player.y - pickup.y) / Math.max(1, distance)) * pull;
    }
    if (distance < PLAYER.pickupRadius) {
      if (pickup.kind === 'ember') {
        world.score += pickup.value;
        audio?.pickup();
      } else {
        player.hp = Math.min(player.maxHp, player.hp + pickup.value);
        addText(world, player.x, player.y - 24, '+1 HP', '#ff5d8f', 15);
        audio?.heal();
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
