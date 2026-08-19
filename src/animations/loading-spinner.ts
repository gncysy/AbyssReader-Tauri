// ============================================
// GSAP 驱动的角色风格加载动画
// ============================================

import { loadingDots } from './index.js'

const DOT_COLORS = ['loading-dot-purple', 'loading-dot-black', 'loading-dot-orange', 'loading-dot-yellow']

function enhanceSpinner(el: HTMLElement): void {
  if (el.dataset.spinnerEnhanced === '1') return
  el.dataset.spinnerEnhanced = '1'

  const dots: HTMLElement[] = []
  for (let i = 0; i < 4; i++) {
    const dot = document.createElement('span')
    dot.className = 'dot ' + DOT_COLORS[i]
    el.appendChild(dot)
    dots.push(dot)
  }

  // 使用统一动画模块
  loadingDots(el, dots)
}

export function initLoadingSpinnerAnimation(): void {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.classList.contains('loading-spinner')) enhanceSpinner(node)
          node.querySelectorAll('.loading-spinner').forEach((el) => enhanceSpinner(el as HTMLElement))
        }
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  document.querySelectorAll('.loading-spinner').forEach((el) => enhanceSpinner(el as HTMLElement))
}
