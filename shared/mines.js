/**
 * Mine system — shared between client and server.
 *
 * Mines are terrain modifications (not separate entities). A mined tile
 * has terrain ID = base terrain + 8 (e.g., MINE_GRASS = GRASS + 8 = 15).
 *
 * This file must remain framework-agnostic — pure JS, no platform imports.
 */

import {
  WORLD_UNITS_PER_TILE, DAMAGE_MINE,
  MINE_CHAIN_DELAY, FLOOD_FILL_DELAY,
  TANK_SLIDE_SPEED, TANK_SLIDE_TICKS,
  BRADIAN_TO_RADIAN,
} from './constants.js'

import { TERRAIN, isMined, getBaseTerrain, getMinedTerrain, isWater } from './terrainTypes.js'

/**
 * Pending detonation (for chain reactions with delay).
 */
function createPendingDetonation(tileX, tileY, delay) {
  return { tileX, tileY, delay }
}

/**
 * Pending flood (crater near water becomes river after delay).
 */
function createPendingFlood(tileX, tileY, delay) {
  return { tileX, tileY, delay }
}

/**
 * Drop a mine from the tank at its current position.
 *
 * @param {object} tank - Tank state (mutated: mines decremented)
 * @param {Uint8Array} tiles - Map tiles (mutated: mine placed)
 * @param {number} mapWidth - Map width in tiles
 * @returns {boolean} True if mine was placed
 */
export function dropMine(tank, tiles, mapWidth) {
  if (tank.mines <= 0) return false

  const tileX = Math.floor(tank.x / WORLD_UNITS_PER_TILE)
  const tileY = Math.floor(tank.y / WORLD_UNITS_PER_TILE)
  const idx = tileY * mapWidth + tileX
  const terrain = tiles[idx]

  // Can't mine already-mined tiles or impassable terrain
  if (isMined(terrain)) return false
  const minedVersion = getMinedTerrain(terrain)
  if (minedVersion === null) return false

  tiles[idx] = minedVersion
  tank.mines--
  return true
}

/**
 * Check if a tank is on a mined tile and trigger detonation.
 *
 * @param {object} tank - Tank state (mutated: damage, knockback)
 * @param {Uint8Array} tiles - Map tiles (mutated: mine → crater)
 * @param {number} mapWidth - Map width
 * @param {object[]} pendingDetonations - Chain queue (mutated: adjacents added)
 * @param {object[]} pendingFloods - Flood queue (mutated)
 * @param {number} mapHeight - Map height
 * @returns {boolean} True if detonation occurred
 */
export function checkMineDetonation(tank, tiles, mapWidth, mapHeight, pendingDetonations, pendingFloods) {
  if (!tank.alive) return false

  const tileX = Math.floor(tank.x / WORLD_UNITS_PER_TILE)
  const tileY = Math.floor(tank.y / WORLD_UNITS_PER_TILE)
  const idx = tileY * mapWidth + tileX
  const terrain = tiles[idx]

  if (!isMined(terrain)) return false

  // Detonate!
  detonateMine(tileX, tileY, tiles, mapWidth, mapHeight, pendingDetonations, pendingFloods)

  // Apply damage to tank
  tank.armor -= DAMAGE_MINE
  if (tank.armor <= 0) {
    tank.armor = 0
    tank.alive = false
  }

  // Knockback (push upward/random since mine is under the tank)
  const angleRad = tank.rotation * BRADIAN_TO_RADIAN
  tank.slideDx = -Math.sin(angleRad)
  tank.slideDy = Math.cos(angleRad)
  tank.slideSpeed = TANK_SLIDE_SPEED
  tank.slideTicks = TANK_SLIDE_TICKS

  return true
}

/**
 * Detonate a mine at a specific tile. Creates crater and queues chain reactions.
 */
