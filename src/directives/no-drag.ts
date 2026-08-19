// ============================================
// v-no-drag 指令
// 解决问题：Tauri 窗口拖动区域下的按钮点击冲突
// ============================================

const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]'

let activeInstances = 0

function disableTitlebarDrag(): void {
  const titlebar = document.querySelector('.titlebar-drag') as HTMLElement
  if (titlebar) {
    titlebar.style.setProperty('-webkit-app-region', 'no-drag', 'important')
  }
}

function restoreTitlebarDrag(): void {
  const titlebar = document.querySelector('.titlebar-drag') as HTMLElement
  if (titlebar) {
    titlebar.style.setProperty('-webkit-app-region', 'drag', 'important')
  }
}

function applyNoDrag(root: HTMLElement): void {
  root.style.setProperty('-webkit-app-region', 'no-drag', 'important')
  const all = root.querySelectorAll('*')
  all.forEach((el) => {
    const htmlEl = el as HTMLElement
    htmlEl.style.setProperty('-webkit-app-region', 'no-drag', 'important')
    if (htmlEl.matches(INTERACTIVE_SELECTOR) || htmlEl.closest(INTERACTIVE_SELECTOR)) {
      htmlEl.style.setProperty('pointer-events', 'auto', 'important')
    }
  })
}

export const vNoDrag = {
  mounted(el: HTMLElement): void {
    if (activeInstances === 0) {
      disableTitlebarDrag()
    }
    activeInstances++

    applyNoDrag(el)

    // 使用节流的 MutationObserver，避免高频触发
    let throttled = false
    const observer = new MutationObserver(() => {
      if (throttled) return
      throttled = true
      requestAnimationFrame(() => {
        applyNoDrag(el)
        throttled = false
      })
    })
    observer.observe(el, { childList: true, subtree: true })
    ;(el as any).__noDragObserver = observer
  },

  unmounted(el: HTMLElement): void {
    const observer = (el as any).__noDragObserver
    if (observer) {
      observer.disconnect()
      delete (el as any).__noDragObserver
    }

    activeInstances = Math.max(0, activeInstances - 1)
    if (activeInstances === 0) {
      restoreTitlebarDrag()
    }
  },
}
