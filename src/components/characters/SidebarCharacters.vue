<template>
  <div class="sc-root">
    <div class="sc-slogan" v-if="sloganText">{{ sloganText }}</div>
    <div class="sc-area" ref="areaRef" @mousemove="onAreaMouseMove" @mouseup="onAreaMouseUp" @mouseleave="onAreaMouseUp">
      <div class="sc-chr sc-chr-purple" :ref="el => { if (el) refs.purple = el as HTMLElement }" :style="chrStyle('purple')"
        @mousedown.stop="startDrag($event, 'purple')" @click.stop="onClick(characters[0])" @dblclick.stop="resetPos('purple')" @mouseenter="onHover(characters[0])">
        <div class="sc-face sc-face-purple"><div class="sc-eye left"><div class="sc-pupil"></div></div><div class="sc-eye right"><div class="sc-pupil"></div></div></div>
        <Transition name="bubble"><div v-if="bubbles.purple" class="sc-bubble">{{ bubbles.purple }}</div></Transition>
      </div>
      <div class="sc-chr sc-chr-black" :ref="el => { if (el) refs.black = el as HTMLElement }" :style="chrStyle('black')"
        @mousedown.stop="startDrag($event, 'black')" @click.stop="onClick(characters[1])" @dblclick.stop="resetPos('black')" @mouseenter="onHover(characters[1])">
        <div class="sc-face sc-face-black"><div class="sc-eye left"><div class="sc-pupil"></div></div><div class="sc-eye right"><div class="sc-pupil"></div></div></div>
        <Transition name="bubble"><div v-if="bubbles.black" class="sc-bubble">{{ bubbles.black }}</div></Transition>
      </div>
      <div class="sc-chr sc-chr-orange" :ref="el => { if (el) refs.orange = el as HTMLElement }" :style="chrStyle('orange')"
        @mousedown.stop="startDrag($event, 'orange')" @click.stop="onClick(characters[2])" @dblclick.stop="resetPos('orange')" @mouseenter="onHover(characters[2])">
        <div class="sc-face sc-face-orange"><div class="sc-dot left"></div><div class="sc-dot right"></div></div>
        <Transition name="bubble"><div v-if="bubbles.orange" class="sc-bubble">{{ bubbles.orange }}</div></Transition>
      </div>
      <div class="sc-chr sc-chr-yellow" :ref="el => { if (el) refs.yellow = el as HTMLElement }" :style="chrStyle('yellow')"
        @mousedown.stop="startDrag($event, 'yellow')" @click.stop="onClick(characters[3])" @dblclick.stop="resetPos('yellow')" @mouseenter="onHover(characters[3])">
        <div class="sc-face sc-face-yellow"><div class="sc-dot left"></div><div class="sc-dot right"></div></div>
        <div class="sc-mouth"></div>
        <Transition name="bubble"><div v-if="bubbles.yellow" class="sc-bubble">{{ bubbles.yellow }}</div></Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { bounce, pulse, jump, shake, eyeFollow, faceFollow, blink, reset } from '@/animations/index.js'

const props = withDefaults(defineProps<{ booksCount?: number; todayReadCount?: number; theme?: string }>(), { booksCount: 0, todayReadCount: 0, theme: 'dark' })
const emit = defineEmits<{ 'toggle-theme': [val: string]; 'open-book': [bookId: string] }>()

const DEFAULT_POS: Record<string, { x: number; y: number }> = { purple: { x: 14, y: 52 }, black: { x: 58, y: 76 }, orange: { x: 0, y: 98 }, yellow: { x: 78, y: 86 } }

// 位置边界校验
function clampPosition(pos: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(200, pos.x)),
    y: Math.max(0, Math.min(150, pos.y)),
  }
}

function loadPositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem('sc-positions')
    if (raw) {
      const saved = JSON.parse(raw)
      const merged: any = {}
      for (const k of Object.keys(DEFAULT_POS)) {
        const val = saved[k]
        merged[k] = val && typeof val.x === 'number' && typeof val.y === 'number'
          ? clampPosition(val)
          : { ...DEFAULT_POS[k] }
      }
      return merged
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_POS }
}

