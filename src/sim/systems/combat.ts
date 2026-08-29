import type { Entity } from '../../core/ecs';
import type { Game } from '../game';
import * as C from '../components';
import { getSkill, type SkillDef } from '../../content/skills';
import { STATUSES, type StatusId } from '../../content/statuses';
import { THREAD_COLOR } from '../../content/threads';
import { getCreature } from '../../content/creatures';
import { getBoss } from '../../content/bosses';
import { computeDamage, effectiveStat, xpForKill } from '../formula';
import { inCone, distToSegment, dist2 } from '../../core/math';
import { spawnProjectile, spawnCreature } from '../factory';
import { isStunned } from './movement';
import { awardPlayerXp, awardCreatureXp } from './progression';

/**
 * Combat resolution.
 *
 * Pipeline: activate -> telegraph -> cast -> resolve shape -> per-target
 * damage/status -> emit events. Damage numbers, screen shake, audio and quest
 * progress are all event subscribers, never inline here.
 */

const scratch: Entity[] = [];

export function runCombat(game: Game, dt: number): void {
  playerSkillRequests(game);
  advanceCasts(game, dt);
  projectileHits(game);
  bossPhases(game);
  regen(game, dt);
  reapDead(game);
}

// ---------- activation ----------

export function canUseSkill(game: Game, e: Entity, skillId: string): boolean {
  const cd = game.ecs.get(e, C.Cooldowns);
  if (cd && (cd.until[skillId] ?? 0) > game.nowMs) return false;
  if (game.ecs.has(e, C.Casting)) return false;
  if (isStunned(game, e)) return false;
  const skill = getSkill(skillId);
  if (skill.staminaCost) {
    const st = game.ecs.get(e, C.Stamina);
    if (st && st.current < skill.staminaCost) return false;
  }
  return true;
}

export function activateSkill(game: Game, e: Entity, skillId: string, aimX: number, aimY: number): boolean {
  if (!canUseSkill(game, e, skillId)) return false;
  const skill = getSkill(skillId);

  // Shock has a chance to eat the activation outright.
  const st = game.ecs.get(e, C.StatusEffects);
  if (st) {
    for (const s of st.active) {
      const chance = STATUSES[s.id].interruptChance;
      if (chance && game.rng.next() < chance * s.stacks) {
        game.bus.emit('Notice', { text: 'Interrupted!', tone: 'bad' });
        return false;
      }
    }
  }

  const stam = game.ecs.get(e, C.Stamina);
  if (stam && skill.staminaCost) stam.current -= skill.staminaCost;

  const cd = game.ecs.get(e, C.Cooldowns);
  if (cd) cd.until[skillId] = game.nowMs + skill.cooldownMs;

  game.ecs.add(e, C.Casting, {
    skillId,
    telegraphLeft: skill.telegraphMs,
    castLeft: skill.castMs,
    aimX,
    aimY,
    interruptible: skill.castMs > 250,
  });

  const facing = game.ecs.get(e, C.Facing);
  const pos = game.ecs.get(e, C.Position);
  if (facing && pos) facing.angle = Math.atan2(aimY - pos.y, aimX - pos.x);

  game.bus.emit('SkillUsed', { source: e, skillId });
  return true;
}

function playerSkillRequests(game: Game): void {
  if (game.intent.useSkills.length === 0) return;
  for (const id of game.intent.useSkills) {
    activateSkill(game, game.player, id, game.intent.aimX, game.intent.aimY);
  }
  game.intent.useSkills.length = 0;
}

// ---------- cast progression ----------

function advanceCasts(game: Game, dt: number): void {
  const ms = dt * 1000;
  for (const e of game.ecs.query(C.Casting)) {
    const cast = game.ecs.need(e, C.Casting);
    if (cast.telegraphLeft > 0) {
      cast.telegraphLeft -= ms;
      continue;
    }
    cast.castLeft -= ms;
    if (cast.castLeft > 0) continue;

    resolveSkill(game, e, getSkill(cast.skillId), cast.aimX, cast.aimY);
    game.ecs.remove(e, C.Casting);
  }
}

// ---------- resolution ----------

