<template>
  <div class="book-card-skeleton">
    <div class="skeleton skeleton-cover"></div>
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton skeleton-author"></div>
  </div>
</template>

<style scoped>
.book-card-skeleton .skeleton { background: var(--bg-card); border-radius: var(--radius-sm); animation: shimmer 1.5s infinite; }
.skeleton-cover { aspect-ratio: 2/3; border-radius: var(--radius-md) !important; }
.skeleton-title { height: 16px; width: 80%; margin-top: 14px; }
.skeleton-author { height: 12px; width: 50%; margin-top: 8px; }
@keyframes shimmer { 0%,100% { opacity: 0.35; } 50% { opacity: 0.65; } }
</style>
