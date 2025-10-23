<template>
  <div class="drum-ui">
    <!-- Панель управления / WebMIDI -->
    <div class="midi-bar">
      <button class="btn" @click="connectMidiDevice" :disabled="midiConnectionState==='connecting'">
        {{ midiConnectionState==='connected' ? '✅ MIDI Connected' : '🎛️ Connect MIDI' }}
      </button>

      <select v-if="midiInputs.length" v-model="selectedInputId" @change="rebindSelectedInput">
        <option v-for="i in midiInputs" :key="i.id" :value="i.id">{{ i.name }}</option>
      </select>

      <select v-model="currentMapName" @change="rebuildNoteMap">
        <option value="yamaha_dtx">Yamaha DTX</option>
        <option value="roland_td">Roland TD</option>
        <option value="alesis">Alesis</option>
        <option value="gm">General MIDI</option>
      </select>

      <span v-if="connectionError" class="midi-error">{{ connectionError }}</span>
    </div>

    <div class="debug" v-if="isMidiMonitorEnabled && debug.count">
      MIDI events: {{ debug.count }} · {{ debug.last }}
    </div>

    <!-- Пэды -->
    <div class="kit">
      <div
        v-for="pad in pads"
        :key="pad.id"
        class="pad"
        @pointerdown="hit(pad)"
      >
        <div
          class="svg-wrap"
          :class="{ active: isActive(pad.id) }"
          :style="padStyle(pad.id)"
          v-html="getPadSvg(pad)"
        ></div>
        <div class="label">{{ pad.label }}</div>
      </div>
    </div>

    <DrumRoll :pads="pads" @hit="({pad, velocity}) => hit(pad, velocity)" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import DrumRoll from './DrumRoll.vue'

/* ======================= SVG для пэдов ======================= */
function getPadSvg(pad) {
  const raw = (pad.file || '').split(/[\\/]/).pop()
  if (svgs.value[raw]) return svgs.value[raw]

  const keys = Object.keys(svgs.value)
  const lower = keys.map(k => k.toLowerCase())

  if (pad.id === 'crash2') {
    let i = lower.findIndex(k => (k.includes('тарелка') || k.includes('crash') || k.includes('ride')) && /(^|[^0-9])2([^0-9]|$)/.test(k))
    if (i === -1) i = lower.findIndex(k => k.includes('тарелка') && k.includes('right'))
    if (i === -1) i = lower.findIndex(k => k.includes('crash') && /\br(ight)?\b/.test(k))
    if (i !== -1) return svgs.value[keys[i]]
  }
  if (pad.id === 'crash1') {
    let i = lower.findIndex(k => (k.includes('тарелка') || k.includes('crash')) && /(^|[^0-9])1([^0-9]|$)/.test(k))
    if (i === -1) i = lower.findIndex(k => k.includes('тарелка') && k.includes('left'))
    if (i === -1) i = lower.findIndex(k => k.includes('crash') && /\bl(eft)?\b/.test(k))
    if (i !== -1) return svgs.value[keys[i]]
  }
  const any = lower.findIndex(k => k.includes('тарелка') || k.includes('crash') || k.includes('ride'))
  if (any !== -1) return svgs.value[keys[any]]
  return fallbackSvg
}

/* ======================= Round-robin helper ======================= */
const rrIndex = new Map()
function rr(prefix, key, total) {
  const i = (rrIndex.get(key) ?? 0) % total
  rrIndex.set(key, i + 1)
  return `${prefix}/v${i + 1}.wav`
}

/* Кол-во семплов в папках /public/samples/... */
const RR_COUNTS = {
  kick: 6,
  hihat_closed: 6,
  hihat_open: 3,
  crash: 7,
  tom: 3,
  rimshot: 6,
  snare_center: 6,
  snare_off: 6,
  stick: 6,
}

