<template>
  <div class="settings-page">
    <header class="page-header">
      <h1 class="page-title">设置</h1>
      <p class="page-subtitle">偏好与配置</p>
    </header>
    <div style="display:flex;flex-direction:column;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);overflow:hidden">
      <div v-for="item in menuItems" :key="item.path" class="settings-item" tabindex="0" @click="navigateTo(item.path)" @keydown.enter="navigateTo(item.path)">
        <div style="display:flex;flex-direction:column;flex:1">
          <span style="font-size:15px;font-weight:500;color:var(--text-primary)">{{ item.label }}</span>
          <span style="font-size:13px;color:var(--text-muted);margin-top:2px">{{ item.desc }}</span>
        </div>
        <span style="font-size:20px;color:var(--text-muted)">›</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const menuItems = [
  { path: '/settings/appearance', label: '外观', desc: '深色 / 浅色 / 护眼 / 跟随系统' },
  { path: '/settings/reading', label: '阅读', desc: '字体大小 / 行间距' },
  { path: '/settings/data', label: '数据', desc: '本地备份 / 恢复 / 清空 / 缓存管理' },
  { path: '/settings/webdav', label: 'WebDAV 同步', desc: '与 Legado 无缝衔接' },
  { path: '/settings/replaceRules', label: '替换规则', desc: '正则/文本替换净化正文' },
  { path: '/settings/txtTocRule', label: 'TXT 目录规则', desc: '导入 TXT 时的章节识别规则' },
  { path: '/settings/dictRule', label: '字典规则', desc: '阅读器选词查询' },
  { path: '/settings/network', label: '其他设置', desc: 'User-Agent / 网络配置' },
  { path: '/settings/about', label: '关于', desc: '版本信息' },
]

function navigateTo(path: string) { router.push(path).catch(() => {}) }
</script>

<style scoped>
.settings-page { padding: 28px 36px; max-width: 680px; }
.settings-item { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid var(--border-color); min-height: 52px; }
.settings-item:last-child { border-bottom: none; }
.settings-item:hover { background: var(--bg-hover); }
</style>
