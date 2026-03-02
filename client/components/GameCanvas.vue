<script setup lang="ts">
import {
  TILE_SIZE_PX, TICK_RATE, TICK_INTERVAL_MS,
  WORLD_UNITS_PER_TILE, BRADIANS_PER_FRAME, BRADIANS_MAX,
  TANK_MAX_ARMOR, TANK_MAX_SHELLS, TANK_MAX_MINES, TANK_MAX_WOOD,
  PILLBOX_COOLDOWN_IDLE, PILLBOX_COOLDOWN_MAX_FIRE,
} from '@webbolo/shared/constants'
import { TERRAIN, TERRAIN_COLORS, getBaseTerrain, getTankSpeed, isWater } from '@webbolo/shared/terrainTypes'
import { generateTestMap } from '@webbolo/shared/mapGenerator'
import {
  createTank, createInput, stepTank, worldToTile,
  getDirectionVector, rotationToFrame,
} from '@webbolo/shared/physics'
import { tryFireShell, stepShells } from '@webbolo/shared/shells'
import {
  createPillbox, stepPillboxes,
  checkShellPillboxHits, checkShellTankHits,
} from '@webbolo/shared/pillboxes'
import { createBase, stepBases } from '@webbolo/shared/bases'
import { dropMine, checkMineDetonation, stepMineEffects } from '@webbolo/shared/mines'
import {
  createEngineer, sendEngineer, stepEngineer, killEngineer,
  LGM_STATE,
} from '@webbolo/shared/engineer'
import { registerForRegrowth, stepRegrowth } from '@webbolo/shared/terrainDynamics'

const canvasRef = ref<HTMLCanvasElement | null>(null)

// Track pressed keys
const keys = reactive(new Set<string>())

// Game state
let mapData: ReturnType<typeof generateTestMap> | null = null
let ctx: CanvasRenderingContext2D | null = null
let animFrameId = 0
let tank: ReturnType<typeof createTank> | null = null
let input: ReturnType<typeof createInput> | null = null

// Shell entities
let shells: any[] = []
let impactFlashes: { x: number, y: number, age: number }[] = []

// Pillbox entities (created from map data)
let pillboxEntities: ReturnType<typeof createPillbox>[] = []

// Base entities (created from map data)
let baseEntities: ReturnType<typeof createBase>[] = []

// Mine system state
let pendingDetonations: { tileX: number, tileY: number, delay: number }[] = []
let pendingFloods: { tileX: number, tileY: number, delay: number }[] = []
let mineDropCooldown = 0

// Engineer
let engineer: ReturnType<typeof createEngineer> | null = null

// Mouse cursor for engineer targeting
let mouseScreenX = 0
let mouseScreenY = 0

// Terrain regrowth queue
let regrowthQueue: { tileX: number, tileY: number, timer: number }[] = []

// Fixed timestep accumulator
let lastFrameTime = 0
let tickAccumulator = 0
const TICK_TIME = 1 / TICK_RATE // 0.05 seconds

// Previous tank state for interpolation
let prevTankX = 0
let prevTankY = 0

// Scale factor for rendering
const SCALE = 2
const tileSize = TILE_SIZE_PX * SCALE

// Debug stats
let frameCount = 0
let lastFpsTime = 0
let fps = 0
let ticksThisSecond = 0
let lastTickCountTime = 0
let tps = 0

function resize() {
  if (!canvasRef.value) return
  canvasRef.value.width = window.innerWidth
  canvasRef.value.height = window.innerHeight
}

/**
 * Read keyboard state into the input object for the current tick.
 */
function readInput() {
  if (!input) return
  input.forward = keys.has('ArrowUp') || keys.has('w')
  input.backward = keys.has('ArrowDown') || keys.has('s')
  input.rotateLeft = keys.has('ArrowLeft') || keys.has('a')
  input.rotateRight = keys.has('ArrowRight') || keys.has('d')
  input.fire = keys.has(' ')
  input.dropMine = keys.has('m')
}

/**
 * Draw a tank sprite (colored triangle showing direction).
 */
