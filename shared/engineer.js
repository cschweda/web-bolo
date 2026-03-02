/**
 * Engineer (LGM — "Little Green Man") entity management.
 *
 * The engineer exits the tank, walks to a target tile, performs an action,
 * and walks back. While outside, it's vulnerable to explosions.
 *
 * This file must remain framework-agnostic — pure JS, no platform imports.
 */

import {
  WORLD_UNITS_PER_TILE,
  LGM_BUILD_TIME,
  LGM_COST_ROAD, LGM_COST_WALL, LGM_COST_BOAT,
  LGM_COST_PILLBOX_NEW, LGM_COST_MINE,
  LGM_GATHER_WOOD, PILL_MAX_HEALTH,
  TANK_DEATH_WAIT,
} from './constants.js'

import {
  TERRAIN, isMined, getBaseTerrain, getMinedTerrain,
  getLgmSpeed,
} from './terrainTypes.js'

// Engineer states
export const LGM_STATE = {
  IN_TANK: 0,
  WALKING_TO: 1,
  WORKING: 2,
  WALKING_BACK: 3,
  DEAD: 4,
  PARACHUTING: 5,
}

/**
 * Determine what action the engineer should take at a target tile.
 * Returns { action, cost } or null if nothing can be done.
 */
export function getEngineerAction(targetTerrain, tank, pillboxEntities, targetTileX, targetTileY) {
  const base = getBaseTerrain(targetTerrain)

  // Check if there's a destroyed pillbox here to collect
  if (pillboxEntities) {
    const deadPill = pillboxEntities.find(
      pb => !pb.alive && pb.tileX === targetTileX && pb.tileY === targetTileY,
    )
    if (deadPill) {
      return { action: 'collect_pillbox', cost: 0, costType: 'wood' }
    }
  }

  // Check if we can place a carried pillbox
  if (tank.carriedPillboxes > 0 && (base === TERRAIN.GRASS || base === TERRAIN.ROAD)) {
    // Only place if no pillbox already here
    const existingPill = pillboxEntities?.find(
      pb => pb.tileX === targetTileX && pb.tileY === targetTileY,
    )
    if (!existingPill) {
      return { action: 'place_pillbox', cost: LGM_COST_PILLBOX_NEW, costType: 'wood' }
    }
  }

  switch (base) {
    case TERRAIN.FOREST:
      return { action: 'harvest', cost: 0, costType: 'wood' }

    case TERRAIN.GRASS:
      if (tank.wood >= LGM_COST_WALL) {
        return { action: 'build_wall', cost: LGM_COST_WALL, costType: 'wood' }
      }
      if (tank.wood >= LGM_COST_ROAD) {
        return { action: 'build_road', cost: LGM_COST_ROAD, costType: 'wood' }
      }
      return null

    case TERRAIN.SWAMP:
    case TERRAIN.CRATER:
    case TERRAIN.RUBBLE:
      if (tank.wood >= LGM_COST_ROAD) {
        return { action: 'build_road', cost: LGM_COST_ROAD, costType: 'wood' }
      }
      return null

    case TERRAIN.RIVER:
      if (tank.wood >= LGM_COST_BOAT) {
        return { action: 'build_boat', cost: LGM_COST_BOAT, costType: 'wood' }
      }
      return null

    default:
      return null
  }
}

/**
 * Create the engineer state for a tank.
 */
export function createEngineer() {
  return {
    state: LGM_STATE.IN_TANK,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    targetTileX: 0,
    targetTileY: 0,
    action: null,     // Action to perform at target
    workTimer: 0,     // Countdown while working
    respawnTimer: 0,  // Countdown after death
    returnX: 0,       // Tank position to walk back to
    returnY: 0,
  }
}

/**
 * Send the engineer to a target tile.
 *
 * @param {object} engineer - Engineer state (mutated)
 * @param {object} tank - Tank state
 * @param {number} targetTileX - Target tile X
 * @param {number} targetTileY - Target tile Y
 * @param {Uint8Array} tiles - Map tiles
 * @param {number} mapWidth - Map width
 * @param {object[]} pillboxEntities - Pillbox entities (for collection check)
 * @returns {boolean} True if engineer was dispatched
 */