export function resolveSkill(game: Game, source: Entity, skill: SkillDef, aimX: number, aimY: number): void {
  const pos = game.ecs.get(source, C.Position);
  if (!pos) return;

  if (skill.shape.type === 'projectile') {
    const dx = aimX - pos.x;
    const dy = aimY - pos.y;
    const len = Math.hypot(dx, dy) || 1;
    spawnProjectile(
      game.ecs, source, skill.id, pos.x, pos.y, dx / len, dy / len,
      skill.shape.speed, skill.shape.range, skill.shape.radius,
      THREAD_COLOR[skill.thread],
    );
    return;
  }

  const targets = findTargets(game, source, skill, pos, aimX, aimY);
  for (const t of targets) applyEffects(game, source, t, skill);
}

function findTargets(
  game: Game,
  source: Entity,
  skill: SkillDef,
  pos: C.Position,
  aimX: number,
  aimY: number,
): Entity[] {
  const { ecs, spatial } = game;
  const sourceFaction = ecs.get(source, C.FactionTag)?.value ?? 'wild';
  const shape = skill.shape;

  let cx = pos.x;
  let cy = pos.y;
  const selfRadius = ecs.get(source, C.Collider)?.radius ?? 0.3;
  let searchRadius = 2;
  if (shape.type === 'melee') searchRadius = shape.range + selfRadius;
  else if (shape.type === 'line') searchRadius = shape.length + selfRadius;
  else if (shape.type === 'self') searchRadius = shape.radius + selfRadius;
  else if (shape.type === 'circle') {
    const dx = aimX - pos.x;
    const dy = aimY - pos.y;
    const len = Math.hypot(dx, dy);
    const clampLen = Math.min(len, shape.range);
    cx = pos.x + (len > 0 ? (dx / len) * clampLen : 0);
    cy = pos.y + (len > 0 ? (dy / len) * clampLen : 0);
    searchRadius = shape.radius;
  }

  spatial.queryCircle(cx, cy, searchRadius + 1.5, scratch);
  const facing = ecs.get(source, C.Facing)?.angle ?? 0;
  const aimAngle = Math.atan2(aimY - pos.y, aimX - pos.x);
  const beneficial = isBeneficial(skill);
  // Ranges are surface-to-surface: a boss with a 1.9 tile body still reaches
  // exactly `range` tiles past its own edge. Matches reachPadding() in ai.ts.
  const sourceRadius = ecs.get(source, C.Collider)?.radius ?? 0.3;

  const hits: Array<[Entity, number]> = [];
  for (const t of scratch) {
    if (!ecs.has(t, C.Health)) continue;
    const tf = ecs.get(t, C.FactionTag)?.value ?? 'wild';
    const friendly = tf === sourceFaction;
    if (beneficial !== friendly) continue;
    if (!beneficial && t === source) continue;

    const tp = ecs.need(t, C.Position);
    const tr = ecs.get(t, C.Collider)?.radius ?? 0.3;
    let hit = false;
    switch (shape.type) {
      case 'melee':
        hit = inCone(pos.x, pos.y, facing, shape.halfAngle, shape.range + tr + sourceRadius, tp.x, tp.y);
        break;
      case 'line': {
        const reach = shape.length + sourceRadius;
        const ex = pos.x + Math.cos(aimAngle) * reach;
        const ey = pos.y + Math.sin(aimAngle) * reach;
        hit = distToSegment(pos.x, pos.y, ex, ey, tp.x, tp.y) <= shape.width / 2 + tr;
        break;
      }
      case 'self':
        hit = dist2(pos.x, pos.y, tp.x, tp.y) <= (shape.radius + tr + sourceRadius) ** 2;
        break;
      case 'circle':
        hit = dist2(cx, cy, tp.x, tp.y) <= (shape.radius + tr) ** 2;
        break;
      default:
        hit = false;
    }
    if (hit) hits.push([t, dist2(cx, cy, tp.x, tp.y)]);
  }

  // Nearest first, capped: keeps AoE readable and bounds worst-case cost.
  hits.sort((a, b) => a[1] - b[1]);
  return hits.slice(0, skill.maxTargets).map(([e]) => e);
}

function isBeneficial(skill: SkillDef): boolean {
  return skill.onHit.every(
    (e) => e.effect === 'heal' || e.effect === 'cleanse' || e.effect === 'buff',
  );
}

