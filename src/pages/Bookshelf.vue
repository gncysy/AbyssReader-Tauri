<template>
  <div class="bookshelf-page" @click="hideContextMenu" @contextmenu.prevent>
    <header class="page-header">
      <div>
        <h1 class="page-title">书架</h1>
        <p class="page-subtitle">{{ bookshelfStore.filteredBooks.length }} 本书</p>
      </div>
      <div class="header-actions">
        <input v-model="searchText" type="text" placeholder="搜索书名..." class="input-search" autocomplete="off" name="bookshelf-search" id="bookshelf-search" />
        <button class="btn-secondary" @click="showAddUrlModal = true">添加网址</button>
        <button class="btn-secondary" @click="triggerImport">导入 TXT</button>
        <button class="btn-secondary" @click="refreshBooks">刷新</button>
      </div>
    </header>

    <div class="group-tabs">
      <button
        v-for="group in displayGroups"
        :key="group.groupId"
        class="group-tab"
        :class="{ active: bookshelfStore.activeGroup === group.groupId }"
        @click="switchGroup(group.groupId)"
        @contextmenu.prevent.stop="editGroupMenu(group)"
      >
        {{ group.groupName }}
      </button>
      <button class="group-tab group-tab-add" @click="addGroup" title="添加分组">+</button>
    </div>

    <input ref="fileInput" type="file" accept=".txt" class="hidden" name="txt-import" id="txt-import" @change="onImport" />

    <n-modal v-model:show="showAddUrlModal" preset="dialog" title="添加网址" positive-text="添加" @positive-click="addUrlBook">
      <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0">
        <div><label>书籍链接</label><n-input v-model:value="addUrl" placeholder="输入书籍详情页或目录页链接..." /></div>
        <div><label>选择书源</label><CustomDropdown v-model="addUrlSourceIndex" :options="addUrlSourceOptions" placeholder="选择书源..." /></div>
      </div>
    </n-modal>

    <n-modal v-model:show="showGroupDialog" preset="dialog" :title="editingGroup ? '编辑分组' : '添加分组'" positive-text="保存" @positive-click="saveGroup">
      <div class="dialog-form">
        <div class="form-group"><label>名称</label><n-input v-model:value="groupForm.groupName" placeholder="分组名称" /></div>
        <div v-if="editingGroup" style="margin-top:8px">
          <button class="btn-danger" style="padding:4px 12px;font-size:12px" @click="deleteGroup(editingGroup)">删除分组</button>
        </div>
      </div>
    </n-modal>

    <div v-if="bookshelfStore.loading" class="books-grid">
      <div v-for="i in 8" :key="i" class="book-card-skeleton">
        <div class="skeleton skeleton-cover"></div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-author"></div>
      </div>
    </div>

    <div v-else-if="bookshelfStore.filteredBooks.length > 0" class="books-grid">
      <div
        v-for="(book, idx) in bookshelfStore.filteredBooks"
        :key="book.bookUrl || idx"
        class="book-card"
        @click="openBook(idx)"
        @contextmenu.prevent.stop="bookContextMenu(book, $event, ($event.currentTarget as HTMLElement))"
      >
        <div class="book-cover">
          <img v-if="getCoverSrc(book) && !(book as any)._coverFailed" :src="getCoverSrc(book)" loading="lazy" @error="() => (book as any)._coverFailed = true" @load="(e: Event) => onCoverLoaded(book, e)" />
          <div v-if="!getCoverSrc(book) || (book as any)._coverFailed" class="cover-placeholder">
            <div class="cover-overlay"><div class="cover-title">{{ book.name || '未命名' }}</div><div class="cover-author">{{ book.author || '佚名' }}</div></div>
          </div>
        </div>
        <div class="book-info"><h4>{{ book.name || '未命名' }}</h4><p>{{ book.author || '佚名' }}</p></div>
      </div>
    </div>

    <div v-else class="empty-state">
      <h3>书架空空如也</h3>
      <p>导入 TXT、添加网址或搜索添加书籍</p>
      <div style="display:flex;gap:12px;margin-top:16px">
        <button class="btn-primary" @click="triggerImport">导入 TXT</button>
        <button class="btn-primary" @click="showAddUrlModal = true">添加网址</button>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="context-fade">
        <div v-if="contextMenu.visible" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop>
          <div class="context-menu-item" @click="moveBookToGroup(contextMenu.book, 0)">移至 未分组</div>
          <div v-for="g in customGroups" :key="g.groupId" class="context-menu-item" @click="moveBookToGroup(contextMenu.book, g.groupId)">移至 {{ g.groupName }}</div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useMessage, NModal, NInput } from 'naive-ui'
