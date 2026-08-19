<template>
  <div class="progress-bar">
    <div class="progress-fill" :style="{ width: percent + '%' }"></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ percent: number }>()
</script>

<style scoped>
.progress-bar { height: 5px; background: var(--bg-hover); border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--brand); border-radius: 3px; transition: width 0.4s var(--ease-out); }
</style>