export function sendEngineer(engineer, tank, targetTileX, targetTileY, tiles, mapWidth, pillboxEntities) {
  if (engineer.state !== LGM_STATE.IN_TANK) return false
  if (!tank.hasEngineer || !tank.alive) return false

  const idx = targetTileY * mapWidth + targetTileX
  const terrain = tiles[idx]

  // Determine what action to take
  const actionInfo = getEngineerAction(terrain, tank, pillboxEntities, targetTileX, targetTileY)
  if (!actionInfo) return false

  // Check if we can afford it
  if (actionInfo.costType === 'wood' && tank.wood < actionInfo.cost) return false
  if (actionInfo.costType === 'mine' && tank.mines < actionInfo.cost) return false

  engineer.state = LGM_STATE.WALKING_TO
  engineer.x = tank.x
  engineer.y = tank.y
  engineer.targetX = targetTileX * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2
  engineer.targetY = targetTileY * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2
  engineer.targetTileX = targetTileX
  engineer.targetTileY = targetTileY
  engineer.action = actionInfo
  engineer.returnX = tank.x
  engineer.returnY = tank.y

  return true
}

/**
 * Step the engineer for one game tick.
 *
 * @param {object} engineer - Engineer state (mutated)
 * @param {object} tank - Tank state (mutated: resources changed)
 * @param {Uint8Array} tiles - Map tiles (mutated: terrain changed)
 * @param {number} mapWidth - Map width
 * @param {object[]} pillboxEntities - Pillbox array (mutated: collection/placement)
 * @returns {object|null} Event if action completed
 */
export function stepEngineer(engineer, tank, tiles, mapWidth, pillboxEntities) {
  switch (engineer.state) {
    case LGM_STATE.IN_TANK:
      return null

    case LGM_STATE.WALKING_TO: {
      // Get terrain-dependent speed
      const tileX = Math.floor(engineer.x / WORLD_UNITS_PER_TILE)
      const tileY = Math.floor(engineer.y / WORLD_UNITS_PER_TILE)
      const terrain = tiles[tileY * mapWidth + tileX]
      let speed = getLgmSpeed(terrain)
      if (speed <= 0) speed = 10 // Minimum crawl speed

      // Move toward target
      const dx = engineer.targetX - engineer.x
      const dy = engineer.targetY - engineer.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= speed) {
        // Arrived at target
        engineer.x = engineer.targetX
        engineer.y = engineer.targetY
        engineer.state = LGM_STATE.WORKING
        engineer.workTimer = LGM_BUILD_TIME
      } else {
        engineer.x += (dx / dist) * speed
        engineer.y += (dy / dist) * speed
      }
      return null
    }

    case LGM_STATE.WORKING: {
      engineer.workTimer--
      if (engineer.workTimer <= 0) {
        // Perform the action
        const event = performAction(engineer, tank, tiles, mapWidth, pillboxEntities)

        // Start walking back to the tank's current position
        engineer.returnX = tank.x
        engineer.returnY = tank.y
        engineer.state = LGM_STATE.WALKING_BACK
        return event
      }
      return null
    }

    case LGM_STATE.WALKING_BACK: {
      // Walk back to wherever the tank currently is
      engineer.returnX = tank.x
      engineer.returnY = tank.y

      const tileX = Math.floor(engineer.x / WORLD_UNITS_PER_TILE)
      const tileY = Math.floor(engineer.y / WORLD_UNITS_PER_TILE)
      const terrain = tiles[tileY * mapWidth + tileX]
      let speed = getLgmSpeed(terrain)
      if (speed <= 0) speed = 10

      const dx = engineer.returnX - engineer.x
      const dy = engineer.returnY - engineer.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= speed) {
        // Back in the tank
        engineer.state = LGM_STATE.IN_TANK
        engineer.x = tank.x
        engineer.y = tank.y
      } else {
        engineer.x += (dx / dist) * speed
        engineer.y += (dy / dist) * speed
      }
      return null
    }

    case LGM_STATE.DEAD: {
      engineer.respawnTimer--
      if (engineer.respawnTimer <= 0) {
        engineer.state = LGM_STATE.PARACHUTING
        engineer.respawnTimer = 40 // Parachute animation time (2 sec)
      }
      return null
    }

    case LGM_STATE.PARACHUTING: {
      engineer.respawnTimer--
      if (engineer.respawnTimer <= 0) {
        engineer.state = LGM_STATE.IN_TANK
        tank.hasEngineer = true
        return { type: 'engineer_respawned' }
      }
      return null
    }
  }

  return null
}

