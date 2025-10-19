<template>
  <div class="drum-ui">
    <!-- Панель управления / WebMIDI -->
    <div class="midi-bar">
      <button class="btn" @click="connectMidiDevice" :disabled="midiConnectionState==='connecting'">
        {{ midiConnectionState==='connected' ? '✅ MIDI Connected' : '🎛️ Connect MIDI' }}
      </button>

      <!-- список входов (все открыты и подписаны через updateMidiInputs) -->
      <select v-if="midiInputs.length" v-model="selectedInputId" @change="rebindSelectedInput">
        <option v-for="i in midiInputs" :key="i.id" :value="i.id">{{ i.name }}</option>
      </select>

      <!-- выбор карты нот под модуль -->
      <select v-model="currentMapName" @change="rebuildNoteMap">
        <option value="yamaha_dtx">Yamaha DTX</option>
        <option value="roland_td">Roland TD</option>
        <option value="alesis">Alesis</option>
        <option value="gm">General MIDI</option>
      </select>

      <span v-if="connectionError" class="midi-error">{{ connectionError }}</span>
    </div>

    <!-- Отладка MIDI: показывает последние байты -->
    <div class="debug" v-if="isMidiMonitorEnabled && debug.count">
      MIDI events: {{ debug.count }} · {{ debug.last }}
    </div>

    <!-- Пэды в один ряд -->
    <div class="kit">
      <div
        v-for="pad in pads"
        :key="pad.id"
        class="pad"
        @pointerdown="hit(pad)"
      >
        <div class="svg-wrap" :class="{ active: isActive(pad.id) }" v-html="getPadSvg(pad)" />

        <div class="label">{{ pad.label }}</div>
      </div>
    </div>
    <DrumRoll :pads="pads" @hit="({pad, velocity}) => hit(pad, velocity)" />
  </div>
</template>

<script setup>
/* ======================= Получение SVG для пэда ======================= */
import DrumRoll from './DrumRoll.vue'
function getPadSvg(pad) {
  // 1) точное имя без путей
  const raw = (pad.file || '').split(/[\\/]/).pop(); // убираем пути и обратные слэши
  if (svgs.value[raw]) return svgs.value[raw];

  // 2) умный поиск по ключевым словам
  const keys = Object.keys(svgs.value);
  const lower = keys.map(k => k.toLowerCase());

  if (pad.id === 'crash2') {
    // ищем “вторую” тарелку: цифра 2 / right / ride
    let i = lower.findIndex(k => (k.includes('тарелка') || k.includes('crash') || k.includes('ride')) && /(^|[^0-9])2([^0-9]|$)/.test(k));
    if (i === -1) i = lower.findIndex(k => k.includes('тарелка') && k.includes('right'));
    if (i === -1) i = lower.findIndex(k => k.includes('crash') && /\br(ight)?\b/.test(k));
    if (i !== -1) return svgs.value[keys[i]];
  }

  if (pad.id === 'crash1') {
    // левая: 1 / left / l
    let i = lower.findIndex(k => (k.includes('тарелка') || k.includes('crash')) && /(^|[^0-9])1([^0-9]|$)/.test(k));
    if (i === -1) i = lower.findIndex(k => k.includes('тарелка') && k.includes('left'));
    if (i === -1) i = lower.findIndex(k => k.includes('crash') && /\bl(eft)?\b/.test(k));
    if (i !== -1) return svgs.value[keys[i]];
  }

  // 3) любой файл, где встречается “тарелка”/“crash”/“ride”
  const any = lower.findIndex(k => k.includes('тарелка') || k.includes('crash') || k.includes('ride'));
  if (any !== -1) return svgs.value[keys[any]];

  // 4) запасной круг
  return fallbackSvg;
}

// Семплы из /public/samples — все пути начинаются с /samples/...
const SAMPLES = {
  kick: '/samples/Kick-V12-Yamaha-16x16.wav',

  // пока нет отдельных томов — временно используем rimshot (заменишь на свои томы)
  snare: '/samples/RIMSHOTS-V08-CW-6x13.wav',
  tom1:  '/samples/RIMSHOTS-V08-CW-6x13.wav',
  tom2:  '/samples/RIMSHOTS-V08-CW-6x13.wav',
  tom3:  '/samples/RIMSHOTS-V08-CW-6x13.wav',

  // hi-hat варианты
  hh_closed: '/samples/HHats-CL-V10-SABIAN-AAX.wav',
  hh_open:   '/samples/HHats-OP-V08-SABIAN-AAX.wav',
  hh_pedal:  '/samples/HHats-PDL-V05-SABIAN-AAX.wav',

  // крушки
  crash14:   '/samples/14-Crash-V06-SABIAN-14.wav',
  crash18:   '/samples/18-Crash-V05-SABIAN-18.wav',

  // bell/ride bell
  ride_bell: '/samples/BELL-V08-ROBMOR-SABIAN-22.wav',
}

