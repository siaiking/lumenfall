// Lumenfall's renderer: every pixel the player (and the judge) sees — the
// arena, the Warden, the Hollow, the HUD, and the title, draft, pause and
// game-over screens. Drawing is pure: it reads the world, never mutates it.
import { DRONE, FIELD, PALETTE } from './config.js';
import { backgroundImage, drawIcon, drawSprite } from './sprites.js';
import { WEAPON_NAMES } from './upgrades.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_DRAFT = 'draft';
export const SCREEN_OVER = 'over';
export const SCREEN_PAUSED = 'paused';

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawHeart(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 16, size / 16);
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.bezierCurveTo(-9, -3, -5, -10, 0, -5);
  ctx.bezierCurveTo(5, -10, 9, -3, 0, 5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * Cover-fits a 16:9 plate into the 960x600 (16:10) field: scaled to cover,
 * never stretched, with a 4% overscan so parallax offsets never expose an
 * edge. A missing plate draws nothing — the caller guards with null.
 */
function drawCoverImage(ctx, img, offsetX, offsetY, alpha, composite) {
  const scale = Math.max(FIELD.width / img.naturalWidth, FIELD.height / img.naturalHeight) * 1.04;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.save();
  if (composite) ctx.globalCompositeOperation = composite;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(img, (FIELD.width - w) / 2 + offsetX, (FIELD.height - h) / 2 + offsetY, w, h);
  ctx.restore();
}

/** The arena's painted backdrop (v6 integration): the nebula is the floor,
 * the ring floats above it. Both are optional — a failed load leaves the
 * procedural arena exactly as it was. */
function drawBackground(ctx, world) {
  const nebula = backgroundImage('nebula');
  if (nebula) {
    // Slow drift, at most ~2.4 px/s, inside the overscan slack.
    const driftX = Math.sin(world.time * 0.1) * 24;
    const driftY = Math.cos(world.time * 0.07) * 8;
    drawCoverImage(ctx, nebula, driftX, driftY, 1, null);
  }
  const ring = backgroundImage('ring');
  if (ring) {
    // Parallax: the ring slides against the Warden's position, so the
    // arena reads deeper than a flat backdrop. 'lighter' because the
    // plate is black outside the ring — black adds nothing, so no keying
    // pass is needed. Alpha 0.85 tames the bright metal at the bottom.
    const player = world.player;
    const offsetX = (player.x - FIELD.width / 2) * -0.13;
    const offsetY = (player.y - FIELD.height / 2) * -0.13;
    drawCoverImage(ctx, ring, offsetX, offsetY, 0.85, 'lighter');
  }
}

function drawArena(ctx, world) {
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  drawBackground(ctx, world);
  // Parallax stars: they drift slowly with the clock, each at its own depth,
  // and twinkle — the arena's dark is never flat black.
  ctx.save();
  for (const star of world.stars) {
    const drifted = (star.x + world.time * 6 * star.depth) % FIELD.width;
    ctx.globalAlpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(world.time * 2 + star.phase));
    ctx.fillStyle = '#cdd7ff';
    ctx.fillRect(drifted, star.y, star.size, star.size);
  }
  ctx.restore();
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  for (let x = 40; x < FIELD.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FIELD.height);
    ctx.stroke();
  }
  for (let y = 40; y < FIELD.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD.width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = PALETTE.arenaEdge;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, FIELD.width - 3, FIELD.height - 3);

  // The lantern's light: a soft radial glow that follows the Warden and
  // pushes the dark back — the game's whole look hangs on it.
  const player = world.player;
  const glow = ctx.createRadialGradient(player.x, player.y, 10, player.x, player.y, 260);
  glow.addColorStop(0, 'rgba(255, 209, 102, 0.14)');
  glow.addColorStop(0.5, 'rgba(255, 183, 3, 0.05)');
  glow.addColorStop(1, 'rgba(255, 183, 3, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  // Ambient embers drift up through the dark and wrap around the arena.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const ember of world.ambient) {
    ctx.globalAlpha = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(world.time + ember.phase));
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPickups(ctx, world) {
  for (const pickup of world.pickups) {
    const blink = pickup.life < 3 ? (Math.sin(pickup.life * 12) > 0 ? 1 : 0.35) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    if (pickup.kind === 'ember') {
      ctx.fillStyle = PALETTE.ember;
      ctx.shadowColor = PALETTE.ember;
      ctx.shadowBlur = 10;
      ctx.translate(pickup.x, pickup.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
    } else if (pickup.kind === 'heart') {
      ctx.shadowColor = PALETTE.heart;
      ctx.shadowBlur = 12;
      drawHeart(ctx, pickup.x, pickup.y, 22, PALETTE.heart);
    } else if (pickup.kind === 'shield') {
      // A cyan hex-shield: one blocked hit, waiting to be taken.
      if (!drawSprite(ctx, 'pickup-shield', pickup.x, pickup.y)) {
        ctx.strokeStyle = '#7ef0e0';
        ctx.fillStyle = 'rgba(126, 240, 224, 0.25)';
        ctx.shadowColor = '#7ef0e0';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2;
        ctx.translate(pickup.x, pickup.y);
        ctx.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const angle = (index / 6) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(angle) * 11;
          const y = Math.sin(angle) * 11;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (pickup.kind === 'magnet') {
      // An amber horseshoe magnet: eight seconds of triple pull.
      if (!drawSprite(ctx, 'pickup-magnet', pickup.x, pickup.y)) {
        ctx.strokeStyle = '#ff9f1c';
        ctx.shadowColor = '#ff9f1c';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 5;
        ctx.translate(pickup.x, pickup.y);
        ctx.beginPath();
        ctx.arc(0, -2, 9, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-9, -2);
        ctx.lineTo(-9, 6);
        ctx.moveTo(9, -2);
        ctx.lineTo(9, 6);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawEnemy(ctx, enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  const flash = enemy.flash > 0;
  ctx.fillStyle = flash ? '#ffffff' : enemy.color;
  ctx.strokeStyle = flash ? '#ffffff' : enemy.color;
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = flash ? 18 : 10;
  const radius = enemy.radius;
  // The dasher's telegraph: a flashing red lane along its charge line.
  if (enemy.kind === 'dasher' && enemy.state === 'telegraph') {
    const blink = 0.35 + 0.4 * Math.abs(Math.sin(enemy.wobble));
    ctx.save();
    ctx.rotate(enemy.angle);
    ctx.strokeStyle = `rgba(255, 79, 67, ${blink})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(280, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  // Sprite art first: the art faces right, so it rotates with the heading
  // for the directional kinds and stays put for the round ones.
  const spriteAngle = enemy.kind === 'drifter' ? enemy.angle * 0.3
    : (enemy.kind === 'skitter' || enemy.kind === 'spitter' || enemy.kind === 'shooter' || enemy.kind === 'dasher')
      ? enemy.angle : 0;
  const sprited = drawSprite(ctx, enemy.kind, 0, 0, spriteAngle);
  if (sprited && flash) {
    // Hit flash: a white wash over the sprite instead of a white shape.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (!sprited) {
  if (enemy.kind === 'drifter') {
    ctx.beginPath();
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2 + enemy.angle * 0.3;
      const outer = index % 2 === 0 ? radius : radius * 0.62;
      const x = Math.cos(angle) * outer;
      const y = Math.sin(angle) * outer;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (enemy.kind === 'skitter') {
    ctx.rotate(enemy.angle);
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(-radius * 0.8, radius * 0.75);
    ctx.lineTo(-radius * 0.4, 0);
    ctx.lineTo(-radius * 0.8, -radius * 0.75);
    ctx.closePath();
    ctx.fill();
  } else if (enemy.kind === 'spitter') {
    ctx.rotate(enemy.angle);
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(0, radius * 0.8);
    ctx.lineTo(-radius, 0);
    ctx.lineTo(0, -radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(radius * 0.3, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === 'shooter') {
    // A dart with a long barrel: this one shoots back. While it aims, the
    // muzzle glows brighter as the shot readies.
    ctx.rotate(enemy.angle);
    ctx.fillRect(0, -3, radius * 1.3, 6);
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(0, radius * 0.8);
    ctx.lineTo(-radius, 0);
    ctx.lineTo(0, -radius * 0.8);
    ctx.closePath();
    ctx.fill();
    if (enemy.state === 'aim') {
      const charge = clamp(1 - enemy.stateTimer / 0.7, 0, 1);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + 0.6 * charge})`;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(radius * 1.3, 0, 3 + 4 * charge, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (enemy.kind === 'brute') {
    ctx.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === 'splitter') {
    ctx.beginPath();
    ctx.arc(-radius * 0.35, 0, radius * 0.62, 0, Math.PI * 2);
    ctx.arc(radius * 0.35, 0, radius * 0.62, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.kind === 'dasher') {
    // A dart, nose-first along its heading.
    ctx.rotate(enemy.angle);
    ctx.beginPath();
    ctx.moveTo(radius * 1.25, 0);
    ctx.lineTo(-radius * 0.8, radius * 0.8);
    ctx.lineTo(-radius * 0.3, 0);
    ctx.lineTo(-radius * 0.8, -radius * 0.8);
    ctx.closePath();
    ctx.fill();
  } else if (enemy.kind === 'boss') {
    ctx.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      const outer = index % 2 === 0 ? radius : radius * 0.78;
      const x = Math.cos(angle) * outer;
      const y = Math.sin(angle) * outer;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(-radius * 0.3, -radius * 0.15, 5, 0, Math.PI * 2);
    ctx.arc(radius * 0.3, -radius * 0.15, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  }
  if (enemy.kind === 'boss') {
    // Ring mode: a dashed circle warns that the next attack is the gapped
    // ring, not a chase.
    if (enemy.modeIndex === 1) {
      ctx.strokeStyle = 'rgba(255, 46, 99, 0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, radius + 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // The Gloomlord's health bar, always visible.
    const width = 120;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-width / 2, -radius - 22, width, 8);
    ctx.fillStyle = PALETTE.boss;
    ctx.fillRect(-width / 2, -radius - 22, width * (enemy.hp / enemy.maxHp), 8);
  }
  ctx.restore();

  // Elites wear a gold ring and a star: bigger, tougher, richer.
  if (enemy.elite) {
    ctx.save();
    ctx.strokeStyle = '#ffd166';
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', enemy.x, enemy.y - enemy.radius - 20);
    ctx.restore();
  }

  if (enemy.kind !== 'boss' && enemy.hp < enemy.maxHp) {
    const width = enemy.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 10, width, 4);
    ctx.fillStyle = enemy.color;
    ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 10, width * (enemy.hp / enemy.maxHp), 4);
  }
}

/** The shooter's aim line: a thin dashed lane from the shooter to the
 * Warden while it aims, so the shot is never a surprise. */
function drawAimLines(ctx, world) {
  const player = world.player;
  if (world.over) return;
  ctx.save();
  for (const enemy of world.enemies) {
    if (enemy.kind !== 'shooter' || enemy.state !== 'aim') continue;
    const charge = clamp(1 - enemy.stateTimer / 0.7, 0, 1);
    ctx.strokeStyle = `rgba(247, 37, 133, ${0.35 + 0.45 * charge})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(player.x, player.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawGhosts(ctx, world) {
  ctx.save();
  for (const ghost of world.ghosts) {
    ctx.globalAlpha = (ghost.life / ghost.maxLife) * 0.5;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRings(ctx, world) {
  ctx.save();
  for (const ring of world.rings) {
    const fraction = Math.max(0, ring.life / ring.maxLife);
    ctx.globalAlpha = fraction * 0.9;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(ctx, world) {
  const player = world.player;
  if (world.over) return;
  ctx.save();
  const blink = player.invulnerable > 0 && Math.floor(world.time * 16) % 2 === 0;
  ctx.globalAlpha = blink ? 0.45 : 1;
  ctx.translate(player.x, player.y);
  ctx.shadowColor = PALETTE.lantern;
  ctx.shadowBlur = 22;
  const sprited = drawSprite(ctx, 'player', 0, 0, player.angle);
  if (!sprited) {
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // The lantern points where the Warden aims.
    ctx.rotate(player.angle);
    ctx.fillStyle = PALETTE.lantern;
    ctx.beginPath();
    ctx.arc(player.radius + 4, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // The sprite's nose is the lantern: keep the frame rotated so the
    // muzzle flash below lands at the ship's nose.
    ctx.rotate(player.angle);
  }
  if (player.muzzle > 0) {
    // A four-point star flash at the lantern's mouth.
    const mx = player.radius + (sprited ? 20 : 12);
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    for (let point = 0; point < 8; point += 1) {
      const angle = (point / 8) * Math.PI * 2;
      const outer = point % 2 === 0 ? 11 : 4;
      const x = mx + Math.cos(angle) * outer;
      const y = Math.sin(angle) * outer;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // A held shield rings the Warden in cyan.
  if (player.shield > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(126, 240, 224, 0.9)';
    ctx.shadowColor = '#7ef0e0';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // Orbital drones circle the Warden, each a bright amber bead.
  for (let drone = 0; drone < player.drones; drone += 1) {
    const orbit = player.droneAngle + (drone * Math.PI * 2) / player.drones;
    const droneX = player.x + Math.cos(orbit) * DRONE.orbitRadius;
    const droneY = player.y + Math.sin(orbit) * DRONE.orbitRadius;
    ctx.save();
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(droneX, droneY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5c00';
    ctx.beginPath();
    ctx.arc(droneX, droneY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Dash readiness, as a ring under the Warden.
  if (player.dashCooldown > 0) {
    const fraction = 1 - player.dashCooldown / player.dashCooldownMax;
    ctx.strokeStyle = 'rgba(126, 240, 224, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 8, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
    ctx.stroke();
  }
}

function drawMines(ctx, world) {
  ctx.save();
  for (const mine of world.mines) {
    const armed = mine.arm <= 0;
    const blink = armed ? 0.6 + 0.4 * Math.sin(world.time * 10) : 0.4 + 0.3 * Math.sin(world.time * 4);
    // A spiked dark shell with a blinking core: amber while arming, red
    // once live — the blink is the warning.
    ctx.translate(mine.x, mine.y);
    ctx.fillStyle = '#2a2438';
    ctx.strokeStyle = armed ? `rgba(255, 77, 109, ${blink})` : `rgba(255, 159, 28, ${blink})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = armed ? '#ff4d6d' : '#ff9f1c';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const outer = index % 2 === 0 ? mine.radius : mine.radius * 0.6;
      const x = Math.cos(angle) * outer;
      const y = Math.sin(angle) * outer;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = armed ? '#ff4d6d' : '#ff9f1c';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(-mine.x, -mine.y);
  }
  ctx.restore();
}

/** The lance beams: a fading cyan-white line down the aim direction. */
function drawBeams(ctx, world) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const beam of world.beams) {
    const fraction = Math.max(0, beam.life / beam.maxLife);
    const endX = beam.x + Math.cos(beam.angle) * beam.length;
    const endY = beam.y + Math.sin(beam.angle) * beam.length;
    ctx.globalAlpha = fraction;
    ctx.strokeStyle = 'rgba(126, 240, 224, 0.5)';
    ctx.lineWidth = beam.width + 6;
    ctx.beginPath();
    ctx.moveTo(beam.x, beam.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.strokeStyle = '#b8fff1';
    ctx.lineWidth = beam.width * 0.45;
    ctx.beginPath();
    ctx.moveTo(beam.x, beam.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBullets(ctx, world) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const bullet of world.bullets) {
    const color = bullet.color ?? PALETTE.bullet;
    // The trail: the bullet's last few steps, fading back.
    if (bullet.trail.length > 1) {
      ctx.strokeStyle = bullet.trailColor ?? 'rgba(255, 230, 109, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bullet.trail[0].x, bullet.trail[0].y);
      for (const point of bullet.trail) ctx.lineTo(point.x, point.y);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    }
    const angle = Math.atan2(bullet.vy, bullet.vx);
    if (!drawSprite(ctx, 'bullet', bullet.x, bullet.y, angle)) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const orb of world.enemyBullets) {
    // Shooter orbs are amber, boss and spitter orbs pink: the colour tells
    // the player what fired it.
    const color = orb.color ?? '#ff4d8d';
    if (drawSprite(ctx, 'enemy-bullet', orb.x, orb.y)) continue;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawParticles(ctx, world, screen) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const particle of world.particles) {
    const fraction = particle.life / particle.maxLife;
    ctx.globalAlpha = fraction;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * fraction + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Floating score text belongs to the fight: on the draft or game-over
  // screens it would bleed through the overlay and clutter the panel.
  if (screen !== SCREEN_PLAY) return;
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const text of world.texts) {
    ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1);
    ctx.font = `bold ${text.size}px system-ui, sans-serif`;
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.x, text.y);
  }
  // Damage numbers (v5): small white hit values, gold and larger for heavy
  // hits — drawn with a dark edge so they read over any sprite.
  for (const number of world.damageNumbers) {
    ctx.globalAlpha = clamp(number.life / number.maxLife, 0, 1);
    ctx.font = `bold ${number.heavy ? 19 : 13}px system-ui, sans-serif`;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeText(number.text, number.x, number.y);
    ctx.fillStyle = number.heavy ? '#ffd166' : '#ffffff';
    ctx.fillText(number.text, number.x, number.y);
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx, world) {
  const player = world.player;
  ctx.save();
  ctx.textBaseline = 'middle';
  // Health, top left.
  for (let index = 0; index < player.maxHp; index += 1) {
    drawHeart(ctx, 28 + index * 26, 28, 20, index < player.hp ? PALETTE.heart : 'rgba(255,93,143,0.25)');
  }
  // Shields and drones, as small marks beside the hearts.
  const marksX = 28 + player.maxHp * 26;
  for (let index = 0; index < player.shield; index += 1) {
    ctx.strokeStyle = '#7ef0e0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(marksX + index * 22, 28, 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let index = 0; index < player.drones; index += 1) {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(marksX + player.shield * 22 + 12 + index * 16, 28, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (player.magnetTimer > 0) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#ff9f1c';
    ctx.fillText(`MAGNET ${Math.ceil(player.magnetTimer)}s`, 16, 52);
  }
  // Score and wave, top centre.
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(String(world.score).padStart(6, '0'), FIELD.width / 2, 24);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(`WAVE ${world.wave}  ·  BEST ${Math.max(world.best, world.score)}`, FIELD.width / 2, 48);
  // Remaining Hollow, top right.
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  const remaining = world.spawnQueue.length + world.enemies.length;
  ctx.fillText(`HOLLOW LEFT: ${remaining}`, FIELD.width - 20, 24);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(`KILLS ${world.kills}`, FIELD.width - 20, 46);
  // The equipped weapon, so the player always knows what they are firing.
  const weaponLabel = WEAPON_NAMES[player.weapon] ?? 'PULSE';
  const weaponSuffix = player.weapon === 'pulse' ? '' : ` Lv${player.weaponLevel}`;
  const mineSuffix = player.mineLevel > 0 ? `  ·  MINES Lv${player.mineLevel} (${world.mines.length})` : '';
  ctx.fillText(`WEAPON ${weaponLabel}${weaponSuffix}${mineSuffix}`, FIELD.width - 20, 66);
  // Combo meter, under the score.
  if (world.combo >= 2) {
    const width = 140;
    const fraction = world.comboTimer / 2.5;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, FIELD.width / 2 - width / 2, 62, width, 8, 4);
    ctx.fill();
    ctx.fillStyle = world.combo >= 4 ? '#ffd166' : '#7ef0e0';
    roundRect(ctx, FIELD.width / 2 - width / 2, 62, width * fraction, 8, 4);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`COMBO x${world.combo}`, FIELD.width / 2, 84);
  }
  // Kill streak (v5): a live count under the combo, so the run toward the
  // next title is always visible.
  if (world.streak >= 2) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#ff9f1c';
    ctx.fillText(`STREAK x${world.streak}`, FIELD.width / 2, world.combo >= 2 ? 100 : 84);
  }
  // Controls hint, bottom left, faint.
  ctx.textAlign = 'left';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(139, 147, 184, 0.8)';
  ctx.fillText('WASD move · Mouse aim · Hold click to shoot · Shift dash · P pause · M mute', 16, FIELD.height - 14);
  ctx.restore();
}

/** The kill-streak callout (v5): a big gold title centre-screen, fading in
 * fast and out over its last half-second, with the streak count beneath. */
function drawKillCallout(ctx, world) {
  const callout = world.killCallout;
  if (!callout || callout.timer <= 0) return;
  const elapsed = callout.maxLife - callout.timer;
  const alpha = clamp(Math.min(elapsed / 0.15, callout.timer / 0.5), 0, 1);
  const scale = 1 + 0.25 * Math.max(0, 1 - elapsed / 0.18);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(FIELD.width / 2, FIELD.height / 2 - 130);
  ctx.scale(scale, scale);
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = '#ffb703';
  ctx.shadowBlur = 22;
  ctx.fillText(callout.text, 0, 0);
  ctx.shadowBlur = 0;
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(callout.sub, 0, 30);
  ctx.restore();
}

function drawBanner(ctx, world) {
  if (!world.banner || world.banner.timer <= 0) return;
  const alpha = clamp(world.banner.timer / 0.6, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.shadowColor = PALETTE.lantern;
  ctx.shadowBlur = 24;
  ctx.fillText(world.banner.text, FIELD.width / 2, FIELD.height / 2 - 70);
  ctx.shadowBlur = 0;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(world.banner.sub, FIELD.width / 2, FIELD.height / 2 - 36);
  ctx.restore();
}

function drawTitle(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 10, 20, 0.72)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = PALETTE.lantern;
  ctx.shadowBlur = 30;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('LUMENFALL', FIELD.width / 2, 168);
  ctx.shadowBlur = 0;
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('You are the last Warden. Hold the light against the Hollow.', FIELD.width / 2, 232);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText('WASD move  ·  Mouse aim  ·  Hold click to shoot  ·  Shift to dash', FIELD.width / 2, 268);
  ctx.fillText('Clear a wave, draft an upgrade, face the Gloomlord every 5th wave.', FIELD.width / 2, 292);
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = world.best > 0 ? '#ffd166' : PALETTE.dim;
  ctx.fillText(world.best > 0 ? `BEST SCORE  ${world.best}` : 'No light has fallen yet — be the first.', FIELD.width / 2, 336);
  const pulse = 0.6 + 0.4 * Math.sin(world.time * 3);
  ctx.globalAlpha = pulse;
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.player;
  ctx.fillText('CLICK OR PRESS ENTER TO BEGIN', FIELD.width / 2, 408);
  ctx.restore();
}

function drawDraft(ctx, world, draft, hover) {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 10, 20, 0.66)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('CHOOSE AN UPGRADE', FIELD.width / 2, 110);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(`Wave ${world.wave} cleared — pick one card to carry into wave ${world.wave + 1}.`, FIELD.width / 2, 146);
  const cardWidth = 240;
  const cardHeight = 208;
  const gap = 28;
  const total = cardWidth * 3 + gap * 2;
  const startX = (FIELD.width - total) / 2;
  const y = 200;
  draft.forEach((upgrade, index) => {
    const x = startX + index * (cardWidth + gap);
    const active = hover === index;
    ctx.fillStyle = active ? '#1b2440' : '#11172c';
    ctx.strokeStyle = active ? PALETTE.lantern : '#2a3352';
    ctx.lineWidth = active ? 3 : 2;
    roundRect(ctx, x, y, cardWidth, cardHeight, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.lantern;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`LEVEL ${((world.player.upgrades[upgrade.id] ?? 0) + 1)}`, x + cardWidth / 2, y + 30);
    // The upgrade's icon, centred at the top of the card (64px slot).
    // drawIcon crops to the glyph's content box, so thin art (a beam, a
    // lantern) fills the slot instead of drowning in black margins. A
    // missing icon draws nothing — the name and description still carry
    // the card, exactly like the sprite fallbacks elsewhere.
    drawIcon(ctx, `icon-${upgrade.id}`, x + cardWidth / 2, y + 74);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 21px system-ui, sans-serif';
    ctx.fillText(upgrade.name, x + cardWidth / 2, y + 126);
    // Long descriptions wrap to a second line instead of spilling past
    // the card's edges.
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.dim;
    if (upgrade.desc.length > 26) {
      const words = upgrade.desc.split(' ');
      let first = '';
      let second = '';
      for (const word of words) {
        if ((first + word).length <= 22) first += (first ? ' ' : '') + word;
        else second += (second ? ' ' : '') + word;
      }
      ctx.fillText(first, x + cardWidth / 2, y + 150);
      ctx.fillText(second, x + cardWidth / 2, y + 170);
    } else {
      ctx.fillText(upgrade.desc, x + cardWidth / 2, y + 160);
    }
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(139, 147, 184, 0.7)';
    ctx.fillText(`Press ${index + 1} or click`, x + cardWidth / 2, y + 192);
  });
  ctx.restore();
}

function drawOver(ctx, world, isNewBest) {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 10, 20, 0.78)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillStyle = '#ff8fa3';
  ctx.shadowColor = '#ff2e63';
  ctx.shadowBlur = 26;
  ctx.fillText('THE LIGHT FADES', FIELD.width / 2, 150);
  ctx.shadowBlur = 0;
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`SCORE  ${world.score}`, FIELD.width / 2, 216);
  if (isNewBest) {
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('★ NEW BEST SCORE ★', FIELD.width / 2, 250);
  }
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  const minutes = Math.floor(world.stats.timePlayed / 60);
  const seconds = Math.floor(world.stats.timePlayed % 60);
  const accuracy = world.stats.shots > 0 ? Math.round((world.stats.hits / world.stats.shots) * 100) : 0;
  ctx.fillText(`Wave ${world.wave}  ·  ${world.kills} Hollow slain  ·  ${minutes}:${String(seconds).padStart(2, '0')} survived  ·  ${accuracy}% accuracy`, FIELD.width / 2, 292);
  ctx.fillText(`Best score  ${world.best}`, FIELD.width / 2, 322);
  const pulse = 0.6 + 0.4 * Math.sin(world.time * 3);
  ctx.globalAlpha = pulse;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.player;
  ctx.fillText('PRESS R OR CLICK TO PLAY AGAIN', FIELD.width / 2, 392);
  ctx.restore();
}

function drawPaused(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 10, 20, 0.66)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 20);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText('Press P or Esc to resume', FIELD.width / 2, FIELD.height / 2 + 24);
  ctx.restore();
}