export function applyEffects(game: Game, source: Entity, target: Entity, skill: SkillDef): void {
  const { ecs } = game;
  const srcStats = ecs.get(source, C.CombatStats);
  const tgtStats = ecs.get(target, C.CombatStats);
  const tgtHealth = ecs.get(target, C.Health);
  if (!tgtHealth) return;

  for (const eff of skill.onHit) {
    switch (eff.effect) {
      case 'damage': {
        if (!srcStats || !tgtStats) break;
        const attackStat = effectiveStat(srcStats, skill.scaling === 'mag' ? 'mag' : 'atk', game.nowMs);
        const defenceStat = effectiveStat(tgtStats, skill.scaling === 'mag' ? 'res' : 'def', game.nowMs);
        const res = computeDamage({
          power: skill.power * (eff.multiplier ?? 1),
          attackStat,
          defenceStat,
          attackThread: skill.thread,
          defenceThreads: ecs.get(target, C.Threads)?.list ?? ['stone'],
          critChance: srcStats.critChance,
          critRoll: game.rng.next(),
          varianceRoll: game.rng.next(),
          bonusMult: traitDamageMult(game, source, target),
        });
        dealDamage(game, source, target, res.amount, res.crit, res.threadMult);
        break;
      }
      case 'status': {
        if (game.rng.next() > eff.chance) break;
        applyStatus(game, source, target, eff.status, eff.stacks ?? 1);
        break;
      }
      case 'heal': {
        const amount = Math.round(tgtHealth.max * eff.percentOfMaxHp);
        tgtHealth.current = Math.min(tgtHealth.max, tgtHealth.current + amount);
        break;
      }
      case 'cleanse': {
        const st = ecs.get(target, C.StatusEffects);
        if (st) st.active.splice(0, eff.count);
        break;
      }
      case 'buff': {
        if (!tgtStats) break;
        tgtStats.buffs.push({ stat: eff.stat, amount: eff.amount, expiresAt: game.nowMs + eff.durationMs });
        break;
      }
      case 'knockback': {
        const sp = ecs.get(source, C.Position);
        const tp = ecs.get(target, C.Position);
        if (!sp || !tp) break;
        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;
        const len = Math.hypot(dx, dy) || 1;
        const push = eff.force * 0.12; // tiles; negative force pulls inward
        const nx = tp.x + (dx / len) * push;
        const ny = tp.y + (dy / len) * push;
        if (game.shard.isWalkable(nx, ny)) {
          tp.x = nx;
          tp.y = ny;
        }
        break;
      }
      case 'taunt': {
        const ai = ecs.get(target, C.AIState);
        if (ai) {
          ai.target = source;
          ai.forcedTargetUntil = game.nowMs + eff.durationMs;
        }
        break;
      }
      case 'lifesteal': {
        // Applied against the damage dealt in this same skill; see dealDamage.
        break;
      }
    }
  }

  // Lifesteal resolves after damage so it can read the real number.
  const steal = skill.onHit.find((e) => e.effect === 'lifesteal');
  if (steal && steal.effect === 'lifesteal') {
    const hp = ecs.get(source, C.Health);
    const last = lastDamageBySource.get(source) ?? 0;
    if (hp && last > 0) hp.current = Math.min(hp.max, hp.current + Math.round(last * steal.fraction));
  }
}

const lastDamageBySource = new Map<Entity, number>();

export function dealDamage(
  game: Game,
  source: Entity,
  target: Entity,
  amount: number,
  crit: boolean,
  threadMult: number,
): void {
  const hp = game.ecs.get(target, C.Health);
  if (!hp || hp.current <= 0) return;

  let final = amount;

  // Trait: Croakhide's Elastic caps any single hit.
  const inst = game.ecs.get(target, C.CreatureInstance);
  if (inst) {
    const def = getCreature(inst.creatureId);
    if (def.trait.id === 'elastic') final = Math.min(final, Math.round(hp.max * 0.2));
    if (def.trait.id === 'carapace') final = Math.max(1, final - 4);
    if (def.trait.id === 'vitrify' && hp.current / hp.max < 0.4) final = Math.round(final * 0.77);
    if (def.trait.id === 'phase' && game.rng.next() < 0.2) return;
  }

  // Boss stagger from the environmental answer doubles incoming damage.
  const boss = game.ecs.get(target, C.BossTag);
  if (boss && boss.staggerUntil > game.nowMs) final = Math.round(final * 2);

  hp.current -= final;
  lastDamageBySource.set(source, final);

  const ai = game.ecs.get(target, C.AIState);
  if (ai) {
    ai.threat.set(source, (ai.threat.get(source) ?? 0) + final);
    if (ai.forcedTargetUntil < game.nowMs && ai.target === null) ai.target = source;
  }

  // Thorn-style reflect.
  const srcHp = game.ecs.get(source, C.Health);
  if (inst && srcHp) {
    const def = getCreature(inst.creatureId);
    if (def.trait.id === 'barbed') srcHp.current -= Math.round(final * 0.15);
    if (def.trait.id === 'spore_cloud') applyStatus(game, target, source, 'poison', 1);
  }

  game.bus.emit('DamageDealt', { source, target, amount: final, crit, threadMult });
}

