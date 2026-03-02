/**
 * Base entity management — shared between client and server.
 *
 * Bases are fixed positions that supply tanks with armor, shells, and mines.
 * Controlling bases is the strategic objective of the game.
 *
 * This file must remain framework-agnostic — pure JS, no platform imports.
 */

import {
  WORLD_UNITS_PER_TILE, NEUTRAL_OWNER,
  BASE_MAX_ARMOR, BASE_MAX_SHELLS, BASE_MAX_MINES,
  BASE_RESTOCK_INTERVAL,
  BASE_SHELLS_GIVE, BASE_ARMOR_GIVE, BASE_MINES_GIVE,
  TANK_MAX_ARMOR, TANK_MAX_SHELLS, TANK_MAX_MINES,
} from './constants.js'

/**
 * Create a base entity from map data.
 */
export function createBase(tileX, tileY, armor = BASE_MAX_ARMOR, shells = BASE_MAX_SHELLS, mines = BASE_MAX_MINES, owner = NEUTRAL_OWNER) {
  return {
    tileX,
    tileY,
    x: tileX * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2,
    y: tileY * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2,
    owner,
    // Resource pools
    armor,
    shells,
    mines,
    // Restock timer
    restockTimer: BASE_RESTOCK_INTERVAL,
    // Whether tank is currently on this base
    tankPresent: false,
  }
}

/**
 * Step all bases for one game tick.
 * Handles: claiming neutral bases, refueling, resource restocking.
 *
 * @param {object[]} bases - Base entities (mutated)
 * @param {object} tank - Player tank (mutated: resources replenished)
 * @returns {object[]} Events
 */
export function stepBases(bases, tank) {
  const events = []
  const tankTileX = Math.floor(tank.x / WORLD_UNITS_PER_TILE)
  const tankTileY = Math.floor(tank.y / WORLD_UNITS_PER_TILE)

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i]

    // Check if tank is on this base
    const onBase = tank.alive && base.tileX === tankTileX && base.tileY === tankTileY
    base.tankPresent = onBase

    if (onBase) {
      // Claim neutral bases by driving over
      if (base.owner === NEUTRAL_OWNER) {
        base.owner = tank.playerIndex ?? 0
        events.push({ type: 'base_captured', baseIndex: i })
      }

      // Refuel from friendly bases when stopped or slow
      if (base.owner === (tank.playerIndex ?? 0) && tank.speed < 5) {
        // Transfer armor
        if (tank.armor < TANK_MAX_ARMOR && base.armor > 0) {
          const give = Math.min(BASE_ARMOR_GIVE, TANK_MAX_ARMOR - tank.armor, base.armor)
          tank.armor += give
          base.armor -= give
        }
        // Transfer shells
        if (tank.shells < TANK_MAX_SHELLS && base.shells > 0) {
          const give = Math.min(BASE_SHELLS_GIVE, TANK_MAX_SHELLS - tank.shells, base.shells)
          tank.shells += give
          base.shells -= give
        }
        // Transfer mines
        if (tank.mines < TANK_MAX_MINES && base.mines > 0) {
          const give = Math.min(BASE_MINES_GIVE, TANK_MAX_MINES - tank.mines, base.mines)
          tank.mines += give
          base.mines -= give
        }
      }
    }

    // Restock timer (bases slowly regenerate resources)
    base.restockTimer--
    if (base.restockTimer <= 0) {
      base.restockTimer = BASE_RESTOCK_INTERVAL
      if (base.armor < BASE_MAX_ARMOR) base.armor = Math.min(base.armor + 5, BASE_MAX_ARMOR)
      if (base.shells < BASE_MAX_SHELLS) base.shells = Math.min(base.shells + 1, BASE_MAX_SHELLS)
      if (base.mines < BASE_MAX_MINES) base.mines = Math.min(base.mines + 1, BASE_MAX_MINES)
    }
  }

  return events
}
