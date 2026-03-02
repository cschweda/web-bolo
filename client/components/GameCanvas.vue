<script setup lang="ts">
import { TILE_SIZE_PX } from '@webbolo/shared/constants'
import { TERRAIN, TERRAIN_COLORS, getBaseTerrain } from '@webbolo/shared/terrainTypes'
import { generateTestMap } from '@webbolo/shared/mapGenerator'

const canvasRef = ref<HTMLCanvasElement | null>(null)

// Camera position (world coordinates — tile + sub-tile)
const camera = reactive({
  x: 0,
  y: 0,
})

// Track pressed keys for smooth camera movement
const keys = reactive(new Set<string>())

// Game state
let mapData: ReturnType<typeof generateTestMap> | null = null
let ctx: CanvasRenderingContext2D | null = null
let animFrameId = 0

const CAMERA_SPEED = 4 // Tiles per second for keyboard scrolling

function resize() {
  if (!canvasRef.value) return
  canvasRef.value.width = window.innerWidth
  canvasRef.value.height = window.innerHeight
}

function renderFrame() {
  if (!ctx || !canvasRef.value || !mapData) return

  const canvas = canvasRef.value
  const { tiles, width: mapW, height: mapH, pillboxes, bases } = mapData
  const tileSize = TILE_SIZE_PX * 2 // 2x scale for visibility

  // Calculate viewport bounds (which tiles are visible)
  const viewW = canvas.width
  const viewH = canvas.height
  const tilesAcross = Math.ceil(viewW / tileSize) + 1
  const tilesDown = Math.ceil(viewH / tileSize) + 1

  // Camera offset within a tile (for smooth scrolling)
  const camTileX = Math.floor(camera.x)
  const camTileY = Math.floor(camera.y)
  const offsetX = -(camera.x - camTileX) * tileSize
  const offsetY = -(camera.y - camTileY) * tileSize

  // Calculate the top-left tile that's visible
  const startTileX = camTileX - Math.floor(tilesAcross / 2)
  const startTileY = camTileY - Math.floor(tilesDown / 2)

  // Clear canvas
  ctx.fillStyle = '#000011'
  ctx.fillRect(0, 0, viewW, viewH)

  // Render visible tiles
  for (let row = 0; row < tilesDown; row++) {
    for (let col = 0; col < tilesAcross; col++) {
      const tileX = startTileX + col
      const tileY = startTileY + row

      // Screen position
      const screenX = col * tileSize + offsetX
      const screenY = row * tileSize + offsetY

      // Skip tiles outside map bounds
      if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) {
        ctx.fillStyle = TERRAIN_COLORS[TERRAIN.DEEP_SEA]
        ctx.fillRect(screenX, screenY, tileSize, tileSize)
        continue
      }

      const terrainId = tiles[tileY * mapW + tileX]
      const baseTerrain = getBaseTerrain(terrainId)
      const color = TERRAIN_COLORS[baseTerrain] || TERRAIN_COLORS[TERRAIN.DEEP_SEA]

      ctx.fillStyle = color
      ctx.fillRect(screenX, screenY, tileSize, tileSize)

      // Draw subtle grid lines
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'
      ctx.strokeRect(screenX, screenY, tileSize, tileSize)
    }
  }

  // Render pillboxes as small diamonds
  for (const pb of pillboxes) {
    const screenX = (pb.x - startTileX) * tileSize + offsetX + tileSize / 2
    const screenY = (pb.y - startTileY) * tileSize + offsetY + tileSize / 2

    if (screenX < -tileSize || screenX > viewW + tileSize) continue
    if (screenY < -tileSize || screenY > viewH + tileSize) continue

    const size = tileSize * 0.4
    ctx.fillStyle = '#cccccc'
    ctx.beginPath()
    ctx.moveTo(screenX, screenY - size)
    ctx.lineTo(screenX + size, screenY)
    ctx.lineTo(screenX, screenY + size)
    ctx.lineTo(screenX - size, screenY)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#666666'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Render bases as squares with a cross
  for (const base of bases) {
    const screenX = (base.x - startTileX) * tileSize + offsetX
    const screenY = (base.y - startTileY) * tileSize + offsetY

    if (screenX < -tileSize || screenX > viewW + tileSize) continue
    if (screenY < -tileSize || screenY > viewH + tileSize) continue

    const pad = tileSize * 0.15
    ctx.fillStyle = '#ddaa00'
    ctx.fillRect(screenX + pad, screenY + pad, tileSize - pad * 2, tileSize - pad * 2)
    ctx.strokeStyle = '#886600'
    ctx.lineWidth = 1
    ctx.strokeRect(screenX + pad, screenY + pad, tileSize - pad * 2, tileSize - pad * 2)

    // Cross
    const cx = screenX + tileSize / 2
    const cy = screenY + tileSize / 2
    const arm = tileSize * 0.2
    ctx.strokeStyle = '#886600'
    ctx.beginPath()
    ctx.moveTo(cx - arm, cy)
    ctx.lineTo(cx + arm, cy)
    ctx.moveTo(cx, cy - arm)
    ctx.lineTo(cx, cy + arm)
    ctx.stroke()
  }

  // Draw crosshair at camera center
  const centerX = viewW / 2
  const centerY = viewH / 2
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(centerX - 10, centerY)
  ctx.lineTo(centerX + 10, centerY)
  ctx.moveTo(centerX, centerY - 10)
  ctx.lineTo(centerX, centerY + 10)
  ctx.stroke()

  // Debug HUD (top-left)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(8, 8, 220, 70)
  ctx.fillStyle = '#00ff88'
  ctx.font = '12px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`Camera: ${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}`, 16, 26)
  ctx.fillText(`Tile: ${camTileX}, ${camTileY}`, 16, 42)
  ctx.fillText(`Map: ${mapW}x${mapH} | Pillboxes: ${pillboxes.length} | Bases: ${bases.length}`, 16, 58)
  ctx.fillText(`Arrow keys / WASD to scroll`, 16, 74)
}