import { useBookshelfStore } from '@/store'
import { store, reader as readerApi } from '@/api'
import { invoke } from '@tauri-apps/api/core'
import CustomDropdown from '@/components/CustomDropdown.vue'
import type { BookSource, Book } from '@shared/types'

const message = useMessage()
const bookshelfStore = useBookshelfStore()
const sources = ref<BookSource[]>([])
const searchText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const showAddUrlModal = ref(false)
const addUrl = ref('')
const addUrlSourceIndex = ref(0)
const coverCache = ref<Record<string, string>>({})

const groups = ref<any[]>([])
const showGroupDialog = ref(false)
const editingGroup = ref<any>(null)
const groupForm = ref({ groupName: '' })
const contextMenu = ref({ visible: false, x: 0, y: 0, book: null as Book | null })

const displayGroups = computed(() => {
  const list = groups.value.filter((g: any) => g.show !== false)
  list.sort((a: any, b: any) => a.order - b.order)
  return list
})
const customGroups = computed(() => groups.value.filter((g: any) => g.groupId > 0 && g.show !== false))

const addUrlSourceOptions = computed(() =>
  (Array.isArray(sources.value) ? sources.value : []).map((s: BookSource, i: number) => ({
    label: s.bookSourceName || '未命名', value: i
  }))
)

watch(searchText, (val) => bookshelfStore.setFilter(val))

async function loadSources() { try { sources.value = (await store.get('bookSource')) || [] } catch { sources.value = [] } }
async function loadGroups() { try { groups.value = (await store.get('bookGroup')) || [] } catch { groups.value = [] } }

function switchGroup(groupId: number) { bookshelfStore.setActiveGroup(groupId) }
function addGroup() { editingGroup.value = null; groupForm.value = { groupName: '' }; showGroupDialog.value = true }
function editGroupMenu(group: any) {
  if (group.groupId < 0) return
  editingGroup.value = group; groupForm.value = { groupName: group.groupName }; showGroupDialog.value = true
}

async function saveGroup() {
  if (!groupForm.value.groupName.trim()) { message.warning('名称不能为空'); return }
  const list = [...groups.value]
  if (editingGroup.value) {
    const idx = list.findIndex((g: any) => g.groupId === editingGroup.value.groupId)
    if (idx !== -1) list[idx] = { ...editingGroup.value, ...groupForm.value }
  } else {
    const maxId = list.reduce((max, g) => Math.max(max, g.groupId || 0), 0)
    list.push({ groupId: maxId + 1, groupName: groupForm.value.groupName, order: list.length, show: true, bookSort: -1, enableRefresh: true })
  }
  await store.set('bookGroup', list); await loadGroups(); showGroupDialog.value = false; message.success('已保存')
}

async function deleteGroup(group: any) {
  groups.value = groups.value.filter((g: any) => g.groupId !== group.groupId)
  await store.set('bookGroup', groups.value)
  if (bookshelfStore.activeGroup === group.groupId) bookshelfStore.setActiveGroup(-1)
  showGroupDialog.value = false; message.success('已删除')
}

function bookContextMenu(book: Book, event: MouseEvent, el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  contextMenu.value = {
    visible: true,
    x: rect.left + rect.width / 2,
    y: rect.bottom - 4,
    book
  }
}

async function moveBookToGroup(book: Book | null, groupId: number) {
  contextMenu.value.visible = false
  if (!book) return
  await bookshelfStore.updateBook(book.bookUrl, { group: groupId })
}

function hideContextMenu() { contextMenu.value.visible = false }

function getCoverSrc(book: Book): string | null {
  if (!book.coverUrl) return null
  if (coverCache.value[book.coverUrl]) return coverCache.value[book.coverUrl]
  loadCoverFromCache(book); return book.coverUrl
}

