/**
 * Pillbox (automated turret) entity management — shared between client and server.
 *
 * Pillboxes are stationary turrets that fire at enemy tanks within range.
 * They have an "anger" mechanic: getting hit increases their fire rate.
 *
 * This file must remain framework-agnostic — pure JS, no platform imports.
 */

import {
  PILL_MAX_HEALTH, PILLBOX_RANGE, DAMAGE_SHELL,
  PILLBOX_COOLDOWN_IDLE, PILLBOX_COOLDOWN_MAX_FIRE,
  WORLD_UNITS_PER_TILE, NEUTRAL_OWNER,
  BRADIAN_TO_RADIAN, BRADIANS_MAX,
  RADIAN_TO_BRADIAN,
} from './constants.js'

import { createShell } from './shells.js'

/**
 * Create a pillbox entity from map data.
 *
 * @param {number} tileX - Tile X position
 * @param {number} tileY - Tile Y position
 * @param {number} health - Starting health (0-15)
 * @param {number} owner - Owner player index (0xFF = neutral/hostile to all)
 */
export function createPillbox(tileX, tileY, health = PILL_MAX_HEALTH, owner = NEUTRAL_OWNER) {
  return {
    tileX,
    tileY,
    // World position (center of tile)
    x: tileX * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2,
    y: tileY * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2,
    health,
    maxHealth: PILL_MAX_HEALTH,
    owner,
    alive: health > 0,
    // Fire control
    cooldown: PILLBOX_COOLDOWN_IDLE,
    cooldownTimer: 0,
    anger: 0,         // 0 = calm, higher = angrier (faster fire rate)
    angerDecayTimer: 0,
  }
}

/**
 * Calculate the angle from a pillbox to a target in bradians (0-255).
 */
function angleTo(fromX, fromY, toX, toY) {
  const dx = toX - fromX
  const dy = toY - fromY
  // atan2 gives angle from positive X axis; we want 0=North
  let rad = Math.atan2(dx, -dy)
  if (rad < 0) rad += Math.PI * 2
  return Math.round(rad * RADIAN_TO_BRADIAN) % BRADIANS_MAX
}

/**
 * Calculate squared distance between two points (avoids sqrt).
 */
function distSq(x1, y1, x2, y2) {
  const dx = x1 - x2
  const dy = y1 - y2
  return dx * dx + dy * dy
}

/**
 * Step all pillboxes for one game tick.
 * Checks if player tank is in range, fires if able, manages anger.
 *
 * @param {object[]} pillboxes - Array of pillbox entities (mutated)
 * @param {object} tank - Player tank state
 * @param {object[]} shells - Active shells array (new shells pushed)
 * @returns {object[]} Array of events { type, pillboxIndex, ... }
 */
export function stepPillboxes(pillboxes, tank, shells) {
  const events = []
  const rangeSq = PILLBOX_RANGE * PILLBOX_RANGE

  for (let i = 0; i < pillboxes.length; i++) {
    const pb = pillboxes[i]
    if (!pb.alive) continue

    // Decay anger over time
    if (pb.anger > 0) {
      pb.angerDecayTimer++
      if (pb.angerDecayTimer >= 10) { // Decay every 10 ticks (0.5s)
        pb.anger = Math.max(0, pb.anger - 1)
        pb.angerDecayTimer = 0
        // Recalculate cooldown based on anger
        pb.cooldown = Math.max(
          PILLBOX_COOLDOWN_MAX_FIRE,
          PILLBOX_COOLDOWN_IDLE - pb.anger,
        )
      }
    }

    // Count down fire timer
    if (pb.cooldownTimer > 0) {
      pb.cooldownTimer--
      continue
    }

    // Check if tank is alive and in range
    if (!tank.alive) continue
    const dSq = distSq(pb.x, pb.y, tank.x, tank.y)
    if (dSq > rangeSq) continue

    // Don't fire at own owner
    if (pb.owner !== NEUTRAL_OWNER && pb.owner === tank.playerIndex) continue

    // Fire at the tank
    const rotation = angleTo(pb.x, pb.y, tank.x, tank.y)
    const shell = createShell(pb.x, pb.y, rotation, NEUTRAL_OWNER)
    shells.push(shell)

    pb.cooldownTimer = pb.cooldown

    events.push({ type: 'pillbox_fire', pillboxIndex: i })
  }

  return events
}

