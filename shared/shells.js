/**
 * Shell entity management — shared between client and server.
 *
 * Shells are short-lived projectiles fired by tanks and pillboxes.
 * They travel in a straight line at SHELL_SPEED for SHELL_LIFE ticks,
 * then expire. On hitting a wall/forest, they destroy terrain.
 *
 * This file must remain framework-agnostic — pure JS, no platform imports.
 */

import {
  SHELL_SPEED, SHELL_LIFE, TANK_RELOAD_TIME,
  WORLD_UNITS_PER_TILE, BRADIAN_TO_RADIAN, DAMAGE_SHELL,
} from './constants.js'

import { TERRAIN, TERRAIN_PROPS, getBaseTerrain, blocksShells } from './terrainTypes.js'

/**
 * Create a new shell entity.
 *
 * @param {number} x - World X position
 * @param {number} y - World Y position
 * @param {number} rotation - Direction in bradians (0-255)
 * @param {number} owner - Player index (or 0xFF for pillbox)
 * @returns {object} Shell entity
 */
export function createShell(x, y, rotation, owner) {
  const angleRad = rotation * BRADIAN_TO_RADIAN
  return {
    x,
    y,
    dx: Math.sin(angleRad) * SHELL_SPEED,
    dy: -Math.cos(angleRad) * SHELL_SPEED,
    life: SHELL_LIFE,
    owner,
    alive: true,
  }
}

/**
 * Get the terrain destruction result when a shell hits a tile.
 * Returns the new terrain type, or null if no change.
 */
export function getShellTerrainDamage(terrainId) {
  const base = getBaseTerrain(terrainId)
  switch (base) {
    case TERRAIN.BUILDING:     return TERRAIN.HALFBUILDING
    case TERRAIN.HALFBUILDING: return TERRAIN.RUBBLE
    case TERRAIN.FOREST:       return TERRAIN.GRASS
    case TERRAIN.ROAD:         return TERRAIN.CRATER
    case TERRAIN.BOAT:         return TERRAIN.RIVER
    default:                   return null
  }
}

/**
 * Step all shells for one game tick.
 * Mutates shell positions, checks terrain collisions, modifies map tiles.
 *
 * @param {object[]} shells - Array of shell entities (mutated in place)
 * @param {Uint8Array} tiles - Map tile data (mutated on terrain hits)
 * @param {number} mapWidth - Map width in tiles
 * @param {number} mapHeight - Map height in tiles
 * @returns {object[]} Array of impact events { x, y, terrainChanged, oldTerrain, newTerrain }
 */
export function stepShells(shells, tiles, mapWidth, mapHeight) {
  const impacts = []

  for (let i = shells.length - 1; i >= 0; i--) {
    const shell = shells[i]
    if (!shell.alive) {
      shells.splice(i, 1)
      continue
    }

    // Move shell
    shell.x += shell.dx
    shell.y += shell.dy
    shell.life--

    // Check bounds
    const tileX = Math.floor(shell.x / WORLD_UNITS_PER_TILE)
    const tileY = Math.floor(shell.y / WORLD_UNITS_PER_TILE)

    if (tileX < 0 || tileX >= mapWidth || tileY < 0 || tileY >= mapHeight) {
      shell.alive = false
      shells.splice(i, 1)
      continue
    }

    // Check terrain collision
    const terrainId = tiles[tileY * mapWidth + tileX]
    if (blocksShells(terrainId)) {
      shell.alive = false

      // Apply terrain damage
      const newTerrain = getShellTerrainDamage(terrainId)
      if (newTerrain !== null) {
        tiles[tileY * mapWidth + tileX] = newTerrain
        impacts.push({
          x: tileX, y: tileY,
          terrainChanged: true,
          oldTerrain: terrainId,
          newTerrain,
        })
      } else {
        impacts.push({ x: tileX, y: tileY, terrainChanged: false })
      }

      shells.splice(i, 1)
      continue
    }

    // Expire
    if (shell.life <= 0) {
      shell.alive = false
      shells.splice(i, 1)
      continue
    }
  }

  return impacts
}

/**
 * Attempt to fire a shell from a tank.
 * Returns the new shell if successful, null if on cooldown or out of ammo.
 *
 * @param {object} tank - Tank state (mutated: shells decremented, reloadTimer set)
 * @param {object[]} shells - Active shells array (new shell pushed if fired)
 * @returns {object|null} The new shell entity, or null
 */
export function tryFireShell(tank, shells) {
  if (tank.reloadTimer > 0) return null
  if (tank.shells <= 0) return null

  // Spawn shell slightly ahead of the tank to avoid self-collision
  const angleRad = tank.rotation * BRADIAN_TO_RADIAN
  const spawnOffset = WORLD_UNITS_PER_TILE * 0.4
  const spawnX = tank.x + Math.sin(angleRad) * spawnOffset
  const spawnY = tank.y + (-Math.cos(angleRad)) * spawnOffset

  const shell = createShell(spawnX, spawnY, tank.rotation, tank.playerIndex ?? 0)

  shells.push(shell)
  tank.shells--
  tank.reloadTimer = TANK_RELOAD_TIME

  return shell
}