const positions = reactive(loadPositions())
function savePositions(): void { localStorage.setItem('sc-positions', JSON.stringify({ ...positions })) }
function chrStyle(id: string) { return { left: positions[id].x + 'px', top: positions[id].y + 'px' } }

const orangeReportIndex = ref(0)

function buildOrangeTalks(booksCount: number, todayReadCount: number): string[] {
  const talks: string[] = []
  if (booksCount > 0) talks.push(`书架上有 ${booksCount} 本书`)
  if (todayReadCount > 0) talks.push(`今天读了 ${todayReadCount} 章`)
  if (talks.length === 0) talks.push('还没有书呢', '今天还没读书哦')
  return talks
}

const characters: { id: string; eyeType: 'white' | 'dot'; action: 'theme' | 'openBook' | 'report' | 'dance'; talks: string[]; idle: string[] }[] = [
  { id: 'purple', eyeType: 'white', action: 'theme', talks: ['换个风格？', '眼睛舒服吗', '这个主题不错'], idle: ['嗯……', '思考中…', '今天真安静'] },
  { id: 'black', eyeType: 'white', action: 'openBook', talks: ['来本随机书！', '开盲盒咯~', '有惊喜'], idle: ['……', 'zzz', '好安静'] },
  { id: 'orange', eyeType: 'dot', action: 'report', talks: buildOrangeTalks(props.booksCount, props.todayReadCount), idle: ['好困呀', '有人来了吗', '天气真好'] },
  { id: 'yellow', eyeType: 'dot', action: 'dance', talks: ['来跳舞！', '啦啦啦~', '今天开心'], idle: ['♪', '哼哼~', '好开心'] },
]

watch(() => [props.booksCount, props.todayReadCount], () => {
  characters[2].talks = buildOrangeTalks(props.booksCount, props.todayReadCount)
  if (orangeReportIndex.value >= characters[2].talks.length) orangeReportIndex.value = 0
})

const areaRef = ref<HTMLElement | null>(null)
const refs: Record<string, HTMLElement | null> = { purple: null, black: null, orange: null, yellow: null }
const bubbles = reactive<Record<string, string>>({ purple: '', black: '', orange: '', yellow: '' })
const sloganText = ref('今天读书了吗？')
const slogans = ['今天读书了吗？', '墨阅在等你', '书是人类进步的阶梯', '来翻翻书架吧', '阅读使人充实']

const dragging = ref('')
const dragStart = { x: 0, y: 0, elX: 0, elY: 0 }
const dragMoved = ref(false)

function startDrag(e: MouseEvent, id: string): void { dragging.value = id; dragStart.x = e.clientX; dragStart.y = e.clientY; dragStart.elX = positions[id].x; dragStart.elY = positions[id].y; dragMoved.value = false }

function onAreaMouseMove(e: MouseEvent): void {
  if (!dragging.value || !areaRef.value) return
  const id = dragging.value
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.value = true
  const maxX = areaRef.value.clientWidth - 80
  const maxY = areaRef.value.clientHeight - 80
  const newPos = clampPosition({ x: dragStart.elX + dx, y: dragStart.elY + dy })
  positions[id] = {
    x: Math.max(0, Math.min(maxX, newPos.x)),
    y: Math.max(0, Math.min(maxY, newPos.y)),
  }
}

function onAreaMouseUp(): void {
  if (dragging.value) {
    if (dragMoved.value) savePositions()
    dragging.value = ''
    setTimeout(() => { dragMoved.value = false }, 0)
  }
}

const clickTimers: Record<string, ReturnType<typeof setTimeout> | null> = { purple: null, black: null, orange: null, yellow: null }
const lastClickTime: Record<string, number> = { purple: 0, black: 0, orange: 0, yellow: 0 }

function resetPos(id: string): void {
  positions[id] = { ...DEFAULT_POS[id] }
  savePositions()
  if (clickTimers[id]) { clearTimeout(clickTimers[id]); clickTimers[id] = null }
  const el = refs[id]
  if (el) reset(el)
  showBubble(id, '归位！')
}

function showBubble(id: string, msg: string, dur = 2500): void {
  bubbles[id] = msg
  setTimeout(() => { if (bubbles[id] === msg) bubbles[id] = '' }, dur)
}

let openBookTimer: ReturnType<typeof setTimeout> | null = null

