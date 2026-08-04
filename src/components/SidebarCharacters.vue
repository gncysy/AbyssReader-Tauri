<template>
  <div class="sc-root">
    <div class="sc-slogan" v-if="sloganText">{{ sloganText }}</div>
    <div
      class="sc-area"
      ref="areaRef"
      @mousemove="onAreaMouseMove"
      @mouseup="onAreaMouseUp"
      @mouseleave="onAreaMouseUp"
    >
      <!-- 紫色 -->
      <div
        class="sc-chr sc-chr-purple"
        :ref="el => { if (el) refs.purple = el as HTMLElement }"
        :style="chrStyle('purple')"
        @mousedown.stop="startDrag($event, 'purple')"
        @click.stop="onClick(characters[0])"
        @dblclick.stop="resetPos('purple')"
        @mouseenter="onHover(characters[0])"
      >
        <div class="sc-face sc-face-purple">
          <div class="sc-eye left"><div class="sc-pupil"></div></div>
          <div class="sc-eye right"><div class="sc-pupil"></div></div>
        </div>
        <Transition name="bubble">
          <div v-if="bubbles.purple" class="sc-bubble">{{ bubbles.purple }}</div>
        </Transition>
      </div>

      <!-- 黑色（小黑） -->
      <div
        class="sc-chr sc-chr-black"
        :ref="el => { if (el) refs.black = el as HTMLElement }"
        :style="chrStyle('black')"
        @mousedown.stop="startDrag($event, 'black')"
        @click.stop="onClick(characters[1])"
        @dblclick.stop="resetPos('black')"
        @mouseenter="onHover(characters[1])"
      >
        <div class="sc-face sc-face-black">
          <div class="sc-eye left"><div class="sc-pupil"></div></div>
          <div class="sc-eye right"><div class="sc-pupil"></div></div>
        </div>
        <Transition name="bubble">
          <div v-if="bubbles.black" class="sc-bubble">{{ bubbles.black }}</div>
        </Transition>
      </div>

      <!-- 橙色 -->
      <div
        class="sc-chr sc-chr-orange"
        :ref="el => { if (el) refs.orange = el as HTMLElement }"
        :style="chrStyle('orange')"
        @mousedown.stop="startDrag($event, 'orange')"
        @click.stop="onClick(characters[2])"
        @dblclick.stop="resetPos('orange')"
        @mouseenter="onHover(characters[2])"
      >
        <div class="sc-face sc-face-orange">
          <div class="sc-dot left"></div>
          <div class="sc-dot right"></div>
        </div>
        <Transition name="bubble">
          <div v-if="bubbles.orange" class="sc-bubble">{{ bubbles.orange }}</div>
        </Transition>
      </div>

      <!-- 黄色 -->
      <div
        class="sc-chr sc-chr-yellow"
        :ref="el => { if (el) refs.yellow = el as HTMLElement }"
        :style="chrStyle('yellow')"
        @mousedown.stop="startDrag($event, 'yellow')"
        @click.stop="onClick(characters[3])"
        @dblclick.stop="resetPos('yellow')"
        @mouseenter="onHover(characters[3])"
      >
        <div class="sc-face sc-face-yellow">
          <div class="sc-dot left"></div>
          <div class="sc-dot right"></div>
        </div>
        <div class="sc-mouth"></div>
        <Transition name="bubble">
          <div v-if="bubbles.yellow" class="sc-bubble">{{ bubbles.yellow }}</div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import gsap from 'gsap'

// ── Props & Emits ──
const props = withDefaults(defineProps<{
  booksCount?: number
  todayReadCount?: number
  theme?: string
}>(), { booksCount: 0, todayReadCount: 0, theme: 'dark' })

const emit = defineEmits<{
  'toggle-theme': [val: string]
  'open-book': [bookId: string]
}>()

// ── 默认位置 ──
const DEFAULT_POS: Record<string, { x: number; y: number }> = {
  purple: { x: 14, y: 52 },
  black:  { x: 58, y: 76 },
  orange: { x: 0,  y: 98 },
  yellow: { x: 78, y: 86 },
}

function loadPositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem('sc-positions')
    if (raw) {
      const saved = JSON.parse(raw)
      const merged: any = {}
      for (const k of Object.keys(DEFAULT_POS)) {
        merged[k] = saved[k] || DEFAULT_POS[k]
      }
      return merged
    }
  } catch {}
  return { ...DEFAULT_POS }
}

const positions = reactive(loadPositions())