/* Возвращаем путь к семплу по пэду и (если есть) ноте */
function sampleFor(padId, note) {
  // Kick
  if (padId === 'kick') return rr('/samples/kick', 'kick', RR_COUNTS.kick)

  // Snare
  if (padId === 'snare') return rr('/samples/snare_center', 'snare_center', RR_COUNTS.snare_center)

  // Toms
  if (padId === 'tom1' || padId === 'tom2' || padId === 'tom3') {
    return rr('/samples/tom', padId, RR_COUNTS.tom) // независимый rr по каждому тому
  }

  // Hi-hat (42=closed, 46=open, 44=pedal -> closed если нет педального)
  if (padId === 'hihat') {
    if (note === 46) return rr('/samples/hihat_open', 'hihat_open', RR_COUNTS.hihat_open)
    return rr('/samples/hihat_closed', 'hihat_closed', RR_COUNTS.hihat_closed)
  }

  // Crashes
  if (padId === 'crash1' || padId === 'crash2') {
    return rr('/samples/crash', 'crash', RR_COUNTS.crash)
  }

  // Ride (заглушка)
  if (padId === 'ride') return rr('/samples/stick', 'stick', RR_COUNTS.stick)

  return rr('/samples/stick', 'stick', RR_COUNTS.stick)
}

/* ======================= Пэды ======================= */
const pads = ref([
  { id: 'kick',   label: 'Бочка',    file: 'бочка.svg' },
  { id: 'snare',  label: 'Малый',    file: 'малый.svg' },
  { id: 'tom1',   label: 'Том 1',    file: 'том1_1.svg' },
  { id: 'tom2',   label: 'Том 2',    file: 'том2_1.svg' },
  { id: 'tom3',   label: 'Флор-том', file: 'том3.svg' },
  { id: 'hihat',  label: 'Хай-хэт',  file: 'хайхет.svg' },
  { id: 'crash1', label: 'Crash L',  file: 'тарелка1.svg' },
  { id: 'crash2', label: 'Crash R',  file: 'тарелка2.svg' },
])

/* ======================= SVG raw (Vite 5) ======================= */
const svgs = ref({})
const fallbackSvg =
  '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="48" stroke="currentColor" fill="none" stroke-width="4"/></svg>'

function normalizeSvg(content) {
  return content
    .replace(/^\uFEFF/, '')                // BOM
    .replace(/<\?xml[\s\S]*?\?>/i, '')     // XML пролог
    .replace(/<!DOCTYPE[\s\S]*?>/i, '')    // DOCTYPE
    .replace(/^\s+/, '')                   // лидирующие пробелы
    .replace(/<svg\b([^>]*?)>/i, (m, attrs) => {
      // гарантируем xmlns
      if (!/xmlns=/.test(m)) return `<svg ${attrs} xmlns="http://www.w3.org/2000/svg">`
      return m
    })
    .replace(/<svg\b([^>]*?)>/i, (m, attrs) => {
      if (/viewBox=/i.test(m)) return m
      const w = (/width="(\d+(?:\.\d+)?)"/i.exec(m) || [,'1024'])[1]
      const h = (/height="(\d+(?:\.\d+)?)"/i.exec(m) || [,'1024'])[1]
      return `<svg ${attrs} viewBox="0 0 ${w} ${h}">`
    })
    .replace(/fill="(?!none)[^"]*"/gi, 'fill="currentColor"')
    .replace(/stroke="[^"]*"/gi, 'stroke="currentColor"')
}

// 1) Глобом грузим svg
const svgModules = import.meta.glob('../svg/*.svg', { query: '?raw', import: 'default', eager: true })
for (const [path, raw] of Object.entries(svgModules)) {
  const file = path.split('/').pop()
  const txt = (typeof raw === 'string' ? raw : raw?.default) || ''
  svgs.value[file] = normalizeSvg(txt)
}

/* ======================= Подсветка (velocity) ======================= */
const ACTIVE_MS = 1000
const activeMap = ref(new Map()) // id -> vel(0..1)

function isActive(id) { return activeMap.value.has(id) }
function padStyle(id) { return { '--hit': activeMap.value.get(id) ?? 0 } }
function flash(id, vel = 1) {
  const v = Math.max(0, Math.min(1, vel))
  activeMap.value.set(id, v)
  activeMap.value = new Map(activeMap.value)
  setTimeout(() => {
    activeMap.value.delete(id)
    activeMap.value = new Map(activeMap.value)
  }, ACTIVE_MS)
}

