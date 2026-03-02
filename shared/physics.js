/**
 * Tank physics — shared between client (prediction) and server (authoritative).
 *
 * All functions operate on world coordinates (256 units per tile) and
 * tick-rate values (20 Hz). Call stepTank() once per game tick.
 *
 * This file must remain framework-agnostic — pure JS, no platform-specific imports.
 */

import {
  TANK_FRAMES,
  TANK_ACCELERATE_RATE,
  TANK_DECELERATE_RATE,
  TANK_BRAKE_RATE,
  TANK_AUTOSLOW_SPEED,
  TANK_WALL_SLOW_DOWN,
  WORLD_UNITS_PER_TILE,
  MAP_WIDTH,
  MAP_HEIGHT,
  BRADIANS_MAX,
  BRADIANS_PER_FRAME,
  BRADIAN_TO_RADIAN,
  TANK_MAX_ARMOR,
  TANK_MAX_SHELLS,
  TANK_MAX_MINES,
  TANK_MAX_WOOD,
} from './constants.js'

import { TERRAIN, TERRAIN_PROPS, getTankSpeed, getBaseTerrain } from './terrainTypes.js'

/**
 * Create a new tank state object.
 */
export function createTank(tileX, tileY) {
  return {
    // Position in world coordinates (256 units per tile)
    x: tileX * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2,
    y: tileY * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2,

    // Rotation in bradians (0-255, steps of 16)
    // 0 = North, 64 = East, 128 = South, 192 = West
    rotation: 0,

    // Current speed (world units per tick, 0 to terrain max)
    speed: 0,

    // Resources
    armor: TANK_MAX_ARMOR,
    shells: TANK_MAX_SHELLS,
    mines: TANK_MAX_MINES,
    wood: TANK_MAX_WOOD,

    // State flags
    onBoat: false,
    hasEngineer: true,
    carriedPillboxes: 0,
    alive: true,

    // Shooting
    reloadTimer: 0,
    playerIndex: 0,

    // Knockback state
    slideSpeed: 0,
    slideDx: 0,
    slideDy: 0,
    slideTicks: 0,
  }
}

/**
 * Input state for a single tick.
 */
export function createInput() {
  return {
    forward: false,
    backward: false,
    rotateLeft: false,
    rotateRight: false,
    fire: false,
    dropMine: false,
  }
}

/**
 * Get the tile coordinates for a world position.
 */
export function worldToTile(worldX, worldY) {
  return {
    tileX: Math.floor(worldX / WORLD_UNITS_PER_TILE),
    tileY: Math.floor(worldY / WORLD_UNITS_PER_TILE),
  }
}

/**
 * Get the terrain type at a world position from the tile array.
 */
function getTerrainAt(tiles, mapWidth, worldX, worldY) {
  const tx = Math.floor(worldX / WORLD_UNITS_PER_TILE)
  const ty = Math.floor(worldY / WORLD_UNITS_PER_TILE)
  if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= MAP_HEIGHT) {
    return TERRAIN.DEEP_SEA
  }
  return tiles[ty * mapWidth + tx]
}

/**
 * Check if a world position is passable for a tank.
 * Checks the center point and 4 edge points for a small collision box.
 */
function isPositionPassable(tiles, mapWidth, worldX, worldY) {
  // Tank collision radius in world units (~40% of a tile)
  const radius = 50

  // Check center and 4 cardinal points
  const points = [
    [worldX, worldY],
    [worldX - radius, worldY],
    [worldX + radius, worldY],
    [worldX, worldY - radius],
    [worldX, worldY + radius],
  ]

  for (const [px, py] of points) {
    const terrain = getTerrainAt(tiles, mapWidth, px, py)
    const props = TERRAIN_PROPS[terrain] || TERRAIN_PROPS[getBaseTerrain(terrain)]
    if (!props || !props.passable) {
      return false
    }
  }
  return true
}

/**
 * Get the movement direction vector for a bradian rotation value.
 * Returns [dx, dy] normalized. 0 = North (0, -1), 64 = East (1, 0), etc.
 */
