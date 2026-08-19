import '@/services/index.js'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router/index.js'
import './styles/index.css'
import { initLoadingSpinnerAnimation } from './animations/loading-spinner.js'
import { vNoDrag } from './directives/index.js'
import { handleError } from './utils/error-handler.js'

const app = createApp(App)
app.use(createPinia())
app.use(router)

app.directive('no-drag', vNoDrag)

app.mount('#app')

document.addEventListener('contextmenu', (e) => { e.preventDefault() })

const loadingEl = document.getElementById('app-loading')
if (loadingEl) { loadingEl.classList.add('hidden'); setTimeout(() => { if (loadingEl.parentNode) loadingEl.remove() }, 600) }

initLoadingSpinnerAnimation()

window.addEventListener('unhandledrejection', (event) => {
  handleError(event.reason, {
    module: 'system',
    operation: 'unhandledRejection',
    userMessage: '系统异常，请重试或重启应用',
  })
  event.preventDefault()
})

window.addEventListener('error', (event) => {
  handleError(event.error || event.message, {
    module: 'system',
    operation: 'unhandledError',
    userMessage: '系统异常，请重试或重启应用',
  })
  event.preventDefault()
})