/* ======================= Аудио ======================= */
let ctx
const cache = new Map()
async function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' })
  if (ctx.state === 'suspended') await ctx.resume()
  return ctx
}
async function playSample(url, vel = 1) {
  const c = await getCtx()
  let buf = cache.get(url)
  if (!buf) {
    const res = await fetch(url)
    buf = await c.decodeAudioData(await res.arrayBuffer())
    cache.set(url, buf)
  }
  const src = c.createBufferSource()
  const gain = c.createGain()
  src.buffer = buf
  gain.gain.value = Math.max(0.05, Math.min(1, vel))
  src.connect(gain).connect(c.destination)
  src.start()
}
async function hit(pad, vel = 1, note = null) {
  flash(pad.id, vel)
  const url = sampleFor(pad.id, note)
  if (url) await playSample(url, vel)
}

/* ======================= Карты нот ======================= */
const maps = {
  gm: {
    kick:[36,35], snare:[38,37,40], tom1:[50,48], tom2:[47,45], tom3:[43,41],
    hihat:[42,46,44,23,21],
    crash1:[49,55], crash2:[57,52,59], ride:[51,53,59],
  },
  yamaha_dtx: {
    kick:[36], snare:[38,37,40], tom1:[50], tom2:[47,45], tom3:[43,41],
    hihat:[42,46,44,23],
    crash1:[49,55], crash2:[57,52,59], ride:[51,53,59],
  },
  roland_td: {
    kick:[36,35], snare:[38,37,40], tom1:[50], tom2:[47,45], tom3:[43,41],
    hihat:[42,46,44,21,23],
    crash1:[49,55], crash2:[57,52], ride:[51,53,59],
  },
  alesis: {
    kick:[36], snare:[38,40], tom1:[50], tom2:[47,45], tom3:[43],
    hihat:[42,46,44], crash1:[49], crash2:[57], ride:[51,53],
  },
}
const currentMapName = ref('yamaha_dtx')
let noteToPad = {}
function rebuildNoteMap() {
  const m = maps[currentMapName.value] || maps.gm
  const dict = {}
  Object.entries(m).forEach(([padId, arr]) => {
    arr.forEach(n => { dict[n] = (padId === 'ride' ? 'crash2' : padId) })
  })
  noteToPad = dict
}
rebuildNoteMap()

/* ======================= WebMIDI ======================= */
const midiInputs = ref([])
const midiAccessRef = ref(null)
const connectionError = ref(null)
const MidiConnectionState = { IDLE:'idle', CONNECTED:'connected', ERROR:'error', CONNECTING:'connecting' }
const midiConnectionState = ref(MidiConnectionState.IDLE)
const selectedInputId = ref('')

const isMidiMonitorEnabled = ref(true)
const incomingData = ref({ status:null, number:null, velocity:null })
let monitorTimer = null
function startMidiMonitorTimeout(){ clearTimeout(monitorTimer); monitorTimer = setTimeout(() => { isMidiMonitorEnabled.value = false }, 2000) }
function stopMidiMonitorTimeout(){ clearTimeout(monitorTimer) }

const MIDI_CHANNEL_COUNT = 16
const BASE_MIDI_STATUS_BYTES = { NOTE_OFF: 0x80, NOTE_ON: 0x90, CONTROL_CHANGE: 0xB0 }
function checkStatusByte(statusByte, baseStatusByte) {
  return statusByte >= baseStatusByte && statusByte < baseStatusByte + MIDI_CHANNEL_COUNT
}
function checkAcceptedMidiMessage(status) {
  if (status >= 0xF0) return false
  return (
    checkStatusByte(status, BASE_MIDI_STATUS_BYTES.NOTE_ON) ||
    checkStatusByte(status, BASE_MIDI_STATUS_BYTES.NOTE_OFF) ||
    checkStatusByte(status, BASE_MIDI_STATUS_BYTES.CONTROL_CHANGE)
  )
}

const updateMidiInputs = (access) => {
  const inputs = [...access.inputs.values()]
  inputs.forEach((input) => { input.open(); input.onmidimessage = midiMessageHandler })
  midiInputs.value = inputs
  const prefer = inputs.find(i => /DrumPort|loopMIDI/i.test(i.name || ''))
  selectedInputId.value = (prefer?.id) || (inputs[0]?.id || '')
}
function rebindSelectedInput() {
  const inObj = midiInputs.value.find(i => i.id === selectedInputId.value)
  midiInputs.value.forEach(i => { if (i.id !== inObj?.id) i.onmidimessage = midiMessageHandler })
}

