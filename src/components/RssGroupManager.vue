<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    title="分组管理"
    style="max-width:480px"
    :bordered="false"
  >
    <div class="group-manager">
      <!-- 添加分组 -->
      <div class="group-add-row">
        <input
          v-model="newGroupName"
          type="text"
          class="input-search"
          placeholder="新分组名称"
          style="flex:1"
          @keyup.enter="addGroup"
        />
        <button class="btn-primary" :disabled="!newGroupName.trim()" @click="addGroup">添加</button>
      </div>

      <!-- 分组列表 -->
      <div v-if="groups.length > 0" class="group-list">
        <div
          v-for="group in groups"
          :key="group"
          class="group-item"
        >
          <span class="group-name">{{ group }}</span>
          <span class="group-count">{{ getGroupCount(group) }} 个源</span>
          <div class="group-actions">
            <button class="btn-secondary" style="padding:2px 10px;font-size:11px" @click="startRename(group)">重命名</button>
            <button class="btn-danger" style="padding:2px 10px;font-size:11px" @click="deleteGroup(group)">删除</button>
          </div>
        </div>
      </div>

      <div v-else class="group-empty">
        <p style="color:var(--text-muted)">暂无分组</p>
      </div>

      <!-- 重命名弹窗 -->
      <n-modal
        v-model:show="showRename"
        preset="dialog"
        title="重命名分组"
        positive-text="保存"
        negative-text="取消"
        @positive-click="confirmRename"
      >
        <n-input v-model:value="renameValue" placeholder="新名称" />
      </n-modal>
    </div>

    <template #footer>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-secondary" @click="close">关闭</button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMessage, NModal, NInput } from 'naive-ui'
import { store } from '@/api'
import type { RssSource } from '@shared/types'

const message = useMessage()

const emit = defineEmits<{
  (e: 'change'): void
}>()

const visible = ref(false)
const groups = ref<string[]>([])
const newGroupName = ref('')
const showRename = ref(false)
const renameOld = ref('')
const renameValue = ref('')

let allSources: RssSource[] = []

// ─── 打开 ──────────────────────────────────────────────────
function open() {
  visible.value = true
  loadGroups()
}

function close() {
  visible.value = false
}

// ─── 加载分组 ──────────────────────────────────────────────────
async function loadGroups() {
  try {
    const data = await store.get('rssSources')
    allSources = Array.isArray(data) ? data : []
    const groupSet = new Set<string>()
    for (const s of allSources) {
      if (s.sourceGroup) groupSet.add(s.sourceGroup)
    }
    groups.value = Array.from(groupSet).sort()
  } catch {
    groups.value = []
  }
}

function getGroupCount(group: string): number {
  return allSources.filter(s => s.sourceGroup === group).length
}

// ─── 添加分组 ──────────────────────────────────────────────────
async function addGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  if (groups.value.includes(name)) {
    message.warning('分组已存在')
    return
  }
  groups.value.push(name)
  groups.value.sort()
  newGroupName.value = ''
  await saveGroups()
  message.success(`已添加分组: ${name}`)
  emit('change')
}

// ─── 重命名 ──────────────────────────────────────────────────
function startRename(oldName: string) {
  renameOld.value = oldName
  renameValue.value = oldName
  showRename.value = true
}

async function confirmRename() {
  const newName = renameValue.value.trim()
  if (!newName) {
    message.warning('名称不能为空')
    return
  }
  if (newName === renameOld.value) {
    showRename.value = false
    return
  }
  if (groups.value.includes(newName)) {
    message.warning('分组已存在')
    return
  }

  // 更新所有订阅源的分组
  let count = 0
  for (const s of allSources) {
    if (s.sourceGroup === renameOld.value) {
      s.sourceGroup = newName
      count++
    }
  }

  // 更新分组列表
  const idx = groups.value.indexOf(renameOld.value)
  if (idx !== -1) {
    groups.value[idx] = newName
    groups.value.sort()
  }

  await saveGroups()
  showRename.value = false
  message.success(`已重命名，更新了 ${count} 个订阅源`)
  emit('change')
}

// ─── 删除分组 ──────────────────────────────────────────────────
async function deleteGroup(group: string) {
  const count = getGroupCount(group)
  if (count === 0) {
    groups.value = groups.value.filter(g => g !== group)
    await saveGroups()
    message.success('已删除空分组')
    emit('change')
    return
  }

  if (!confirm(`删除分组「${group}」将移除 ${count} 个订阅源的分组，确定？`)) return

  // 清空订阅源的分组
  for (const s of allSources) {
    if (s.sourceGroup === group) {
      s.sourceGroup = null
    }
  }

  groups.value = groups.value.filter(g => g !== group)
  await saveGroups()
  message.success(`已删除分组，清空了 ${count} 个订阅源的分组`)
  emit('change')
}

// ─── 保存 ──────────────────────────────────────────────────
async function saveGroups() {
  await store.set('rssSources', allSources)
}

// ─── 暴露 ──────────────────────────────────────────────────
defineExpose({ open, close })
</script>

<style scoped>
.group-manager {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 0;
}

.group-add-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}
.group-item:hover {
  background: var(--bg-hover);
}

.group-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
}

.group-count {
  font-size: 12px;
  color: var(--text-muted);
}

.group-actions {
  display: flex;
  gap: 4px;
}

.group-empty {
  padding: 20px;
  text-align: center;
}
</style>
