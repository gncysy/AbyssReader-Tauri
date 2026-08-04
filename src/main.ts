import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import { router } from './router/index.js'
import './styles/index.css'

const app = createApp(App)
app.use(createPinia())
app.use(naive)
app.use(router)
app.mount('#app')

// 隐藏加载动画
const loadingEl = document.getElementById('app-loading')
if (loadingEl) {
  loadingEl.classList.add('hidden')
  setTimeout(() => {
    if (loadingEl.parentNode) {
      loadingEl.remove()
    }
  }, 600)
}

// ─── GSAP 驱动的角色风格加载动画 ───
import gsap from 'gsap'

const DOT_COLORS = ['loading-dot-purple', 'loading-dot-black', 'loading-dot-orange', 'loading-dot-yellow']

function enhanceSpinner(el: HTMLElement) {
  if (el.dataset.spinnerEnhanced === '1') return
  el.dataset.spinnerEnhanced = '1'

  const dots: HTMLElement[] = []
  for (let i = 0; i < 4; i++) {
    const dot = document.createElement('span')
    dot.className = 'dot ' + DOT_COLORS[i]
    el.appendChild(dot)
    dots.push(dot)
  }

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.15 })
  const STAGGER = 0.12
  const DURATION = 0.45
  const EASE_UP = 'elastic.out(1, 0.5)'
  const EASE_DOWN = 'power2.in'

  dots.forEach((dot, i) => {
    tl.fromTo(dot,
      { y: 0, scale: 1 },
      { y: -18, scale: 1.25, duration: DURATION, ease: EASE_UP },
      i * STAGGER
    )
    tl.to(dot,
      { y: 0, scale: 1, duration: DURATION * 0.8, ease: EASE_DOWN },
      i * STAGGER + DURATION * 0.3
    )
  })
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node instanceof HTMLElement) {
        if (node.classList.contains('loading-spinner')) {
          enhanceSpinner(node)
        }
        node.querySelectorAll('.loading-spinner').forEach(el => enhanceSpinner(el as HTMLElement))
      }
    }
  }
})
observer.observe(document.body, { childList: true, subtree: true })

document.querySelectorAll('.loading-spinner').forEach(el => enhanceSpinner(el as HTMLElement))
