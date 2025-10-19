<template>
  <div class="roll">
    <div class="toolbar">
      <button class="btn" @click="toggle">{{ playing ? '⏹ Stop' : '▶ Play' }}</button>
      <label> BPM <input type="number" v-model.number="bpm" min="30" max="300" /></label>
      <label> Steps
        <select v-model.number="steps">
          <option v-for="n in [8,12,16,24,32]" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <button class="btn" @click="clearAll">Clear</button>
      <button class="btn" @click="randomize">Random</button>
    </div>

    <div class="grid" :style="{gridTemplateColumns: '160px ' + steps + 'fr'}">
      <div class="hdr"></div>
      <div class="cols">
        <div v-for="c in steps" :key="'c'+c" class="col-num" :class="{ now: (c-1)===step }">{{ c }}</div>
      </div>

      <template v-for="(row, rIdx) in rows" :key="pads[rIdx].id">
        <div class="pad-name">{{ pads[rIdx].label }}</div>
        <div class="row">
          <button
            v-for="(cell, cIdx) in row"
            :key="cIdx"
            class="cell"
            :class="{ on: cell, now: playing && cIdx===step }"
            @click="rows[rIdx][cIdx] = !rows[rIdx][cIdx]"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'

/** вход: список пэдов (из вашего DrumVisualizer) */
const props = defineProps({
  pads: { type: Array, required: true }
})
/** событие наверх: попросить сыграть пэд */
const emit = defineEmits(['hit']) // emit('hit', { pad, velocity })

/* --------- матрица шагов --------- */
const steps = ref(16)
const rows  = ref([]) // bool[][]

function rebuildRows() {
  rows.value = props.pads.map(() => Array(steps.value).fill(false))
}
rebuildRows()
watch(steps, rebuildRows)

/* --------- плеер/тайминг (16-е ноты) --------- */
const bpm = ref(120)
const playing = ref(false)
const step = ref(0)
let timer = null

function scheduleNext() {
  const intervalMs = (60_000 / bpm.value) / 4 // шестнадцатые
  timer = setTimeout(tick, intervalMs)
}
function tick() {
  // проиграть активные клетки в текущем столбце
  rows.value.forEach((row, rIdx) => {
    if (row[step.value]) {
      const pad = props.pads[rIdx]
      emit('hit', { pad, velocity: 1 }) // вызовем родителя
    }
  })
  // шаг вперёд
  step.value = (step.value + 1) % steps.value
  scheduleNext()
}
function start() {
  if (playing.value) return
  playing.value = true
  step.value = 0
  scheduleNext()
}
function stop() {
  playing.value = false
  clearTimeout(timer); timer = null
}
function toggle(){ playing.value ? stop() : start() }
watch(bpm, () => { if (playing.value) { clearTimeout(timer); scheduleNext() } })

/* --------- утилиты --------- */
function clearAll() { rows.value.forEach(r => r.fill(false)) }
function randomize() { rows.value.forEach(r => r.forEach((_,i)=> r[i] = Math.random() < 0.15)) }

onBeforeUnmount(() => stop())
</script>

<style scoped>
.roll{ display:flex; flex-direction:column; gap:10px; }
.toolbar{ display:flex; gap:10px; align-items:center; }
.btn{ padding:6px 12px; border:1px solid #ccc; border-radius:8px; background:#fff; cursor:pointer; }
.toolbar input, .toolbar select{ padding:4px 8px; border:1px solid #ccc; border-radius:6px; }

.grid{ display:grid; gap:6px; }
.hdr{}
.cols{ display:grid; grid-auto-flow:column; gap:6px; }
.col-num{ text-align:center; font-size:12px; color:#6b7280; padding:2px 0; border-radius:6px; }
.col-num.now{ background:#e5e7eb; }

.pad-name{ display:flex; align-items:center; padding:6px 8px; font-size:14px; color:#333; background:#fff; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
.row{ display:grid; grid-auto-flow:column; gap:6px; }
.cell{
  width:26px; height:26px; border-radius:6px; border:1px solid #d1d5db;
  background:#fff; cursor:pointer; transition:transform .06s, background .12s;
}
.cell.on{ background:#111; border-color:#111; }
.cell.now{ outline:2px solid #f87171; }
.cell.on.now{ background:#ef4444; border-color:#ef4444; }
</style>