// Ноты -> какой тип хэта/краша/бела
const NOTE_MEANING = {
  // HH
  42: 'hh_closed', // Closed Hat
  46: 'hh_open',   // Open Hat
  44: 'hh_pedal',  // Pedal Hat
  // Crash L/R (типовые GM/DTX/TD)
  49: 'crash14',
  57: 'crash18',
  55: 'crash14', // splash/alt
  // Ride bell иногда на 53/59 — дадим bell
  53: 'ride_bell',
  59: 'ride_bell',
}

// Возвращаем путь к семплу по padId и ноте (если есть)
function sampleFor(padId, note) {
  if (padId === 'hihat') {
    // при клике мышью note нет — берём closed
    const key = NOTE_MEANING[note] || 'hh_closed'
    return SAMPLES[key]
  }
  if (padId === 'crash1') return SAMPLES.crash14
  if (padId === 'crash2') {
    const key = NOTE_MEANING[note] || 'crash18'
    return SAMPLES[key]
  }
  if (padId === 'ride') return SAMPLES.ride_bell
  // остальное — прямой мэппинг по id
  return SAMPLES[padId]
}

async function hit(pad, vel = 1, note = null) {
  flash(pad.id)
  const url = sampleFor(pad.id, note)
  if (url) await playSample(url, vel)
}

// (legacy getSvgForPad removed)
/* ======================= Импорты / состояние ======================= */
import { ref } from 'vue'

/* ---------- Пэды (имена SVG — только ФАЙЛ из /src/svg) ---------- */
const pads = ref([
  { id: 'kick',   label: 'Бочка',    file: 'бочка.svg' },
  { id: 'snare',  label: 'Малый',    file: 'малый.svg' },
  { id: 'tom1',   label: 'Том 1',    file: 'том1_1.svg' },
  { id: 'tom2',   label: 'Том 2',    file: 'том2_1.svg' },
  { id: 'tom3',   label: 'Флор-том', file: 'том3.svg' },
  { id: 'hihat',  label: 'Хай-хэт',  file: 'хайхет.svg' },
  { id: 'crash1', label: 'Crash L',  file: 'тарелка1.svg' },
  { id: 'crash2', label: 'Crash R',  file: 'plate.svg' }
])

/* ======================= SVG как raw (Vite 5) ======================= */
const svgs = ref({})
const fallbackSvg =
  '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="48" stroke="currentColor" fill="none" stroke-width="4"/></svg>'

const svgModules = import.meta.glob('../svg/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
})
for (const [path, raw] of Object.entries(svgModules)) {
  const file = path.split('/').pop()
  const content = (typeof raw === 'string' ? raw : (raw && raw.default)) || ''
  svgs.value[file] = content
    .replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"')
    .replace(/stroke="[^"]*"/g, 'stroke="currentColor"')
}

/* ======================= Подсветка 1 сек ======================= */
const ACTIVE_MS = 1000
const activeIds = ref(new Set())
function isActive(id) { return activeIds.value.has(id) }
function flash(id) {
  activeIds.value.add(id)
  activeIds.value = new Set(activeIds.value)
  setTimeout(() => {
    activeIds.value.delete(id)
    activeIds.value = new Set(activeIds.value)
  }, ACTIVE_MS)
}

/* ======================= Звук (кэш + velocity) ======================= */
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
// (duplicate/old hit function removed)

