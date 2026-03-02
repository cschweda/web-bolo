<script setup lang="ts">
const title = 'WebBolo'
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white">
    <h1 class="text-4xl font-bold mb-4">{{ title }}</h1>
    <p class="text-gray-400 mb-8">Browser-based reimplementation of the classic 1987 tank game</p>
    <UButton to="/play" size="xl" color="primary">
      Play
    </UButton>
  </div>
</template>