/**
 * Perform the engineer's action at the target tile.
 */
function performAction(engineer, tank, tiles, mapWidth, pillboxEntities) {
  const idx = engineer.targetTileY * mapWidth + engineer.targetTileX
  const action = engineer.action

  if (!action) return null

  switch (action.action) {
    case 'harvest': {
      const terrain = getBaseTerrain(tiles[idx])
      if (terrain === TERRAIN.FOREST) {
        tiles[idx] = TERRAIN.GRASS
        tank.wood = Math.min(tank.wood + LGM_GATHER_WOOD, 40)
        return { type: 'harvested', tileX: engineer.targetTileX, tileY: engineer.targetTileY }
      }
      break
    }

    case 'build_road': {
      if (tank.wood >= LGM_COST_ROAD) {
        tiles[idx] = TERRAIN.ROAD
        tank.wood -= LGM_COST_ROAD
        return { type: 'built_road', tileX: engineer.targetTileX, tileY: engineer.targetTileY }
      }
      break
    }

    case 'build_wall': {
      if (tank.wood >= LGM_COST_WALL) {
        tiles[idx] = TERRAIN.BUILDING
        tank.wood -= LGM_COST_WALL
        return { type: 'built_wall', tileX: engineer.targetTileX, tileY: engineer.targetTileY }
      }
      break
    }

    case 'build_boat': {
      if (tank.wood >= LGM_COST_BOAT) {
        tiles[idx] = TERRAIN.BOAT
        tank.wood -= LGM_COST_BOAT
        return { type: 'built_boat', tileX: engineer.targetTileX, tileY: engineer.targetTileY }
      }
      break
    }

    case 'collect_pillbox': {
      const deadPill = pillboxEntities.find(
        pb => !pb.alive && pb.tileX === engineer.targetTileX && pb.tileY === engineer.targetTileY,
      )
      if (deadPill) {
        // Remove from map, add to tank inventory
        const idx2 = pillboxEntities.indexOf(deadPill)
        pillboxEntities.splice(idx2, 1)
        tank.carriedPillboxes++
        return { type: 'collected_pillbox', tileX: engineer.targetTileX, tileY: engineer.targetTileY }
      }
      break
    }

    case 'place_pillbox': {
      if (tank.carriedPillboxes > 0 && tank.wood >= LGM_COST_PILLBOX_NEW) {
        tank.carriedPillboxes--
        tank.wood -= LGM_COST_PILLBOX_NEW
        // Create a new friendly pillbox at the target
        const { createPillbox } = await_import_workaround()
        pillboxEntities.push(
          createPillbox(engineer.targetTileX, engineer.targetTileY, PILL_MAX_HEALTH, tank.playerIndex ?? 0),
        )
        return { type: 'placed_pillbox', tileX: engineer.targetTileX, tileY: engineer.targetTileY }
      }
      break
    }
  }

  return null
}

// Avoid circular import with pillboxes.js — inline the creation
function await_import_workaround() {
  return {
    createPillbox(tileX, tileY, health, owner) {
      return {
        tileX,
        tileY,
        x: tileX * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2,
        y: tileY * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2,
        health,
        maxHealth: PILL_MAX_HEALTH,
        owner,
        alive: health > 0,
        cooldown: 13, // PILLBOX_COOLDOWN_IDLE
        cooldownTimer: 0,
        anger: 0,
        angerDecayTimer: 0,
      }
    },
  }
}

/**
 * Kill the engineer (explosion nearby, shell hit, etc.)
 *
 * @param {object} engineer - Engineer state (mutated)
 * @param {object} tank - Tank state (mutated: hasEngineer = false)
 */
export function killEngineer(engineer, tank) {
  if (engineer.state === LGM_STATE.IN_TANK || engineer.state === LGM_STATE.DEAD) return
  engineer.state = LGM_STATE.DEAD
  engineer.respawnTimer = TANK_DEATH_WAIT // ~5 seconds at 20 Hz (102 ticks)
  tank.hasEngineer = false
}
