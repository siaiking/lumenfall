// Lumenfall's renderer: every pixel the player (and the judge) sees — the
// arena, the Warden, the Hollow, the HUD, and the title, draft, pause and
// game-over screens. Drawing is pure: it reads the world, never mutates it.
import { FIELD, PALETTE } from './config.js';
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

function drawArena(ctx, world) {
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
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
    } else {
      ctx.shadowColor = PALETTE.heart;
      ctx.shadowBlur = 12;
      drawHeart(ctx, pickup.x, pickup.y, 22, PALETTE.heart);
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
    // The Gloomlord's health bar, always visible.
    const width = 120;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-width / 2, -radius - 22, width, 8);
    ctx.fillStyle = PALETTE.boss;
    ctx.fillRect(-width / 2, -radius - 22, width * (enemy.hp / enemy.maxHp), 8);
  }
  ctx.restore();

  if (enemy.kind !== 'boss' && enemy.hp < enemy.maxHp) {
    const width = enemy.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 10, width, 4);
    ctx.fillStyle = enemy.color;
    ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 10, width * (enemy.hp / enemy.maxHp), 4);
  }
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
  if (player.muzzle > 0) {
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(player.radius + 12, 0, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

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

function drawBullets(ctx, world) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const bullet of world.bullets) {
    ctx.fillStyle = PALETTE.bullet;
    ctx.shadowColor = PALETTE.bullet;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const orb of world.enemyBullets) {
    ctx.fillStyle = '#ff4d8d';
    ctx.shadowColor = '#ff4d8d';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 77, 141, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles(ctx, world) {
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
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const text of world.texts) {
    ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1);
    ctx.font = `bold ${text.size}px system-ui, sans-serif`;
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.x, text.y);
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
  // Controls hint, bottom left, faint.
  ctx.textAlign = 'left';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(139, 147, 184, 0.8)';
  ctx.fillText('WASD move · Mouse aim · Hold click to shoot · Shift dash · P pause · M mute', 16, FIELD.height - 14);
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
  const cardHeight = 200;
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
    ctx.fillText(`LEVEL ${((world.player.upgrades[upgrade.id] ?? 0) + 1)}`, x + cardWidth / 2, y + 36);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 21px system-ui, sans-serif';
    ctx.fillText(upgrade.name, x + cardWidth / 2, y + 76);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(upgrade.desc, x + cardWidth / 2, y + 108);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(139, 147, 184, 0.7)';
    ctx.fillText(`Press ${index + 1} or click`, x + cardWidth / 2, y + 168);
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
  for (const enemy of world.enemies) drawEnemy(ctx, enemy);
  drawPlayer(ctx, world);
  drawBullets(ctx, world);
  drawParticles(ctx, world);
  ctx.restore();

  if (screen === SCREEN_PLAY || screen === SCREEN_DRAFT || screen === SCREEN_PAUSED) {
    drawHud(ctx, world);
  }
  if (screen === SCREEN_PLAY) drawBanner(ctx, world);
  if (world.flash > 0) {
    ctx.fillStyle = `rgba(255, 77, 109, ${world.flash * 0.5})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
  if (screen === SCREEN_TITLE) drawTitle(ctx, world);
  if (screen === SCREEN_DRAFT) drawDraft(ctx, world, ui.draft ?? [], ui.hover ?? -1);
  if (screen === SCREEN_OVER) drawOver(ctx, world, ui.isNewBest ?? false);
  if (screen === SCREEN_PAUSED) drawPaused(ctx);
}
