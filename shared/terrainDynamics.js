/**
 * Dynamic terrain effects — shared between client and server.
 *
 * Handles forest regrowth and other time-based terrain changes.
 *
 * This file must remain framework-agnostic — pure JS, no platform imports.
 */

import {
  TREE_REGROW_INTERVAL, TREE_REGROW_INITIAL,
  TREE_GROW_FOREST, TREE_GROW_GRASS, TREE_GROW_RIVER,
  TREE_GROW_SWAMP, TREE_GROW_RUBBLE, TREE_GROW_CRATER,
  TREE_GROW_ROAD, TREE_GROW_BUILDING, TREE_GROW_HALFBUILDING,
} from './constants.js'

import { TERRAIN, getBaseTerrain } from './terrainTypes.js'

/**
 * Track tiles eligible for regrowth.
 * Each entry: { tileX, tileY, timer }
 */

/**
 * Register a tile for potential regrowth (called when forest is harvested/destroyed).
 *
 * @param {object[]} regrowthQueue - Queue of pending regrowth tiles (mutated)
 * @param {number} tileX - Tile X
 * @param {number} tileY - Tile Y
 */
export function registerForRegrowth(regrowthQueue, tileX, tileY) {
  // Don't duplicate
  const exists = regrowthQueue.some(r => r.tileX === tileX && r.tileY === tileY)
  if (!exists) {
    regrowthQueue.push({ tileX, tileY, timer: TREE_REGROW_INITIAL })
  }
}

/**
 * Calculate regrowth score for a tile based on neighbors.
 * Higher score = more likely to regrow.
 */
function calcRegrowthScore(tiles, mapWidth, mapHeight, tileX, tileY) {
  let score = 0

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = tileX + dx
      const ny = tileY + dy
      if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue

      const terrain = getBaseTerrain(tiles[ny * mapWidth + nx])
      switch (terrain) {
        case TERRAIN.FOREST:       score += TREE_GROW_FOREST; break
        case TERRAIN.GRASS:        score += TREE_GROW_GRASS; break
        case TERRAIN.RIVER:        score += TREE_GROW_RIVER; break
        case TERRAIN.SWAMP:        score += TREE_GROW_SWAMP; break
        case TERRAIN.RUBBLE:       score += TREE_GROW_RUBBLE; break
        case TERRAIN.CRATER:       score += TREE_GROW_CRATER; break
        case TERRAIN.ROAD:         score += TREE_GROW_ROAD; break
        case TERRAIN.BUILDING:     score += TREE_GROW_BUILDING; break
        case TERRAIN.HALFBUILDING: score += TREE_GROW_HALFBUILDING; break
      }
    }
  }

  return score
}

/**
 * Step the regrowth system for one game tick.
 *
 * @param {object[]} regrowthQueue - Pending tiles (mutated)
 * @param {Uint8Array} tiles - Map tiles (mutated)
 * @param {number} mapWidth - Map width
 * @param {number} mapHeight - Map height
 * @returns {number} Number of tiles that regrew this tick
 */
export function stepRegrowth(regrowthQueue, tiles, mapWidth, mapHeight) {
  let regrown = 0

  for (let i = regrowthQueue.length - 1; i >= 0; i--) {
    const entry = regrowthQueue[i]
    entry.timer--

    if (entry.timer <= 0) {
      const idx = entry.tileY * mapWidth + entry.tileX
      const terrain = getBaseTerrain(tiles[idx])

      // Only regrow on grass (forests that were harvested/destroyed become grass)
      if (terrain === TERRAIN.GRASS) {
        const score = calcRegrowthScore(tiles, mapWidth, mapHeight, entry.tileX, entry.tileY)
        if (score > 0) {
          tiles[idx] = TERRAIN.FOREST
          regrown++
          regrowthQueue.splice(i, 1)
          continue
        }
      }

      // If terrain changed to something else (road, building, etc.), abandon
      if (terrain !== TERRAIN.GRASS) {
        regrowthQueue.splice(i, 1)
        continue
      }

      // Not enough neighbors — try again after shorter interval
      entry.timer = TREE_REGROW_INTERVAL
    }
  }

  return regrown
}
