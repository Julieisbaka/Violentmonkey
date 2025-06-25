<template>
  <div v-if="modelValue" class="vm-modal-overlay" @click.self="close">
    <div class="vm-modal-content">
      <slot />
      <button class="vm-modal-close" @click="close">×</button>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';
const props = defineProps({
  modelValue: Boolean,
});
const emit = defineEmits(['update:modelValue']);
function close() {
  emit('update:modelValue', false);
}
</script>

<style scoped>
.vm-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vm-modal-content {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  min-width: 300px;
  min-height: 100px;
  position: relative;
}
.vm-modal-close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
}
</style>