function savePositions() {
  localStorage.setItem('sc-positions', JSON.stringify({ ...positions }))
}

function chrStyle(id: string) {
  return { left: positions[id].x + 'px', top: positions[id].y + 'px' }
}

// ── 橙色角色汇报索引（按顺序循环） ──
const orangeReportIndex = ref(0)

// ── 构建橙色角色的汇报文案 ──
function buildOrangeTalks(booksCount: number, todayReadCount: number): string[] {
  const talks: string[] = []
  if (booksCount > 0) talks.push(`书架上有 ${booksCount} 本书`)
  if (todayReadCount > 0) talks.push(`今天读了 ${todayReadCount} 章`)
  if (talks.length === 0) talks.push('还没有书呢', '今天还没读书哦')
  return talks
}

// ── 角色配置 ──
const characters: {
  id: string
  eyeType: 'white' | 'dot'
  action: 'theme' | 'openBook' | 'report' | 'dance'
  talks: string[]
  idle: string[]
}[] = [
  { id: 'purple', eyeType: 'white', action: 'theme',
    talks: ['换个风格？', '眼睛舒服吗', '这个主题不错'],
    idle: ['嗯……', '思考中…', '今天真安静'] },
  { id: 'black', eyeType: 'white', action: 'openBook',
    talks: ['来本随机书！', '开盲盒咯~', '有惊喜'],
    idle: ['……', 'zzz', '好安静'] },
  { id: 'orange', eyeType: 'dot', action: 'report',
    talks: buildOrangeTalks(props.booksCount, props.todayReadCount),
    idle: ['好困呀', '有人来了吗', '天气真好'] },
  { id: 'yellow', eyeType: 'dot', action: 'dance',
    talks: ['来跳舞！', '啦啦啦~', '今天开心'],
    idle: ['♪', '哼哼~', '好开心'] },
]

// 监听 props 变化，动态更新橙色 talks
watch(() => [props.booksCount, props.todayReadCount], () => {
  characters[2].talks = buildOrangeTalks(props.booksCount, props.todayReadCount)
  if (orangeReportIndex.value >= characters[2].talks.length) {
    orangeReportIndex.value = 0
  }
})

// ── 状态 ──
const areaRef = ref<HTMLElement | null>(null)
const refs: Record<string, HTMLElement | null> = { purple: null, black: null, orange: null, yellow: null }
const bubbles = reactive<Record<string, string>>({ purple: '', black: '', orange: '', yellow: '' })
const sloganText = ref('今天读书了吗？')
const slogans = ['今天读书了吗？', '墨阅在等你', '书是人类进步的阶梯', '来翻翻书架吧', '阅读使人充实']

// ── 拖拽（防 click 误触发） ──
const dragging = ref('')
const dragStart = { x: 0, y: 0, elX: 0, elY: 0 }
const dragMoved = ref(false) // 标记是否发生了实际移动

function startDrag(e: MouseEvent, id: string) {
  dragging.value = id
  dragStart.x = e.clientX
  dragStart.y = e.clientY
  dragStart.elX = positions[id].x
  dragStart.elY = positions[id].y
  dragMoved.value = false
}

function onAreaMouseMove(e: MouseEvent) {
  if (!dragging.value || !areaRef.value) return
  const id = dragging.value
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  // 移动超过 3px 才算拖拽，避免微小抖动
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    dragMoved.value = true
  }
  const maxX = areaRef.value.clientWidth - 80
  const maxY = areaRef.value.clientHeight - 80
  positions[id] = {
    x: Math.max(0, Math.min(maxX, dragStart.elX + dx)),
    y: Math.max(0, Math.min(maxY, dragStart.elY + dy))
  }
}

function onAreaMouseUp() {
  if (dragging.value) {
    if (dragMoved.value) {
      savePositions()
    }
    dragging.value = ''
    // 延迟重置 dragMoved，确保 mouseup 后的 click 事件能读取到正确值
    setTimeout(() => { dragMoved.value = false }, 0)
  }
}

// ── 双击防 click 误触发 ──
const clickTimers: Record<string, ReturnType<typeof setTimeout> | null> = { purple: null, black: null, orange: null, yellow: null }
let lastClickTime: Record<string, number> = { purple: 0, black: 0, orange: 0, yellow: 0 }