function onClick(ch: typeof characters[0]): void {
  if (dragMoved.value) return
  const now = Date.now()
  const prev = lastClickTime[ch.id] || 0
  lastClickTime[ch.id] = now
  if (now - prev < 350) return
  if (clickTimers[ch.id]) clearTimeout(clickTimers[ch.id])
  clickTimers[ch.id] = setTimeout(() => { clickTimers[ch.id] = null; performClick(ch) }, 360)
}

function performClick(ch: typeof characters[0]): void {
  const el = refs[ch.id]
  if (!el) return
  bounce(el, -10)

  if (ch.action === 'theme') {
    showBubble(ch.id, ch.talks[Math.floor(Math.random() * ch.talks.length)])
    const next = props.theme === 'dark' ? 'light' : props.theme === 'light' ? 'sepia' : 'dark'
    emit('toggle-theme', next)
  } else if (ch.action === 'openBook') {
    const talk = ch.talks[Math.floor(Math.random() * ch.talks.length)]
    showBubble(ch.id, talk, 3000)
    if (openBookTimer) clearTimeout(openBookTimer)
    openBookTimer = setTimeout(() => { emit('open-book', ''); openBookTimer = null }, 1500)
  } else if (ch.action === 'report') {
    const talks = ch.talks
    if (talks.length > 0) {
      const idx = orangeReportIndex.value % talks.length
      showBubble(ch.id, talks[idx])
      orangeReportIndex.value = idx + 1
    }
  } else if (ch.action === 'dance') {
    const talk = ch.talks[Math.floor(Math.random() * ch.talks.length)]
    showBubble(ch.id, talk)
    shake(el, 6, 5)
  }
}

function onHover(ch: typeof characters[0]): void {
  const el = refs[ch.id]
  if (!el) return
  pulse(el, 1.1, 0.2)
}

const mouse = { x: 0, y: 0 }
let rafId = 0
let isAnimationRunning = false

function tick(): void {
  for (const ch of characters) {
    const el = refs[ch.id]
    if (!el) continue
    const r = el.getBoundingClientRect()
    const bodyCy = r.top + r.height * 0.3
    const dx = mouse.x - (r.left + r.width / 2)
    const dy = mouse.y - bodyCy

    const faceEl = el.querySelector('.sc-face') as HTMLElement
    const mouthEl = el.querySelector('.sc-mouth') as HTMLElement

    if (ch.eyeType === 'white') {
      if (faceEl) faceFollow(faceEl, dx, dy, 6, 4)
      el.querySelectorAll('.sc-pupil').forEach((p) => {
        eyeFollow(p as HTMLElement, dx / 16, dy / 22, 5)
      })
    } else {
      if (faceEl) faceFollow(faceEl, dx, dy, 8, 6)
      if (mouthEl) faceFollow(mouthEl, dx, dy, 8, 6)
      el.querySelectorAll('.sc-dot').forEach((d) => {
        eyeFollow(d as HTMLElement, dx / 12, dy / 18, 5)
      })
    }
  }
  rafId = requestAnimationFrame(tick)
}

function startAnimation(): void {
  if (isAnimationRunning) return
  isAnimationRunning = true
  rafId = requestAnimationFrame(tick)
}

function stopAnimation(): void {
  if (!isAnimationRunning) return
  isAnimationRunning = false
  cancelAnimationFrame(rafId)
}

// 使用 IntersectionObserver 检测可见性
let visibilityObserver: IntersectionObserver | null = null

let blinkTimer: ReturnType<typeof setInterval> | null = null
function scheduleBlinks(): void {
  if (blinkTimer) clearInterval(blinkTimer)
  blinkTimer = setInterval(() => {
    if (!isAnimationRunning) return
    ;['purple', 'black'].forEach(id => {
      const el = refs[id]
      if (!el) return
      const eyes = el.querySelectorAll('.sc-eye')
      blink(Array.from(eyes) as HTMLElement[], 0.06)
    })
  }, 3000 + Math.random() * 4000)
}