/* ======================= Карты нот (Yamaha/Roland/Alesis/GM) ======================= */
const maps = {
  gm: {                            // General MIDI Drums
    kick:[36,35],
    snare:[38,37,40],
    tom1:[50,48],
    tom2:[47,45],
    tom3:[43,41],
    hihat:[42,46,44,23,21],        // closed/open/pedal/foot splash
    crash1:[49,55],                // crash/splash
    crash2:[57,52,59],             // crash2/china/ride edge
    ride:[51,53,59],
  },
  yamaha_dtx: {                    // Yamaha DTX
    kick:[36],
    snare:[38,37,40],
    tom1:[50],
    tom2:[47,45],
    tom3:[43,41],
    hihat:[42,46,44,23],
    crash1:[49,55],
    crash2:[57,52,59],
    ride:[51,53,59],
  },
  roland_td: {                     // Roland TD-series (типично)
    kick:[36,35],
    snare:[38,37,40],
    tom1:[50],
    tom2:[47,45],
    tom3:[43,41],
    hihat:[42,46,44,21,23],
    crash1:[49,55],
    crash2:[57,52],
    ride:[51,53,59],
  },
  alesis: {                        // Alesis Nitro/Surge/…
    kick:[36],
    snare:[38,40],
    tom1:[50],
    tom2:[47,45],
    tom3:[43],
    hihat:[42,46,44],
    crash1:[49],
    crash2:[57],
    ride:[51,53],
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

/* ======================= ADAPTER под «муз» API ======================= */
/** состояние соединения (их модель) */
const midiInputs = ref([])
const midiAccessRef = ref(null)      // access храню отдельно, но имя оставил близким к их коду
const connectionError = ref(null)
const MidiConnectionState = { IDLE:'idle', CONNECTED:'connected', ERROR:'error', CONNECTING:'connecting' }
const midiConnectionState = ref(MidiConnectionState.IDLE)
const selectedInputId = ref('')

/** монитор входа (как у них) */
const isMidiMonitorEnabled = ref(true)
const incomingData = ref({ status:null, number:null, velocity:null })
let monitorTimer = null
function startMidiMonitorTimeout(){ clearTimeout(monitorTimer); monitorTimer = setTimeout(() => { isMidiMonitorEnabled.value = false }, 2000) }
function stopMidiMonitorTimeout(){ clearTimeout(monitorTimer) }

/** базовые статусы и проверки (совместимы с их helpers) */
const MIDI_CHANNEL_COUNT = 16
const BASE_MIDI_STATUS_BYTES = {
  NOTE_OFF: 0x80,
  NOTE_ON:  0x90,
  CONTROL_CHANGE: 0xB0
}
function checkStatusByte(statusByte, baseStatusByte) {
  return statusByte >= baseStatusByte && statusByte < baseStatusByte + MIDI_CHANNEL_COUNT
}
function checkAcceptedMidiMessage(status/*, number*/) {
  if (status >= 0xF0) return false // sys/clock
  return (
    checkStatusByte(status, BASE_MIDI_STATUS_BYTES.NOTE_ON) ||
    checkStatusByte(status, BASE_MIDI_STATUS_BYTES.NOTE_OFF) ||
    checkStatusByte(status, BASE_MIDI_STATUS_BYTES.CONTROL_CHANGE)
  )
}

/** их updateMidiInputs: открываем все входы и вешаем midiMessageHandler */
const updateMidiInputs = (access) => {
  const inputs = [...access.inputs.values()]
  inputs.forEach((input) => {
    input.open()
    input.onmidimessage = midiMessageHandler
  })
  midiInputs.value = inputs
  // авто-выбор первого/DrumPort
  const prefer = inputs.find(i => /DrumPort|loopMIDI/i.test(i.name || ''))
  selectedInputId.value = (prefer?.id) || (inputs[0]?.id || '')
}

/** перенакинуть обработчик на другой выбранный вход (если нужно) */
function rebindSelectedInput() {
  const inObj = midiInputs.value.find(i => i.id === selectedInputId.value)
  midiInputs.value.forEach(i => { if (i.id !== inObj?.id) i.onmidimessage = midiMessageHandler }) // все и так подписаны
  // ничего дополнительно делать не нужно: мы подписываем КАЖДЫЙ вход в updateMidiInputs
}

/** их connectMidiDevice — полностью совместимый вызов */
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

/** их midiMessageHandler: вызывает нашу playNoteMidi */
const debug = ref({ count: 0, last: '' })
const midiMessageHandler = ({ data }) => {
  const [status, number, velocity] = data

  // монитор
  if (isMidiMonitorEnabled.value) {
    stopMidiMonitorTimeout()
    incomingData.value = { status, number, velocity }
    startMidiMonitorTimeout()
  }

  // отладочная строка
  const cmd = status & 0xf0
  const ch  = (status & 0x0f) + 1
  debug.value.count++
  debug.value.last = `${Array.from(data).map(b=>b.toString(16).padStart(2,'0')).join(' ')} | cmd=0x${cmd.toString(16)} ch=${ch} note=${number} vel=${velocity}`

  if (!checkAcceptedMidiMessage(status, number)) return
  playNoteMidi(status, number, velocity)
}

/** их playNoteMidi: вместо piano.noteOn/Off — наш hit(pad, vel) */
function playNoteMidi(status, number, velocity) {
  // Note On?
  if (checkStatusByte(status, BASE_MIDI_STATUS_BYTES.NOTE_ON)) {
    if (velocity === 0) return // NoteOn с vel=0 = NoteOff
    const padId = noteToPad[number] || 'kick'
    const pad = pads.value.find(p => p.id === padId)
    if (!pad) return
    const v = Math.max(0.1, Math.min(1, velocity / 127))
    hit(pad, v)
    return
  }
  // Note Off — подсветка сама погаснет через ACTIVE_MS, ничего не делаем
  if (checkStatusByte(status, BASE_MIDI_STATUS_BYTES.NOTE_OFF)) return

  // CC/педаль — не используем
}
console.log('[SVG files]', Object.keys(svgs.value))

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

.svg-wrap{ color:#222; width:88px; height:88px; transition:color .12s, transform .1s; }
.svg-wrap.active{ color:#ef4444; transform:scale(1.1); }
.svg-wrap :deep(svg){ width:100%; height:100%; display:block; }
.svg-wrap :deep(svg *){ fill:currentColor !important; stroke:currentColor !important; }
</style>