let lastTime = 0

function gameLoop(timestamp: number) {
  const dt = lastTime ? (timestamp - lastTime) / 1000 : 0
  lastTime = timestamp

  // Move camera based on pressed keys
  const speed = CAMERA_SPEED * dt
  if (keys.has('ArrowUp') || keys.has('w')) camera.y -= speed
  if (keys.has('ArrowDown') || keys.has('s')) camera.y += speed
  if (keys.has('ArrowLeft') || keys.has('a')) camera.x -= speed
  if (keys.has('ArrowRight') || keys.has('d')) camera.x += speed

  // Clamp camera to map bounds
  if (mapData) {
    camera.x = Math.max(0, Math.min(mapData.width - 1, camera.x))
    camera.y = Math.max(0, Math.min(mapData.height - 1, camera.y))
  }

  renderFrame()
  animFrameId = requestAnimationFrame(gameLoop)
}

function onKeyDown(e: KeyboardEvent) {
  keys.add(e.key)
  // Prevent arrow keys from scrolling the page
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault()
  }
}

function onKeyUp(e: KeyboardEvent) {
  keys.delete(e.key)
}

onMounted(() => {
  if (!canvasRef.value) return

  ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  // Disable image smoothing for crisp pixel art
  ctx.imageSmoothingEnabled = false

  // Generate the test map
  mapData = generateTestMap(64, 64)

  // Center camera on the map
  camera.x = mapData.width / 2
  camera.y = mapData.height / 2

  // Set up canvas size
  resize()

  // Start the render loop
  lastTime = 0
  animFrameId = requestAnimationFrame(gameLoop)

  // Event listeners
  window.addEventListener('resize', resize)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

onUnmounted(() => {
  cancelAnimationFrame(animFrameId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <canvas ref="canvasRef" />
</template>