export function applyStatus(
  game: Game,
  source: Entity,
  target: Entity,
  id: StatusId,
  stacks: number,
): void {
  const st = game.ecs.get(target, C.StatusEffects);
  if (!st) return;
  const def = STATUSES[id];

  // Player chain-lock protection.
  if (target === game.player) {
    const until = st.immuneUntil[id] ?? 0;
    if (until > game.nowMs) return;
  }

  const existing = st.active.find((s) => s.id === id);
  if (existing) {
    existing.stacks = Math.min(def.maxStacks, existing.stacks + stacks);
    existing.expiresAt = game.nowMs + def.durationMs;
    if (def.escalatesTo && existing.stacks >= def.maxStacks) {
      st.active.splice(st.active.indexOf(existing), 1);
      applyStatus(game, source, target, def.escalatesTo, 1);
      return;
    }
  } else {
    const applied = Math.min(def.maxStacks, stacks);
    // Escalate on first application too, not only when topping up an existing
    // stack — a single 4-stack Chill must still become a Freeze.
    if (def.escalatesTo && applied >= def.maxStacks) {
      applyStatus(game, source, target, def.escalatesTo, 1);
      return;
    }
    st.active.push({
      id, stacks: applied,
      expiresAt: game.nowMs + def.durationMs, tickAcc: 0, source,
    });
  }
  game.bus.emit('StatusApplied', { target, status: id, stacks });
}

function traitDamageMult(game: Game, source: Entity, target: Entity): number {
  const inst = game.ecs.get(source, C.CreatureInstance);
  if (!inst) return 1;
  const def = getCreature(inst.creatureId);
  const tHp = game.ecs.get(target, C.Health);

  switch (def.trait.id) {
    case 'throat_take':
      return tHp && tHp.current / tHp.max < 0.25 ? 1.6 : 1;
    case 'constrict':
      return tHp ? 1 + (1 - tHp.current / tHp.max) * 0.8 : 1;
    case 'pack': {
      // +12% per allied Fangling-line creature nearby.
      let n = 0;
      const sp = game.ecs.get(source, C.Position);
      if (!sp) return 1;
      for (const other of game.ecs.query(C.CreatureInstance, C.Position)) {
        if (other === source) continue;
        const oi = game.ecs.need(other, C.CreatureInstance);
        if (oi.creatureId !== 'fangling' && oi.creatureId !== 'direfang') continue;
        const op = game.ecs.need(other, C.Position);
        if (dist2(sp.x, sp.y, op.x, op.y) < 64) n++;
      }
      return 1 + n * 0.12;
    }
    default:
      return 1;
  }
}

// ---------- projectiles ----------

function projectileHits(game: Game): void {
  const { ecs, spatial } = game;
  for (const e of ecs.query(C.Projectile, C.Position)) {
    const pr = ecs.need(e, C.Projectile);
    const pos = ecs.need(e, C.Position);
    const skill = getSkill(pr.skillId);
    const srcFaction = ecs.get(pr.source, C.FactionTag)?.value ?? 'wild';

    spatial.queryCircle(pos.x, pos.y, pr.radius + 1, scratch);
    for (const t of scratch) {
      if (t === pr.source || !ecs.has(t, C.Health)) continue;
      if ((ecs.get(t, C.FactionTag)?.value ?? 'wild') === srcFaction) continue;
      const tp = ecs.need(t, C.Position);
      const tr = ecs.get(t, C.Collider)?.radius ?? 0.3;
      if (dist2(pos.x, pos.y, tp.x, tp.y) > (pr.radius + tr) ** 2) continue;
      applyEffects(game, pr.source, t, skill);
      ecs.destroy(e);
      break;
    }
  }
}

// ---------- bosses ----------

