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

// Tauri API 诊断
setTimeout(async () => {
  console.log('Tauri 诊断开始...')
  try {
    const core = await import('@tauri-apps/api/core')
    console.log('core 模块:', Object.keys(core))
    const sources = await core.invoke('get_book_sources')
    console.log('get_book_sources 成功:', sources)
  } catch (e) {
    console.error('Tauri 诊断失败:', e)
  }
}, 1000)

console.log('墨阅 启动成功')