function drawTank(
  tankX: number, tankY: number, rotation: number,
  cameraWorldX: number, cameraWorldY: number,
  color: string, outlineColor: string,
) {
  if (!ctx || !canvasRef.value) return

  const canvas = canvasRef.value
  const viewW = canvas.width
  const viewH = canvas.height

  // Convert world coords to screen coords
  const screenX = viewW / 2 + (tankX - cameraWorldX) * (tileSize / WORLD_UNITS_PER_TILE)
  const screenY = viewH / 2 + (tankY - cameraWorldY) * (tileSize / WORLD_UNITS_PER_TILE)

  // Skip if off screen
  if (screenX < -tileSize * 2 || screenX > viewW + tileSize * 2) return
  if (screenY < -tileSize * 2 || screenY > viewH + tileSize * 2) return

  const size = tileSize * 0.6
  const angleRad = rotation * (Math.PI * 2 / BRADIANS_MAX)

  ctx.save()
  ctx.translate(screenX, screenY)
  ctx.rotate(angleRad)

  // Glow outline for visibility
  ctx.shadowColor = outlineColor
  ctx.shadowBlur = 8

  // Tank treads (dark rectangles on each side)
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(-size * 0.75, -size * 0.75, size * 0.25, size * 1.5)
  ctx.fillRect(size * 0.5, -size * 0.75, size * 0.25, size * 1.5)

  // Tank body
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(-size * 0.5, -size * 0.65, size * 1.0, size * 1.3, 3)
  ctx.fill()
  ctx.strokeStyle = outlineColor
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.shadowBlur = 0

  // Turret base (circle)
  ctx.fillStyle = outlineColor
  ctx.beginPath()
  ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2)
  ctx.fill()

  // Turret barrel (line pointing forward)
  ctx.strokeStyle = outlineColor
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -size * 1.1)
  ctx.stroke()
  ctx.lineCap = 'butt'

  ctx.restore()
}

/**
 * Draw a resource bar in the HUD.
 */
function drawResourceBar(
  x: number, y: number, w: number, h: number,
  value: number, max: number,
  label: string, barColor: string,
) {
  if (!ctx) return
  const pct = Math.max(0, Math.min(1, value / max))

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fillRect(x, y, w, h)

  // Bar fill
  ctx.fillStyle = barColor
  ctx.fillRect(x + 1, y + 1, (w - 2) * pct, h - 2)

  // Label
  ctx.fillStyle = '#ffffff'
  ctx.font = '11px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`${label}: ${value}`, x + 4, y + h - 4)
}

