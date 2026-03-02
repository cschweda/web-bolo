<script setup lang="ts">
const canvasRef = ref<HTMLCanvasElement | null>(null)

onMounted(() => {
  if (!canvasRef.value) return
  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  // Placeholder — will be replaced with tile map renderer
  canvasRef.value.width = window.innerWidth
  canvasRef.value.height = window.innerHeight
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  ctx.fillStyle = '#e94560'
  ctx.font = '24px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('WebBolo — Canvas initialized', canvasRef.value.width / 2, canvasRef.value.height / 2)
})
</script>

<template>
  <canvas ref="canvasRef" />
</template>