function bossPhases(game: Game): void {
  for (const e of game.ecs.query(C.BossTag, C.Health)) {
    const tag = game.ecs.need(e, C.BossTag);
    const hp = game.ecs.need(e, C.Health);
    const def = getBoss(tag.bossId);
    const frac = hp.current / hp.max;

    for (let i = def.phases.length - 1; i > tag.phase; i--) {
      if (frac > def.phases[i].hpThreshold) continue;
      tag.phase = i;
      const phase = def.phases[i];
      const stats = game.ecs.get(e, C.CombatStats);
      if (stats) {
        stats.atk *= phase.atkMult;
        stats.mag *= phase.atkMult;
        stats.spd *= phase.spdMult;
      }
      const skills = game.ecs.get(e, C.SkillSet);
      if (skills) skills.ids = [...phase.skills];
      if (phase.summons) {
        const pos = game.ecs.need(e, C.Position);
        for (let n = 0; n < phase.summons.count; n++) {
          const a = (n / phase.summons.count) * Math.PI * 2;
          const sx = pos.x + Math.cos(a) * 3;
          const sy = pos.y + Math.sin(a) * 3;
          if (game.shard.isWalkable(sx, sy)) {
            const add = spawnCreature(game.ecs, game.rng, phase.summons.creatureId, def.intendedLevel, sx, sy);
            game.ecs.get(add, C.FactionTag)!.value = 'hostile';
          }
        }
      }
      game.bus.emit('BossPhaseChanged', { entity: e, phase: i });
      game.bus.emit('Notice', { text: phase.banner, tone: 'bad' });
      break;
    }
  }
}

// ---------- upkeep ----------

function regen(game: Game, dt: number): void {
  for (const e of game.ecs.query(C.Health)) {
    const hp = game.ecs.need(e, C.Health);
    if (hp.regenPerSec > 0 && hp.current > 0) {
      hp.current = Math.min(hp.max, hp.current + hp.regenPerSec * dt);
    }
    // Photosynthesis: regenerates in daylight.
    const inst = game.ecs.get(e, C.CreatureInstance);
    if (inst && hp.current > 0 && getCreature(inst.creatureId).trait.id === 'photosynthesis' && !game.isNight) {
      hp.current = Math.min(hp.max, hp.current + 2 * dt);
    }
  }

  const stam = game.ecs.get(game.player, C.Stamina);
  if (stam) stam.current = Math.min(stam.max, stam.current + 14 * dt);

  // Expire buffs so the array cannot grow without bound.
  for (const e of game.ecs.query(C.CombatStats)) {
    const s = game.ecs.need(e, C.CombatStats);
    if (s.buffs.length === 0) continue;
    s.buffs = s.buffs.filter((b) => b.expiresAt > game.nowMs);
  }
}

function reapDead(game: Game): void {
  for (const e of game.ecs.query(C.Health)) {
    const hp = game.ecs.need(e, C.Health);
    if (hp.current > 0) continue;

    if (e === game.player) {
      game.bus.emit('PlayerDied', { cause: 'combat' });
      hp.current = Math.round(hp.max * 0.5);
      const start = game.shard.findStartPosition();
      const pos = game.ecs.get(e, C.Position);
      if (pos) {
        pos.x = start.x;
        pos.y = start.y;
      }
      continue;
    }

    const killer = highestThreat(game, e);
    const inst = game.ecs.get(e, C.CreatureInstance);
    game.bus.emit('EntityKilled', {
      entity: e, killer,
      creatureId: inst?.creatureId,
      level: inst?.level,
    });

    if (inst && !inst.owned) {
      const xp = xpForKill(inst.level, game.ecs.get(game.player, C.PlayerTag)?.level ?? 1);
      awardPlayerXp(game, xp);
      awardCreatureXp(game, xp);
      const spawn = game.ecs.get(e, C.WorldSpawn);
      if (spawn) game.shard.markKilled(spawn.spawnId, game.nowMs + 180_000);
    }
    game.ecs.destroy(e);
  }
}

function highestThreat(game: Game, e: Entity): Entity | null {
  const ai = game.ecs.get(e, C.AIState);
  if (!ai || ai.threat.size === 0) return null;
  let best: Entity | null = null;
  let bestV = -1;
  for (const [src, v] of ai.threat) {
    if (v > bestV) {
      bestV = v;
      best = src;
    }
  }
  return best;
}
