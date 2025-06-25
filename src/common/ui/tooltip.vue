<template>
  <span class="vm-tooltip-wrapper" @mouseenter="show = true" @mouseleave="show = false">
    <slot />
    <span v-if="show" class="vm-tooltip" :style="tooltipStyle">{{ content }}</span>
  </span>
</template>

<script setup>
import { ref, computed } from 'vue';
const props = defineProps({
  content: String,
  align: String,
});
const show = ref(false);
const tooltipStyle = computed(() => ({
  left: props.align === 'end' ? 'auto' : '0',
  right: props.align === 'end' ? '0' : 'auto',
}));
</script>

<style scoped>
.vm-tooltip-wrapper {
  position: relative;
  display: inline-block;
}
.vm-tooltip {
  position: absolute;
  z-index: 1000;
  background: #222;
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: pre;
  top: 100%;
  left: 0;
  margin-top: 4px;
  pointer-events: none;
}
</style>