export function getDirectionVector(rotation) {
  const angleRad = rotation * BRADIAN_TO_RADIAN
  return [Math.sin(angleRad), -Math.cos(angleRad)]
}

/**
 * Convert bradian rotation to sprite frame index (0-15).
 */
export function rotationToFrame(rotation) {
  return Math.floor(((rotation % BRADIANS_MAX) + BRADIANS_MAX) % BRADIANS_MAX / BRADIANS_PER_FRAME)
}

/**
 * Step the tank physics for one game tick (50ms at 20 Hz).
 *
 * @param {object} tank - Tank state (mutated in place)
 * @param {object} input - Input state for this tick
 * @param {Uint8Array} tiles - Map tile data
 * @param {number} mapWidth - Map width in tiles
 */
export function stepTank(tank, input, tiles, mapWidth) {
  if (!tank.alive) return

  // --- Reload timer ---
  if (tank.reloadTimer > 0) {
    tank.reloadTimer--
  }

  // --- Rotation ---
  if (input.rotateLeft) {
    tank.rotation = ((tank.rotation - BRADIANS_PER_FRAME) + BRADIANS_MAX) % BRADIANS_MAX
  }
  if (input.rotateRight) {
    tank.rotation = (tank.rotation + BRADIANS_PER_FRAME) % BRADIANS_MAX
  }

  // --- Get terrain at current position ---
  const terrain = getTerrainAt(tiles, mapWidth, tank.x, tank.y)
  const maxSpeed = getTankSpeed(terrain)

  // --- Acceleration / Deceleration ---
  if (input.forward && maxSpeed > 0) {
    // Accelerate toward max speed for current terrain
    tank.speed = Math.min(tank.speed + TANK_ACCELERATE_RATE, maxSpeed)
  } else if (input.backward) {
    // Brake actively
    tank.speed = Math.max(tank.speed - TANK_BRAKE_RATE, 0)
  } else {
    // Auto-decelerate when no input
    tank.speed = Math.max(tank.speed - TANK_AUTOSLOW_SPEED, 0)
  }

  // Clamp speed to terrain max (handles transitions from fast to slow terrain)
  if (tank.speed > maxSpeed && maxSpeed > 0) {
    tank.speed = Math.max(tank.speed - TANK_DECELERATE_RATE, maxSpeed)
  }

  // --- Movement ---
  if (tank.speed > 0) {
    const [dx, dy] = getDirectionVector(tank.rotation)
    const newX = tank.x + dx * tank.speed
    const newY = tank.y + dy * tank.speed

    if (isPositionPassable(tiles, mapWidth, newX, newY)) {
      tank.x = newX
      tank.y = newY
    } else {
      // Try sliding along walls (axis-separated collision)
      const slideX = isPositionPassable(tiles, mapWidth, newX, tank.y)
      const slideY = isPositionPassable(tiles, mapWidth, tank.x, newY)

      if (slideX) {
        tank.x = newX
      } else if (slideY) {
        tank.y = newY
      }

      // Slow down on collision
      tank.speed = Math.max(tank.speed - TANK_WALL_SLOW_DOWN, 0)
    }
  }

  // --- Knockback slide ---
  if (tank.slideTicks > 0) {
    const slideNewX = tank.x + tank.slideDx * tank.slideSpeed
    const slideNewY = tank.y + tank.slideDy * tank.slideSpeed

    if (isPositionPassable(tiles, mapWidth, slideNewX, slideNewY)) {
      tank.x = slideNewX
      tank.y = slideNewY
    }
    tank.slideTicks--
  }

  // --- Clamp to map bounds ---
  const margin = WORLD_UNITS_PER_TILE / 2
  tank.x = Math.max(margin, Math.min(mapWidth * WORLD_UNITS_PER_TILE - margin, tank.x))
  tank.y = Math.max(margin, Math.min(MAP_HEIGHT * WORLD_UNITS_PER_TILE - margin, tank.y))
}