function detonateMine(tileX, tileY, tiles, mapWidth, mapHeight, pendingDetonations, pendingFloods) {
  const idx = tileY * mapWidth + tileX
  const terrain = tiles[idx]

  // Replace with crater
  tiles[idx] = TERRAIN.CRATER

  // Check if crater is adjacent to water → queue flood
  checkFloodAdjacent(tileX, tileY, tiles, mapWidth, mapHeight, pendingFloods)

  // Queue chain reactions for 4 cardinal neighbors
  const neighbors = [
    [tileX - 1, tileY],
    [tileX + 1, tileY],
    [tileX, tileY - 1],
    [tileX, tileY + 1],
  ]

  for (const [nx, ny] of neighbors) {
    if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
    const nIdx = ny * mapWidth + nx
    if (isMined(tiles[nIdx])) {
      // Check not already queued
      const alreadyQueued = pendingDetonations.some(
        d => d.tileX === nx && d.tileY === ny,
      )
      if (!alreadyQueued) {
        pendingDetonations.push(createPendingDetonation(nx, ny, MINE_CHAIN_DELAY))
      }
    }
  }
}

/**
 * Check if a tile should flood (crater adjacent to water).
 */
function checkFloodAdjacent(tileX, tileY, tiles, mapWidth, mapHeight, pendingFloods) {
  const neighbors = [
    [tileX - 1, tileY],
    [tileX + 1, tileY],
    [tileX, tileY - 1],
    [tileX, tileY + 1],
  ]

  for (const [nx, ny] of neighbors) {
    if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
    const nTerrain = tiles[ny * mapWidth + nx]
    if (isWater(nTerrain) || nTerrain === TERRAIN.RIVER) {
      // This crater is adjacent to water — queue flood
      const alreadyQueued = pendingFloods.some(
        f => f.tileX === tileX && f.tileY === tileY,
      )
      if (!alreadyQueued) {
        pendingFloods.push(createPendingFlood(tileX, tileY, FLOOD_FILL_DELAY))
      }
      break
    }
  }
}

/**
 * Step pending mine chain detonations and floods.
 * Call once per game tick.
 *
 * @param {Uint8Array} tiles - Map tiles (mutated)
 * @param {number} mapWidth - Map width
 * @param {number} mapHeight - Map height
 * @param {object[]} pendingDetonations - Chain queue (mutated)
 * @param {object[]} pendingFloods - Flood queue (mutated)
 * @returns {{ detonations: number, floods: number }} Count of events this tick
 */
export function stepMineEffects(tiles, mapWidth, mapHeight, pendingDetonations, pendingFloods) {
  let detonations = 0
  let floods = 0

  // Process chain detonations
  for (let i = pendingDetonations.length - 1; i >= 0; i--) {
    pendingDetonations[i].delay--
    if (pendingDetonations[i].delay <= 0) {
      const { tileX, tileY } = pendingDetonations[i]
      pendingDetonations.splice(i, 1)

      // Only detonate if still mined (might have been cleared)
      const idx = tileY * mapWidth + tileX
      if (isMined(tiles[idx])) {
        detonateMine(tileX, tileY, tiles, mapWidth, mapHeight, pendingDetonations, pendingFloods)
        detonations++
      }
    }
  }

  // Process floods
  for (let i = pendingFloods.length - 1; i >= 0; i--) {
    pendingFloods[i].delay--
    if (pendingFloods[i].delay <= 0) {
      const { tileX, tileY } = pendingFloods[i]
      pendingFloods.splice(i, 1)

      const idx = tileY * mapWidth + tileX
      if (tiles[idx] === TERRAIN.CRATER) {
        tiles[idx] = TERRAIN.RIVER
        floods++

        // Check if newly created water causes adjacent craters to flood too
        const neighbors = [
          [tileX - 1, tileY],
          [tileX + 1, tileY],
          [tileX, tileY - 1],
          [tileX, tileY + 1],
        ]
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
          if (tiles[ny * mapWidth + nx] === TERRAIN.CRATER) {
            const alreadyQueued = pendingFloods.some(
              f => f.tileX === nx && f.tileY === ny,
            )
            if (!alreadyQueued) {
              pendingFloods.push(createPendingFlood(nx, ny, FLOOD_FILL_DELAY))
            }
          }
        }
      }
    }
  }

  return { detonations, floods }
}