async function connectMidiDevice() {
  if (!('requestMIDIAccess' in navigator)) {
    connectionError.value = 'Web MIDI работает в Chrome/Edge и на HTTPS/localhost'
    midiConnectionState.value = MidiConnectionState.ERROR
    return
  }
  try {
    midiConnectionState.value = MidiConnectionState.CONNECTING
    const access = await navigator.requestMIDIAccess({ software: true })
    if (access.inputs.size === 0) {
      connectionError.value = 'MIDI-устройство не найдено'
      midiConnectionState.value = MidiConnectionState.ERROR
      return
    }
    midiAccessRef.value = access
    connectionError.value = null
    updateMidiInputs(access)
    access.onstatechange = (e) => {
      const a = e.currentTarget
      if (a && a.inputs.size === 0) {
        midiInputs.value.forEach(i => (i.onmidimessage = null))
        midiInputs.value = []
        midiConnectionState.value = MidiConnectionState.ERROR
        return
      }
      updateMidiInputs(a)
    }
    midiConnectionState.value = MidiConnectionState.CONNECTED
  } catch (e) {
    midiConnectionState.value = MidiConnectionState.ERROR
  }
}

const debug = ref({ count: 0, last: '' })
const midiMessageHandler = ({ data }) => {
  const [status, number, velocity] = data
  if (isMidiMonitorEnabled.value) {
    stopMidiMonitorTimeout()
    incomingData.value = { status, number, velocity }
    startMidiMonitorTimeout()
  }
  const cmd = status & 0xf0
  const ch  = (status & 0x0f) + 1
  debug.value.count++
  debug.value.last = `${Array.from(data).map(b=>b.toString(16).padStart(2,'0')).join(' ')} | cmd=0x${cmd.toString(16)} ch=${ch} note=${number} vel=${velocity}`
  if (!checkAcceptedMidiMessage(status)) return
  playNoteMidi(status, number, velocity)
}

function playNoteMidi(status, number, velocity) {
  if (checkStatusByte(status, BASE_MIDI_STATUS_BYTES.NOTE_ON)) {
    if (velocity === 0) return
    const padId = noteToPad[number] || 'kick'
    const pad = pads.value.find(p => p.id === padId)
    if (!pad) return
    const v = Math.max(0.1, Math.min(1, velocity / 127))
    hit(pad, v, number)        // пробрасываем note (для HH open 46)
    return
  }
  if (checkStatusByte(status, BASE_MIDI_STATUS_BYTES.NOTE_OFF)) return
}
</script>

<style scoped>
.drum-ui{
  display:flex; flex-direction:column; align-items:center; gap:12px;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
}
.midi-bar{
  display:flex; gap:10px; align-items:center;
  background:#fff; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,.08);
  padding:8px 12px;
}
.btn{
  background:linear-gradient(180deg,#fefefe,#e8e8e8);
  border:1px solid #ccc; border-radius:8px; padding:6px 12px;
  cursor:pointer; font-size:14px;
}
.midi-bar select{
  border:1px solid #ccc; border-radius:8px; padding:6px 8px; background:#fff;
}
.midi-error{ color:#c00; font-size:12px; }

.debug{
  font-size:12px; color:#374151; background:#eef2ff;
  border:1px solid #c7d2fe; padding:6px 8px; border-radius:8px;
}

.kit{
  display:flex; gap:20px; flex-wrap:nowrap; justify-content:center;
  background:#fff; border-radius:16px; padding:18px 22px;
  box-shadow: inset 0 2px 8px rgba(0,0,0,.06);
}
.pad{ text-align:center; cursor:pointer; transition:transform .1s ease; }
.pad:hover{ transform:scale(1.05); }
.label{ font-size:12px; margin-top:4px; color:#333; }

.svg-wrap{
  --hit: 0;
  color:#222;
  width:88px; height:88px;
  transition: color .15s ease, transform .15s ease, filter .15s ease;
}
.svg-wrap.active{
  color: hsl(0 70% calc(38% + var(--hit) * 8%));
  transform: scale(calc(1 + var(--hit) * 0.04));
  filter: drop-shadow(0 0 calc(var(--hit) * 2.5px) rgba(255, 50, 50, 0.25));
}
.svg-wrap :deep(svg){ width:100%; height:100%; display:block; }
.svg-wrap :deep(svg *){ fill:currentColor !important; stroke:currentColor !important; }
</style>
