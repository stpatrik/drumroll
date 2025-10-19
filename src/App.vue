<template>
  <main class="page">
    <DrumVisualizer />
  </main>
</template>

<script setup>
import DrumVisualizer from './components/DrumVisualizer.vue'
</script>

<style>
html, body, #app { height: 100%; margin: 0; }
.page {
  min-height: 100%;
  display: grid;
  place-items: start center;
  background: #f3f4f6;
  padding: 24px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
</style>
