/**
 * Procedural test map generator for Phase 1A development.
 * Generates a playable island map with varied terrain, pillboxes, and bases.
 */

import { TERRAIN } from './terrainTypes.js'

/**
 * Generate a test map with an island surrounded by deep sea.
 * @param {number} width - Map width in tiles
 * @param {number} height - Map height in tiles
 * @returns {{ tiles: Uint8Array, width: number, height: number, pillboxes: Array, bases: Array }}
 */
export function generateTestMap(width = 64, height = 64) {
  const tiles = new Uint8Array(width * height)

  // Fill with deep sea
  tiles.fill(TERRAIN.DEEP_SEA)

  // Create an island using a simple distance-from-center + noise approach
  const cx = width / 2
  const cy = height / 2
  const maxRadius = Math.min(width, height) * 0.4

  // Simple seeded pseudo-random for reproducible maps
  let seed = 42
  function rand() {
    seed = (seed * 16807 + 0) % 2147483647
    return (seed - 1) / 2147483646
  }

  // Pass 1: Create land mass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const noise = (rand() - 0.5) * 8
      const threshold = maxRadius + noise

      if (dist < threshold * 0.3) {
        tiles[y * width + x] = TERRAIN.GRASS
      } else if (dist < threshold * 0.5) {
        // Inner ring — mostly grass with some forest
        tiles[y * width + x] = rand() < 0.3 ? TERRAIN.FOREST : TERRAIN.GRASS
      } else if (dist < threshold * 0.7) {
        // Middle ring — mixed terrain
        const r = rand()
        if (r < 0.2) tiles[y * width + x] = TERRAIN.FOREST
        else if (r < 0.25) tiles[y * width + x] = TERRAIN.SWAMP
        else tiles[y * width + x] = TERRAIN.GRASS
      } else if (dist < threshold * 0.85) {
        // Outer ring — more varied
        const r = rand()
        if (r < 0.15) tiles[y * width + x] = TERRAIN.FOREST
        else if (r < 0.2) tiles[y * width + x] = TERRAIN.SWAMP
        else if (r < 0.22) tiles[y * width + x] = TERRAIN.RIVER
        else tiles[y * width + x] = TERRAIN.GRASS
      } else if (dist < threshold) {
        // Shore — water border
        const r = rand()
        if (r < 0.4) tiles[y * width + x] = TERRAIN.RIVER
        else if (r < 0.5) tiles[y * width + x] = TERRAIN.SWAMP
        else tiles[y * width + x] = TERRAIN.GRASS
      }
    }
  }

  // Pass 2: Add roads (cross-shaped through the center)
  const roadY = Math.floor(cy)
  const roadX = Math.floor(cx)
  for (let x = 0; x < width; x++) {
    const idx = roadY * width + x
    if (tiles[idx] === TERRAIN.GRASS || tiles[idx] === TERRAIN.FOREST || tiles[idx] === TERRAIN.SWAMP) {
      tiles[idx] = TERRAIN.ROAD
    }
  }
  for (let y = 0; y < height; y++) {
    const idx = y * width + roadX
    if (tiles[idx] === TERRAIN.GRASS || tiles[idx] === TERRAIN.FOREST || tiles[idx] === TERRAIN.SWAMP) {
      tiles[idx] = TERRAIN.ROAD
    }
  }

  // Pass 3: Add some buildings (small clusters)
  const buildingClusters = [
    { x: cx - 8, y: cy - 8 },
    { x: cx + 6, y: cy - 6 },
    { x: cx - 5, y: cy + 7 },
    { x: cx + 8, y: cy + 5 },
  ]
  for (const cluster of buildingClusters) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const bx = Math.floor(cluster.x + dx)
        const by = Math.floor(cluster.y + dy)
        if (bx >= 0 && bx < width && by >= 0 && by < height) {
          const idx = by * width + bx
          if (tiles[idx] === TERRAIN.GRASS || tiles[idx] === TERRAIN.FOREST) {
            // Hollow rectangle — walls on edges, grass inside
            if (dx === 0 || dx === 2 || dy === 0 || dy === 2) {
              tiles[idx] = TERRAIN.BUILDING
            }
          }
        }
      }
    }
  }

  // Place pillboxes (neutral)
  const pillboxes = [
    { x: Math.floor(cx - 10), y: Math.floor(cy - 5), health: 15 },
    { x: Math.floor(cx + 10), y: Math.floor(cy - 5), health: 15 },
    { x: Math.floor(cx - 10), y: Math.floor(cy + 5), health: 15 },
    { x: Math.floor(cx + 10), y: Math.floor(cy + 5), health: 15 },
    { x: Math.floor(cx), y: Math.floor(cy - 12), health: 15 },
    { x: Math.floor(cx), y: Math.floor(cy + 12), health: 15 },
  ]

  // Place bases (neutral)
  const bases = [
    { x: Math.floor(cx - 8), y: Math.floor(cy), armor: 90, shells: 90, mines: 90 },
    { x: Math.floor(cx + 8), y: Math.floor(cy), armor: 90, shells: 90, mines: 90 },
    { x: Math.floor(cx), y: Math.floor(cy - 8), armor: 90, shells: 90, mines: 90 },
    { x: Math.floor(cx), y: Math.floor(cy + 8), armor: 90, shells: 90, mines: 90 },
  ]

  // Ensure pillbox and base tiles are grass (clear any terrain under them)
  for (const pb of pillboxes) {
    if (pb.x >= 0 && pb.x < width && pb.y >= 0 && pb.y < height) {
      tiles[pb.y * width + pb.x] = TERRAIN.GRASS
    }
  }
  for (const base of bases) {
    if (base.x >= 0 && base.x < width && base.y >= 0 && base.y < height) {
      tiles[base.y * width + base.x] = TERRAIN.GRASS
    }
  }

  return { tiles, width, height, pillboxes, bases }
}