function resetPos(id: string) {
  positions[id] = { ...DEFAULT_POS[id] }
  savePositions()
  // 清除该角色的 click 定时器，防止双击时的 click 触发 onClick
  if (clickTimers[id]) {
    clearTimeout(clickTimers[id])
    clickTimers[id] = null
  }
  // 归位时重置 rotation（修复小黄斜着的问题）
  const el = refs[id]
  if (el) {
    gsap.killTweensOf(el, 'rotation')
    gsap.set(el, { rotation: 0 })
  }
  showBubble(id, '归位！')
}

// ── 气泡 ──
function showBubble(id: string, msg: string, dur = 2500) {
  bubbles[id] = msg
  setTimeout(() => { if (bubbles[id] === msg) bubbles[id] = '' }, dur)
}

// ── 点击（带拖拽/双击防护） ──
let openBookTimer: ReturnType<typeof setTimeout> | null = null

function onClick(ch: typeof characters[0]) {
  // 拖拽移动过 → 不触发 click
  if (dragMoved.value) return

  const now = Date.now()
  const prev = lastClickTime[ch.id] || 0
  lastClickTime[ch.id] = now

  // 如果是短时间内第二次 click（双击的前半部分），延迟处理，等 dblclick 来取消
  if (now - prev < 350) {
    // 不在这里处理，等 dblclick 接管
    return
  }

  // 单次 click：延迟执行，给 dblclick 留出取消窗口
  if (clickTimers[ch.id]) clearTimeout(clickTimers[ch.id])
  clickTimers[ch.id] = setTimeout(() => {
    clickTimers[ch.id] = null
    performClick(ch)
  }, 360)
}

function performClick(ch: typeof characters[0]) {
  const el = refs[ch.id]
  if (!el) return

  // 先播放弹跳动画
  gsap.to(el, { y: -10, duration: 0.15, ease: 'power2.out', onComplete: () => gsap.to(el, { y: 0, duration: 0.3, ease: 'bounce.out' }) })

  if (ch.action === 'theme') {
    showBubble(ch.id, ch.talks[Math.floor(Math.random() * ch.talks.length)])
    const next = props.theme === 'dark' ? 'light' : props.theme === 'light' ? 'sepia' : 'dark'
    emit('toggle-theme', next)
  } else if (ch.action === 'openBook') {
    const talk = ch.talks[Math.floor(Math.random() * ch.talks.length)]
    showBubble(ch.id, talk, 3000)
    if (openBookTimer) clearTimeout(openBookTimer)
    openBookTimer = setTimeout(() => {
      emit('open-book', '')
      openBookTimer = null
    }, 1500)
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
    gsap.to(el, { rotation: 6, duration: 0.12, yoyo: true, repeat: 5, ease: 'power2.inOut' })
  }
}

// ── 悬停 ──
function onHover(ch: typeof characters[0]) {
  const el = refs[ch.id]
  if (!el) return
  gsap.to(el, { scale: 1.1, duration: 0.2, ease: 'back.out(1.5)' })
  const onLeave = () => {
    gsap.to(el, { scale: 1, duration: 0.2, ease: 'power2.out' })
    el.removeEventListener('mouseleave', onLeave)
  }
  el.addEventListener('mouseleave', onLeave)
}

// ── 鼠标跟踪 ──
const mouse = { x: 0, y: 0 }
let rafId = 0

function calcEyePos(el: HTMLElement, maxDist: number) {
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const dx = mouse.x - cx
  const dy = mouse.y - cy
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist)
  if (dist === 0) return { x: 0, y: 0 }
  const a = Math.atan2(dy, dx)
  return { x: Math.cos(a) * dist, y: Math.sin(a) * dist }
}

function tick() {
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
      const fx = Math.max(-6, Math.min(6, dx / 16))
      const fy = Math.max(-4, Math.min(4, dy / 22))
      const sk = Math.max(-3, Math.min(3, -dx / 90))
      if (faceEl) gsap.set(faceEl, { x: fx, y: fy })
      gsap.set(el, { skewX: sk })
      el.querySelectorAll('.sc-pupil').forEach(p => {
        const ep = calcEyePos(p as HTMLElement, 5)
        gsap.set(p, { x: ep.x, y: ep.y })
      })
    } else {
      const fx = Math.max(-8, Math.min(8, dx / 12))
      const fy = Math.max(-6, Math.min(6, dy / 18))
      if (faceEl) gsap.set(faceEl, { x: fx, y: fy })
      if (mouthEl) gsap.set(mouthEl, { x: fx, y: fy })
      el.querySelectorAll('.sc-dot').forEach(d => {
        const ep = calcEyePos(d as HTMLElement, 5)
        gsap.set(d, { x: ep.x, y: ep.y })
      })
    }
  }
  rafId = requestAnimationFrame(tick)
}