function renderFrame(alpha: number) {
  if (!ctx || !canvasRef.value || !mapData || !tank) return

  const canvas = canvasRef.value
  const { tiles, width: mapW, height: mapH, pillboxes, bases } = mapData

  const viewW = canvas.width
  const viewH = canvas.height
  const tilesAcross = Math.ceil(viewW / tileSize) + 2
  const tilesDown = Math.ceil(viewH / tileSize) + 2

  // Interpolate camera position between previous and current tank position
  const camWorldX = prevTankX + (tank.x - prevTankX) * alpha
  const camWorldY = prevTankY + (tank.y - prevTankY) * alpha

  // Camera in tile coordinates (for tile rendering)
  const camTileX = camWorldX / WORLD_UNITS_PER_TILE
  const camTileY = camWorldY / WORLD_UNITS_PER_TILE

  // Top-left tile visible
  const startTileX = Math.floor(camTileX) - Math.floor(tilesAcross / 2)
  const startTileY = Math.floor(camTileY) - Math.floor(tilesDown / 2)

  // Sub-tile offset for smooth scrolling
  const fracX = camTileX - Math.floor(camTileX)
  const fracY = camTileY - Math.floor(camTileY)

  // Clear
  ctx.fillStyle = '#000011'
  ctx.fillRect(0, 0, viewW, viewH)

  // --- Render terrain tiles ---
  for (let row = 0; row < tilesDown; row++) {
    for (let col = 0; col < tilesAcross; col++) {
      const tileX = startTileX + col
      const tileY = startTileY + row

      const screenX = (col - (tilesAcross / 2 - (Math.floor(camTileX) - startTileX)) - fracX) * tileSize + viewW / 2
      const screenY = (row - (tilesDown / 2 - (Math.floor(camTileY) - startTileY)) - fracY) * tileSize + viewH / 2

      if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) {
        ctx.fillStyle = TERRAIN_COLORS[TERRAIN.DEEP_SEA]
        ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1)
        continue
      }

      const terrainId = tiles[tileY * mapW + tileX]
      const baseTerrain = getBaseTerrain(terrainId)
      const color = TERRAIN_COLORS[baseTerrain] || TERRAIN_COLORS[TERRAIN.DEEP_SEA]

      ctx.fillStyle = color
      ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1)

      // Bridge rendering: ROAD adjacent to water gets bridge planks
      if (baseTerrain === TERRAIN.ROAD) {
        const hasWaterNeighbor =
          (tileY > 0 && isWater(getBaseTerrain(tiles[(tileY - 1) * mapW + tileX]))) ||
          (tileY < mapH - 1 && isWater(getBaseTerrain(tiles[(tileY + 1) * mapW + tileX]))) ||
          (tileX > 0 && isWater(getBaseTerrain(tiles[tileY * mapW + tileX - 1]))) ||
          (tileX < mapW - 1 && isWater(getBaseTerrain(tiles[tileY * mapW + tileX + 1])))
        if (hasWaterNeighbor) {
          // Draw bridge planks
          ctx.strokeStyle = '#776644'
          ctx.lineWidth = 1
          for (let p = 0; p < 3; p++) {
            const py = screenY + tileSize * 0.2 + p * tileSize * 0.3
            ctx.beginPath()
            ctx.moveTo(screenX + 2, py)
            ctx.lineTo(screenX + tileSize - 2, py)
            ctx.stroke()
          }
        }
      }
    }
  }

  // --- Render bases ---
  for (const base of baseEntities) {
    const screenX = viewW / 2 + (base.x - camWorldX) * (tileSize / WORLD_UNITS_PER_TILE)
    const screenY = viewH / 2 + (base.y - camWorldY) * (tileSize / WORLD_UNITS_PER_TILE)

    if (screenX < -tileSize * 2 || screenX > viewW + tileSize * 2) continue
    if (screenY < -tileSize * 2 || screenY > viewH + tileSize * 2) continue

    const s = tileSize * 0.4
    const isNeutral = base.owner === 0xFF
    const isFriendly = !isNeutral && base.owner === (tank?.playerIndex ?? 0)

    // Base color: gold=neutral, green=friendly, red=enemy
    ctx.fillStyle = isNeutral ? '#ddaa00' : isFriendly ? '#44cc44' : '#cc4444'
    ctx.fillRect(screenX - s, screenY - s, s * 2, s * 2)
    ctx.strokeStyle = isNeutral ? '#886600' : isFriendly ? '#227722' : '#882222'
    ctx.lineWidth = 1
    ctx.strokeRect(screenX - s, screenY - s, s * 2, s * 2)
    // Cross
    ctx.beginPath()
    ctx.moveTo(screenX - s * 0.6, screenY)
    ctx.lineTo(screenX + s * 0.6, screenY)
    ctx.moveTo(screenX, screenY - s * 0.6)
    ctx.lineTo(screenX, screenY + s * 0.6)
    ctx.stroke()

    // Resource indicator (small dots showing supply level)
    if (isFriendly) {
      const totalPct = (base.armor + base.shells + base.mines) / (90 * 3)
      const dotR = 2
      ctx.fillStyle = totalPct > 0.5 ? '#88ff88' : totalPct > 0.2 ? '#ffff44' : '#ff4444'
      ctx.beginPath()
      ctx.arc(screenX, screenY + s + 5, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // --- Render pillboxes ---
  for (const pb of pillboxEntities) {
    const screenX = viewW / 2 + (pb.x - camWorldX) * (tileSize / WORLD_UNITS_PER_TILE)
    const screenY = viewH / 2 + (pb.y - camWorldY) * (tileSize / WORLD_UNITS_PER_TILE)

    if (screenX < -tileSize * 2 || screenX > viewW + tileSize * 2) continue
    if (screenY < -tileSize * 2 || screenY > viewH + tileSize * 2) continue

    const s = tileSize * 0.35

    if (!pb.alive) {
      // Dead pillbox — dark gray rubble X
      ctx.strokeStyle = '#555555'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(screenX - s * 0.5, screenY - s * 0.5)
      ctx.lineTo(screenX + s * 0.5, screenY + s * 0.5)
      ctx.moveTo(screenX + s * 0.5, screenY - s * 0.5)
      ctx.lineTo(screenX - s * 0.5, screenY + s * 0.5)
      ctx.stroke()
      continue
    }

    // Alive pillbox — diamond shape, color indicates anger
    const angerPct = pb.anger / (PILLBOX_COOLDOWN_IDLE - PILLBOX_COOLDOWN_MAX_FIRE)
    const r = Math.round(204 + 51 * angerPct)
    const g = Math.round(204 - 150 * angerPct)
    const b = Math.round(204 - 150 * angerPct)
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.beginPath()
    ctx.moveTo(screenX, screenY - s)
    ctx.lineTo(screenX + s, screenY)
    ctx.lineTo(screenX, screenY + s)
    ctx.lineTo(screenX - s, screenY)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#666666'
    ctx.lineWidth = 1
    ctx.stroke()

    // Health bar above pillbox
    if (pb.health < pb.maxHealth) {
      const barW = tileSize * 0.8
      const barH = 3
      const barX = screenX - barW / 2
      const barY = screenY - s - 6
      const hpPct = pb.health / pb.maxHealth
      ctx.fillStyle = '#000000'
      ctx.fillRect(barX, barY, barW, barH)
      ctx.fillStyle = hpPct > 0.5 ? '#44cc44' : hpPct > 0.25 ? '#cccc44' : '#cc4444'
      ctx.fillRect(barX, barY, barW * hpPct, barH)
    }
  }

  // --- Render shells ---
  for (const shell of shells) {
    const sx = viewW / 2 + (shell.x - camWorldX) * (tileSize / WORLD_UNITS_PER_TILE)
    const sy = viewH / 2 + (shell.y - camWorldY) * (tileSize / WORLD_UNITS_PER_TILE)

    if (sx < -tileSize || sx > viewW + tileSize) continue
    if (sy < -tileSize || sy > viewH + tileSize) continue

    ctx.fillStyle = '#ffff44'
    ctx.beginPath()
    ctx.arc(sx, sy, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Render impact flashes ---
  for (const flash of impactFlashes) {
    const fx = viewW / 2 + (flash.x - camWorldX) * (tileSize / WORLD_UNITS_PER_TILE)
    const fy = viewH / 2 + (flash.y - camWorldY) * (tileSize / WORLD_UNITS_PER_TILE)

    if (fx < -tileSize * 2 || fx > viewW + tileSize * 2) continue
    if (fy < -tileSize * 2 || fy > viewH + tileSize * 2) continue

    const flashAlpha = 1 - flash.age / 6
    const flashRadius = tileSize * 0.3 + flash.age * 2
    ctx.fillStyle = `rgba(255, 200, 50, ${flashAlpha * 0.8})`
    ctx.beginPath()
    ctx.arc(fx, fy, flashRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = `rgba(255, 255, 200, ${flashAlpha})`
    ctx.beginPath()
    ctx.arc(fx, fy, flashRadius * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Render engineer ---
  if (engineer && engineer.state !== LGM_STATE.IN_TANK) {
    const ex = viewW / 2 + (engineer.x - camWorldX) * (tileSize / WORLD_UNITS_PER_TILE)
    const ey = viewH / 2 + (engineer.y - camWorldY) * (tileSize / WORLD_UNITS_PER_TILE)

    if (ex > -tileSize && ex < viewW + tileSize && ey > -tileSize && ey < viewH + tileSize) {
      if (engineer.state === LGM_STATE.DEAD) {
        // Dead — small red X
        ctx.strokeStyle = '#cc2222'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(ex - 3, ey - 3)
        ctx.lineTo(ex + 3, ey + 3)
        ctx.moveTo(ex + 3, ey - 3)
        ctx.lineTo(ex - 3, ey + 3)
        ctx.stroke()
      } else if (engineer.state === LGM_STATE.PARACHUTING) {
        // Parachute — small green dot descending
        ctx.fillStyle = '#88ff88'
        ctx.beginPath()
        ctx.arc(ex, ey, 3, 0, Math.PI * 2)
        ctx.fill()
        // Parachute canopy
        ctx.strokeStyle = '#88ff88'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(ex, ey - 6, 5, Math.PI, 0)
        ctx.stroke()
      } else {
        // Walking or working — little green man
        const isWorking = engineer.state === LGM_STATE.WORKING
        ctx.fillStyle = isWorking ? '#ffff44' : '#44ff44'
        ctx.fillRect(ex - 2, ey - 3, 4, 6)
        // Hard hat
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(ex - 3, ey - 4, 6, 2)
      }
    }
  }

  // --- Render player tank ---
  drawTank(camWorldX, camWorldY, tank.rotation, camWorldX, camWorldY, '#e8c840', '#886620')

  // --- HUD ---
  const hudX = 12
  const hudY = 12
  const barW = 160
  const barH = 18
  const gap = 3

  drawResourceBar(hudX, hudY, barW, barH, tank.armor, TANK_MAX_ARMOR, 'Armor', '#44cc44')
  drawResourceBar(hudX, hudY + barH + gap, barW, barH, tank.shells, TANK_MAX_SHELLS, 'Shells', '#cc8844')
  drawResourceBar(hudX, hudY + (barH + gap) * 2, barW, barH, tank.mines, TANK_MAX_MINES, 'Mines', '#cc4444')
  drawResourceBar(hudX, hudY + (barH + gap) * 3, barW, barH, tank.wood, TANK_MAX_WOOD, 'Wood', '#88aa44')

  // Debug info
  const { tileX, tileY } = worldToTile(tank.x, tank.y)
  const terrain = mapData.tiles[tileY * mapW + tileX]
  const baseTerrain = getBaseTerrain(terrain)
  const terrainName = Object.entries(TERRAIN).find(([, v]) => v === baseTerrain)?.[0] || '?'
  const maxSpd = getTankSpeed(terrain)

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(hudX, hudY + (barH + gap) * 4 + 4, barW + 80, 80)
  ctx.fillStyle = '#00ff88'
  ctx.font = '11px monospace'
  ctx.textAlign = 'left'
  const dbgX = hudX + 6
  let dbgY = hudY + (barH + gap) * 4 + 18
  ctx.fillText(`Tile: ${tileX},${tileY}  Terrain: ${terrainName}`, dbgX, dbgY)
  dbgY += 14
  ctx.fillText(`Speed: ${tank.speed.toFixed(1)} / ${maxSpd}  Rot: ${tank.rotation}`, dbgX, dbgY)
  dbgY += 14
  ctx.fillText(`FPS: ${fps}  TPS: ${tps}`, dbgX, dbgY)
  dbgY += 14
  ctx.fillText(`Space=shoot  Shells in flight: ${shells.length}`, dbgX, dbgY)
  dbgY += 14
  const engState = engineer ? ['InTank', 'Walking', 'Working', 'Returning', 'Dead', 'Parachute'][engineer.state] : '?'
  ctx.fillText(`Engineer: ${engState}  Carried pills: ${tank.carriedPillboxes}  Click=send LGM`, dbgX, dbgY)

  // --- FPS counter ---
  frameCount++
  if (lastFrameTime - lastFpsTime >= 1000) {
    fps = frameCount
    frameCount = 0
    lastFpsTime = lastFrameTime

    tps = ticksThisSecond
    ticksThisSecond = 0
    lastTickCountTime = lastFrameTime
  }
}

function gameLoop(timestamp: number) {
  const dt = lastFrameTime ? (timestamp - lastFrameTime) / 1000 : 0
  lastFrameTime = timestamp

  // Cap dt to prevent spiral of death after tab-switch
  const clampedDt = Math.min(dt, 0.1)
  tickAccumulator += clampedDt

  // Run fixed-timestep physics
  while (tickAccumulator >= TICK_TIME) {
    // Save previous position for interpolation
    if (tank) {
      prevTankX = tank.x
      prevTankY = tank.y
    }

    // Read input and step physics
    readInput()
    if (tank && input && mapData) {
      stepTank(tank, input, mapData.tiles, mapData.width)

      // Fire shell on spacebar
      if (input.fire) {
        tryFireShell(tank, shells)
      }

      // Check shell-pillbox collisions (before stepping shells to check current positions)
      checkShellPillboxHits(pillboxEntities, shells)

      // Check shell-tank collisions (enemy/pillbox shells hitting player)
      checkShellTankHits(tank, shells)

      // Step all shells (movement, terrain collision, destruction)
      const impacts = stepShells(shells, mapData.tiles, mapData.width, mapData.height)
      for (const imp of impacts) {
        impactFlashes.push({
          x: imp.x * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2,
          y: imp.y * WORLD_UNITS_PER_TILE + WORLD_UNITS_PER_TILE / 2,
          age: 0,
        })
        // Register forest destruction for regrowth
        if (imp.terrainChanged && imp.oldTerrain === 5 /* FOREST */) {
          registerForRegrowth(regrowthQueue, imp.x, imp.y)
        }
      }

      // Step pillboxes (detection, firing at player)
      stepPillboxes(pillboxEntities, tank, shells)

      // Step bases (claiming, refueling, restocking)
      stepBases(baseEntities, tank)

      // Drop mine on M key
      if (input.dropMine && mineDropCooldown <= 0) {
        if (dropMine(tank, mapData.tiles, mapData.width)) {
          mineDropCooldown = 5 // Prevent rapid-fire mine dropping
        }
      }
      if (mineDropCooldown > 0) mineDropCooldown--

      // Check if tank is on a mine
      checkMineDetonation(tank, mapData.tiles, mapData.width, mapData.height, pendingDetonations, pendingFloods)

      // Step chain detonations and flooding
      stepMineEffects(mapData.tiles, mapData.width, mapData.height, pendingDetonations, pendingFloods)

      // Step engineer
      if (engineer) {
        const engEvent = stepEngineer(engineer, tank, mapData.tiles, mapData.width, pillboxEntities)
        // Register harvested forest tiles for regrowth
        if (engEvent?.type === 'harvested') {
          registerForRegrowth(regrowthQueue, engEvent.tileX, engEvent.tileY)
        }
      }

      // Step terrain regrowth
      stepRegrowth(regrowthQueue, mapData.tiles, mapData.width, mapData.height)

      // Age and remove impact flashes (visual only, 6 frames)
      for (let i = impactFlashes.length - 1; i >= 0; i--) {
        impactFlashes[i].age++
        if (impactFlashes[i].age > 6) impactFlashes.splice(i, 1)
      }
    }

    tickAccumulator -= TICK_TIME
    ticksThisSecond++
  }

  // Render with interpolation (alpha = fraction of tick elapsed)
  const alpha = tickAccumulator / TICK_TIME
  renderFrame(alpha)

  animFrameId = requestAnimationFrame(gameLoop)
}

function onKeyDown(e: KeyboardEvent) {
  keys.add(e.key)
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault()
  }
}

function onKeyUp(e: KeyboardEvent) {
  keys.delete(e.key)
}

function onMouseMove(e: MouseEvent) {
  mouseScreenX = e.clientX
  mouseScreenY = e.clientY
}

function onMouseClick(e: MouseEvent) {
  if (!canvasRef.value || !tank || !mapData || !engineer) return

  const canvas = canvasRef.value
  const viewW = canvas.width
  const viewH = canvas.height

  // Convert screen click to world coordinates
  const worldX = tank.x + (e.clientX - viewW / 2) * (WORLD_UNITS_PER_TILE / tileSize)
  const worldY = tank.y + (e.clientY - viewH / 2) * (WORLD_UNITS_PER_TILE / tileSize)

  // Convert to tile coordinates
  const clickTileX = Math.floor(worldX / WORLD_UNITS_PER_TILE)
  const clickTileY = Math.floor(worldY / WORLD_UNITS_PER_TILE)

  // Bounds check
  if (clickTileX < 0 || clickTileX >= mapData.width || clickTileY < 0 || clickTileY >= mapData.height) return

  // Send engineer to the clicked tile
  sendEngineer(engineer, tank, clickTileX, clickTileY, mapData.tiles, mapData.width, pillboxEntities)
}

onMounted(() => {
  if (!canvasRef.value) return

  ctx = canvasRef.value.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false

  // Generate test map and create tank
  mapData = generateTestMap(64, 64)
  input = createInput()

  // Create pillbox entities from map data
  pillboxEntities = mapData.pillboxes.map((pb: any) =>
    createPillbox(pb.x, pb.y, pb.health ?? 15)
  )

  // Create base entities from map data
  baseEntities = mapData.bases.map((b: any) =>
    createBase(b.x, b.y, b.armor ?? 90, b.shells ?? 90, b.mines ?? 90)
  )

  // Create engineer
  engineer = createEngineer()

  // Spawn tank near the center of the map
  // Spawn at map center (on the road intersection)
  const spawnX = Math.floor(mapData.width / 2)
  const spawnY = Math.floor(mapData.height / 2)
  tank = createTank(spawnX, spawnY)

  prevTankX = tank.x
  prevTankY = tank.y

  resize()

  // Start game loop
  lastFrameTime = 0
  tickAccumulator = 0
  animFrameId = requestAnimationFrame(gameLoop)

  window.addEventListener('resize', resize)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvasRef.value.addEventListener('mousemove', onMouseMove)
  canvasRef.value.addEventListener('click', onMouseClick)
})

onUnmounted(() => {
  cancelAnimationFrame(animFrameId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  canvasRef.value?.removeEventListener('mousemove', onMouseMove)
  canvasRef.value?.removeEventListener('click', onMouseClick)
})
</script>

<template>
  <canvas ref="canvasRef" />
</template>
