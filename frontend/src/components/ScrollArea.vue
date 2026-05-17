<template>
  <div class="scroll-area">
    <slot />
  </div>
</template>

<style scoped>
.scroll-area {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 24px;
}
</style>