// ── 眨眼 ──
let blinkTimer: ReturnType<typeof setInterval>
function scheduleBlinks() {
  blinkTimer = setInterval(() => {
    ;['purple', 'black'].forEach(id => {
      const el = refs[id]
      if (!el) return
      el.querySelectorAll('.sc-eye').forEach(eye => {
        gsap.to(eye, { scaleY: 0.1, duration: 0.06, ease: 'power2.in' })
        setTimeout(() => gsap.to(eye, { scaleY: 1, duration: 0.06, ease: 'power2.out' }), 90)
      })
    })
  }, 3000 + Math.random() * 4000)
}

// ── 空闲 ──
let idleTimer: ReturnType<typeof setInterval>
function scheduleIdle() {
  idleTimer = setInterval(() => {
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
    gsap.to(el, { y: -5, duration: 0.12, ease: 'power2.out', yoyo: true, repeat: 1 })
  }, 7000 + Math.random() * 7000)
}

// ── 生命周期 ──
onMounted(() => {
  document.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY }, { passive: true })
  rafId = requestAnimationFrame(tick)
  scheduleBlinks()
  scheduleIdle()
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  clearInterval(blinkTimer)
  clearInterval(idleTimer)
  if (openBookTimer) clearTimeout(openBookTimer)
  Object.values(clickTimers).forEach(t => { if (t) clearTimeout(t) })
})
</script>

<style scoped>
.sc-root { display: flex; flex-direction: column; align-items: center; width: 100%; flex-shrink: 0; }
.sc-slogan { font-size: 11px; color: var(--text-muted); opacity: 0.45; padding: 8px 0 4px; transition: opacity 0.5s; letter-spacing: 0.04em; }
.sc-area { position: relative; width: 100%; height: 180px; user-select: none; }

.sc-chr { position: absolute; bottom: 0; cursor: grab; transition: filter 0.2s; }
.sc-chr:active { cursor: grabbing; }
.sc-chr:hover { filter: brightness(1.1); }

/* 紫 76×128 */
.sc-chr-purple { width: 76px; height: 128px; background: #6C3FF5; border-radius: 7px 7px 0 0; transform-origin: bottom center; }
.sc-face-purple { position: absolute; left: 16px; top: 24px; display: flex; gap: 22px; }

/* 黑 56×104 */
.sc-chr-black { width: 56px; height: 104px; background: #2D2D2D; border-radius: 6px 6px 0 0; transform-origin: bottom center; }
.sc-face-black { position: absolute; left: 9px; top: 20px; display: flex; gap: 16px; }
.sc-chr-black .sc-eye { width: 13px; height: 13px; }
.sc-chr-black .sc-pupil { width: 5px; height: 5px; }

/* 橙 86×82 */
.sc-chr-orange { width: 86px; height: 82px; background: #FF9B6B; border-radius: 43px 43px 0 0; transform-origin: bottom center; }
.sc-face-orange { position: absolute; left: 20px; top: 26px; display: flex; gap: 20px; }

/* 黄 64×94 */
.sc-chr-yellow { width: 64px; height: 94px; background: #E8D754; border-radius: 32px 32px 0 0; transform-origin: bottom center; }
.sc-face-yellow { position: absolute; left: 12px; top: 24px; display: flex; gap: 16px; }
.sc-mouth { position: absolute; left: 14px; top: 48px; width: 34px; height: 4px; background: #1a1a1a; border-radius: 0 0 6px 6px; }

/* 五官 */
.sc-eye { width: 16px; height: 16px; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.sc-pupil { width: 7px; height: 7px; border-radius: 50%; background: #1a1a1a; }
.sc-dot { width: 11px; height: 11px; border-radius: 50%; background: #1a1a1a; }

/* 气泡 */
.sc-bubble {
  position: absolute; bottom: 105%; left: 50%; transform: translateX(-50%);
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 10px; padding: 5px 10px; font-size: 11px; color: var(--text-primary);
  white-space: nowrap; box-shadow: var(--shadow-md); pointer-events: none; z-index: 50;
}
.bubble-enter-active { transition: opacity 0.25s, transform 0.25s; }
.bubble-leave-active { transition: opacity 0.2s, transform 0.2s; }
.bubble-enter-from { opacity: 0; transform: translateX(-50%) translateY(4px); }
.bubble-leave-to { opacity: 0; transform: translateX(-50%) translateY(-2px); }
</style>