/**
 * Draws the whole frame: arena and world, then the HUD, then whichever
 * screen sits on top. `ui` carries the draft cards and the hovered card.
 */
export function drawGame(ctx, world, screen, ui = {}) {
  ctx.save();
  if (world.shake > 0) {
    ctx.translate((Math.random() - 0.5) * world.shake, (Math.random() - 0.5) * world.shake);
  }
  drawArena(ctx, world);
  drawPickups(ctx, world);
  drawMines(ctx, world);
  drawAimLines(ctx, world);
  for (const enemy of world.enemies) drawEnemy(ctx, enemy);
  drawGhosts(ctx, world);
  drawPlayer(ctx, world);
  drawBeams(ctx, world);
  drawBullets(ctx, world);
  drawParticles(ctx, world, screen);
  drawRings(ctx, world);
  ctx.restore();

  if (screen === SCREEN_PLAY || screen === SCREEN_DRAFT || screen === SCREEN_PAUSED) {
    drawHud(ctx, world);
  }
  if (screen === SCREEN_PLAY) {
    drawBanner(ctx, world);
    drawKillCallout(ctx, world);
  }
  if (world.flash > 0) {
    const flashRgb = world.flashColor === 'gold' ? '255, 209, 102'
      : world.flashColor === 'cyan' ? '126, 240, 224'
        : world.flashColor === 'amber' ? '255, 159, 28'
          : '255, 77, 109';
    ctx.fillStyle = `rgba(${flashRgb}, ${world.flash * 0.5})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
  // Boss-kill slow motion (v5): a pale vignette closes in while time runs
  // at quarter speed, so the moment feels frozen, not just quiet.
  if (world.slowMo > 0) {
    const vignette = ctx.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.3,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.8,
    );
    vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');
    vignette.addColorStop(1, 'rgba(184, 255, 241, 0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
  // Low health: a red vignette pulses at the edges of the arena.
  if (!world.over && world.player.hp > 0 && world.player.hp <= 2) {
    const pulse = 0.1 + 0.06 * Math.sin(world.time * 4);
    const vignette = ctx.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.35,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.75,
    );
    vignette.addColorStop(0, 'rgba(255, 46, 99, 0)');
    vignette.addColorStop(1, `rgba(255, 46, 99, ${pulse})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
  // The Gloomlord's arrival: a blinking red frame while the warning lasts.
  if (world.bossWarn > 0) {
    const blink = 0.3 + 0.3 * Math.abs(Math.sin(world.time * 10));
    ctx.strokeStyle = `rgba(255, 46, 99, ${blink})`;
    ctx.lineWidth = 5;
    ctx.strokeRect(2.5, 2.5, FIELD.width - 5, FIELD.height - 5);
  }
  if (screen === SCREEN_TITLE) drawTitle(ctx, world);
  if (screen === SCREEN_DRAFT) drawDraft(ctx, world, ui.draft ?? [], ui.hover ?? -1);
  if (screen === SCREEN_OVER) drawOver(ctx, world, ui.isNewBest ?? false);
  if (screen === SCREEN_PAUSED) drawPaused(ctx);
}