async function loadCoverFromCache(book: Book) {
  if (!book.coverUrl) return
  try { const cached = await invoke('cache_get_cover', { url: book.coverUrl }); if (cached) coverCache.value = { ...coverCache.value, [book.coverUrl!]: cached as string } } catch {}
}

async function onCoverLoaded(book: Book, event: Event) {
  const img = event.target as HTMLImageElement
  if (!img || !book.coverUrl || coverCache.value[book.coverUrl]) return
  try {
    const canvas = document.createElement('canvas'); canvas.width = Math.min(img.naturalWidth, 400); canvas.height = Math.round(img.naturalHeight * (canvas.width / img.naturalWidth))
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height); const dataUrl = canvas.toDataURL('image/webp', 0.7)
    await invoke('cache_put_cover', { url: book.coverUrl, dataBase64: dataUrl }); coverCache.value = { ...coverCache.value, [book.coverUrl]: dataUrl }
  } catch {}
}

async function refreshBooks() { await bookshelfStore.loadBooks(); await loadSources(); message.success('已刷新') }
function triggerImport() { fileInput.value?.click() }

async function onImport(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  try {
    const text = await file.text(); if (!text?.trim()) { message.warning('文件内容为空'); return }
    const name = file.name.replace(/\.txt$/i, ''); const result: any = await readerApi.importTxt(name, text)
    await bookshelfStore.loadBooks(); message.success(`已导入《${result.name || name}》`)
  } catch (err: any) { message.error('导入失败: ' + err.message) } finally { input.value = '' }
}

async function addUrlBook() {
  if (!addUrl.value.trim()) { message.warning('请输入书籍链接'); return }
  const arr = Array.isArray(sources.value) ? sources.value : []; const source = arr[addUrlSourceIndex.value]; if (!source) { message.error('请选择书源'); return }
  try {
    const { getBookInfo } = await import('../../engine/business/book-info.js'); const result = await getBookInfo(source, addUrl.value.trim())
    if (!result || !result.name) throw new Error('获取失败')
    const newBook = { ...result, origin: source.bookSourceUrl || '', originName: source.bookSourceName || source.name || '' }
    const books = (await store.get('bookshelf')) || []; const bookList = Array.isArray(books) ? books : []
    bookList.unshift(newBook); await store.set('bookshelf', bookList); await bookshelfStore.loadBooks()
    message.success(`已添加《${newBook.name}》到书架`); showAddUrlModal.value = false; addUrl.value = ''
  } catch (err: any) { message.error('添加失败: ' + err.message) }
}

function openBook(index: number) {
  const books = bookshelfStore.filteredBooks; const book = Array.isArray(books) ? books[index] : null
  if (!book) return
  const arr = Array.isArray(sources.value) ? sources.value : []; const source = arr.find(s => (s.bookSourceName || s.name) === book.originName)
  bookshelfStore.openDetail(book, source || null)
}

onMounted(() => { Promise.all([bookshelfStore.loadBooks(), loadSources(), loadGroups()]) })
onUnmounted(() => { hideContextMenu() })
</script>

<style scoped>
.bookshelf-page { position: relative; z-index: 1; }
.header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.input-search { width: 200px; }
.group-tabs { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
.group-tab { padding: 5px 14px; font-size: 13px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; transition: color 0.2s, border-color 0.2s, background 0.2s; }
.group-tab:hover { color: var(--text-primary); border-color: var(--brand); }
.group-tab.active { color: var(--brand); border-color: var(--brand); background: var(--bg-active); }
.group-tab-add { font-size: 16px; padding: 3px 12px; }
.dialog-form { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
.context-menu { position: fixed; z-index: 2000; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); padding: 4px 0; min-width: 130px; transform: translateX(-50%); }
.context-menu-item { padding: 8px 16px; font-size: 13px; color: var(--text-secondary); cursor: pointer; transition: background 0.12s, color 0.12s; }
.context-menu-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.context-fade-enter-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.context-fade-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.context-fade-enter-from { opacity: 0; transform: translateX(-50%) translateY(6px) scale(0.96); }
.context-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.96); }
</style>