/**
 * Apply shell damage to pillboxes. Check if any shell hits a pillbox tile.
 *
 * @param {object[]} pillboxes - Pillbox entities (mutated)
 * @param {object[]} shells - Active shells (shells hitting pillboxes are killed)
 * @returns {object[]} Array of hit events { pillboxIndex, destroyed }
 */
export function checkShellPillboxHits(pillboxes, shells) {
  const hits = []

  for (let si = shells.length - 1; si >= 0; si--) {
    const shell = shells[si]
    if (!shell.alive) continue

    const shellTileX = Math.floor(shell.x / WORLD_UNITS_PER_TILE)
    const shellTileY = Math.floor(shell.y / WORLD_UNITS_PER_TILE)

    for (let pi = 0; pi < pillboxes.length; pi++) {
      const pb = pillboxes[pi]
      if (!pb.alive) continue

      if (pb.tileX === shellTileX && pb.tileY === shellTileY) {
        // Hit! Apply damage
        pb.health -= DAMAGE_SHELL
        shell.alive = false

        // Anger the pillbox (faster fire rate)
        pb.anger = Math.min(pb.anger + 3, PILLBOX_COOLDOWN_IDLE - PILLBOX_COOLDOWN_MAX_FIRE)
        pb.cooldown = Math.max(
          PILLBOX_COOLDOWN_MAX_FIRE,
          PILLBOX_COOLDOWN_IDLE - pb.anger,
        )
        pb.angerDecayTimer = 0

        if (pb.health <= 0) {
          pb.health = 0
          pb.alive = false
          hits.push({ pillboxIndex: pi, destroyed: true })
        } else {
          hits.push({ pillboxIndex: pi, destroyed: false })
        }

        // Remove shell
        shells.splice(si, 1)
        break
      }
    }
  }

  return hits
}

/**
 * Check if a shell hits the player tank.
 *
 * @param {object} tank - Player tank (mutated: armor reduced, knockback applied)
 * @param {object[]} shells - Active shells (enemy shells hitting tank are killed)
 * @returns {boolean} True if tank was hit
 */
export function checkShellTankHits(tank, shells) {
  if (!tank.alive) return false

  const tankTileX = Math.floor(tank.x / WORLD_UNITS_PER_TILE)
  const tankTileY = Math.floor(tank.y / WORLD_UNITS_PER_TILE)
  let wasHit = false

  for (let si = shells.length - 1; si >= 0; si--) {
    const shell = shells[si]
    if (!shell.alive) continue

    // Don't hit own shells
    if (shell.owner === tank.playerIndex) continue

    // Check proximity (within half a tile)
    const dx = shell.x - tank.x
    const dy = shell.y - tank.y
    const hitRadius = WORLD_UNITS_PER_TILE * 0.4
    if (dx * dx + dy * dy < hitRadius * hitRadius) {
      // Hit!
      tank.armor -= DAMAGE_SHELL
      shell.alive = false
      shells.splice(si, 1)
      wasHit = true

      // Apply knockback — push tank away from shell origin
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      tank.slideDx = dx / dist
      tank.slideDy = dy / dist
      tank.slideSpeed = 40 // TANK_SLIDE_SPEED
      tank.slideTicks = 3  // TANK_SLIDE_TICKS

      if (tank.armor <= 0) {
        tank.armor = 0
        tank.alive = false
      }
    }
  }

  return wasHit
}