let idleTimer: ReturnType<typeof setInterval> | null = null
function scheduleIdle(): void {
  if (idleTimer) clearInterval(idleTimer)
  idleTimer = setInterval(() => {
    if (!isAnimationRunning) return
    const idx = Math.floor(Math.random() * characters.length)
    const ch = characters[idx]
    const el = refs[ch.id]
    if (!el) return
    if (Math.random() < 0.35 && !bubbles[ch.id]) {
      showBubble(ch.id, ch.idle[Math.floor(Math.random() * ch.idle.length)])
    }
    if (Math.random() < 0.15) {
      sloganText.value = slogans[Math.floor(Math.random() * slogans.length)]
    }
    jump(el, -5)
  }, 7000 + Math.random() * 7000)
}

onMounted(() => {
  document.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY }, { passive: true })

  // 可见性检测：不可见时停止动画
  if (areaRef.value) {
    visibilityObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        startAnimation()
      } else {
        stopAnimation()
      }
    }, { threshold: 0 })
    visibilityObserver.observe(areaRef.value)
  } else {
    startAnimation()
  }

  scheduleBlinks()
  scheduleIdle()
})

onUnmounted(() => {
  stopAnimation()
  if (visibilityObserver) {
    visibilityObserver.disconnect()
    visibilityObserver = null
  }
  if (blinkTimer) clearInterval(blinkTimer)
  if (idleTimer) clearInterval(idleTimer)
  if (openBookTimer) clearTimeout(openBookTimer)
  Object.values(clickTimers).forEach(t => { if (t) clearTimeout(t) })
})
</script>

<style scoped>
.sc-root { display: flex; flex-direction: column; align-items: center; width: 100%; flex-shrink: 0; }
.sc-slogan { font-size: 11px; color: var(--text-muted); opacity: 0.45; padding: 8px 0 4px; transition: opacity 0.5s; letter-spacing: 0.04em; }
.sc-area { position: relative; width: 100%; height: 180px; user-select: none; }
.sc-chr { position: absolute; bottom: 0; cursor: grab; transition: filter 0.2s; will-change: transform; }
.sc-chr:active { cursor: grabbing; }
.sc-chr:hover { filter: brightness(1.1); }
.sc-chr-purple { width: 76px; height: 128px; background: #6C3FF5; border-radius: 7px 7px 0 0; transform-origin: bottom center; }
.sc-face-purple { position: absolute; left: 16px; top: 24px; display: flex; gap: 22px; will-change: transform; }
.sc-chr-black { width: 56px; height: 104px; background: #2D2D2D; border-radius: 6px 6px 0 0; transform-origin: bottom center; }
.sc-face-black { position: absolute; left: 9px; top: 20px; display: flex; gap: 16px; will-change: transform; }
.sc-chr-black .sc-eye { width: 13px; height: 13px; }
.sc-chr-black .sc-pupil { width: 5px; height: 5px; }
.sc-chr-orange { width: 86px; height: 82px; background: #FF9B6B; border-radius: 43px 43px 0 0; transform-origin: bottom center; }
.sc-face-orange { position: absolute; left: 20px; top: 26px; display: flex; gap: 20px; will-change: transform; }
.sc-chr-yellow { width: 64px; height: 94px; background: #E8D754; border-radius: 32px 32px 0 0; transform-origin: bottom center; }
.sc-face-yellow { position: absolute; left: 12px; top: 24px; display: flex; gap: 16px; will-change: transform; }
.sc-mouth { position: absolute; left: 14px; top: 48px; width: 34px; height: 4px; background: #1a1a1a; border-radius: 0 0 6px 6px; }
.sc-eye { width: 16px; height: 16px; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.sc-pupil { width: 7px; height: 7px; border-radius: 50%; background: #1a1a1a; will-change: transform; }
.sc-dot { width: 11px; height: 11px; border-radius: 50%; background: #1a1a1a; will-change: transform; }
.sc-bubble { position: absolute; bottom: 105%; left: 50%; transform: translateX(-50%); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 5px 10px; font-size: 11px; color: var(--text-primary); white-space: nowrap; box-shadow: var(--shadow-md); pointer-events: none; z-index: 50; }
.bubble-enter-active { transition: opacity 0.25s, transform 0.25s; }
.bubble-leave-active { transition: opacity 0.2s, transform 0.2s; }
.bubble-enter-from { opacity: 0; transform: translateX(-50%) translateY(4px); }
.bubble-leave-to { opacity: 0; transform: translateX(-50%) translateY(-2px); }
</style>
