<template>
  <div class="vm-dropdown" @click="toggle">
    <slot name="button" />
    <div v-if="open" class="vm-dropdown-menu" @click.stop>
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const open = ref(false);
function toggle(e) {
  open.value = !open.value;
}
</script>

<style scoped>
.vm-dropdown {
  position: relative;
  display: inline-block;
}
.vm-dropdown-menu {
  position: absolute;
  z-index: 1000;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  min-width: 120px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-top: 4px;
}
</style>
