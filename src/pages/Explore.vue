<template>
  <div class="explore-page">
    <header class="page-header">
      <h1 class="page-title">发现</h1>
      <p class="page-subtitle">浏览书源分类</p>
    </header>

    <div style="margin-bottom:20px">
      <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center">
        <CustomDropdown v-model="selectedIndex" :options="exploreSourceOptions" placeholder="选择书源..." @update:modelValue="onSourceChange" style="min-width:200px" />
        <input v-model="sourceFilter" type="text" placeholder="搜索书源..." class="input-search" style="width:180px" name="explore-source-filter" id="explore-source-filter" />
      </div>

      <div v-if="categories.length > 0" style="display:flex;flex-wrap:wrap;gap:4px">
        <button
          v-for="cat in categories"
          :key="cat.title"
          class="category-tag"
          :class="{ active: currentCategory?.url === cat.url }"
          @click="exploreCategory(cat)"
        >{{ cat.title }}</button>
      </div>
    </div>

    <div v-if="loading" class="books-grid">
      <div v-for="i in 12" :key="i" class="book-card-skeleton"><div class="skeleton skeleton-cover"></div></div>
    </div>

    <div v-else-if="books.length > 0" class="books-grid">
      <div v-for="book in books" :key="book.bookUrl" class="book-card" @click="addToShelf(book)">
        <div class="book-cover">
          <img v-if="book.coverUrl" :src="book.coverUrl" loading="lazy" @error="handleCoverError" />
          <div v-else class="cover-placeholder">
            <div class="cover-overlay"><div class="cover-title">{{ book.name || '未命名' }}</div><div class="cover-author">{{ book.author || '佚名' }}</div></div>
          </div>
        </div>
        <div class="book-info"><h4>{{ book.name || '未命名' }}</h4><p>{{ book.author || '佚名' }}</p></div>
      </div>
    </div>

    <div v-else-if="selectedIndex >= 0 && !loading" class="empty-state">
      <h3>{{ categories.length === 0 ? '该书源暂无分类' : '选择分类开始浏览' }}</h3>
    </div>

    <div v-else class="empty-state"><h3>选择书源开始发现</h3></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { store, engine } from '@/api'
import CustomDropdown from '@/components/CustomDropdown.vue'
import type { Book, BookSource } from '@shared/types'

const message = useMessage()
const sources = ref<BookSource[]>([])
const selectedIndex = ref(-1)
const sourceFilter = ref('')
const categories = ref<{ title: string; url: string }[]>([])
const currentCategory = ref<{ title: string; url: string } | null>(null)
const books = ref<Book[]>([])
const loading = ref(false)
const currentPage = ref(1)

const filteredExploreSources = computed(() => {
  const result: { source: BookSource; originalIndex: number }[] = []
  const filter = sourceFilter.value.trim().toLowerCase()
  const arr = Array.isArray(sources.value) ? sources.value : []
  arr.forEach((source, i) => {
    if (!source.exploreUrl?.trim()) return
    if (filter && !(source.bookSourceName || source.name || '').toLowerCase().includes(filter)) return
    result.push({ source, originalIndex: i })
  })
  return result
})

const exploreSourceOptions = computed(() => {
  const opts = [{ label: '选择书源...', value: -1 }]
  for (const item of filteredExploreSources.value) {
    opts.push({ label: item.source.bookSourceName || item.source.name, value: item.originalIndex })
  }
  return opts
})

async function loadSources() {
  try {
    const raw = await store.get('bookSource')
    sources.value = Array.isArray(raw) ? raw : []
    const firstIdx = filteredExploreSources.value[0]
    if (firstIdx) { selectedIndex.value = firstIdx.originalIndex; await loadCategories() }
  } catch (err: any) { message.error('加载书源失败: ' + err.message) }
}

async function loadCategories() {
  categories.value = []; books.value = []; currentCategory.value = null
  if (selectedIndex.value < 0) return
  try {
    const result: any = await engine.getExploreCategories(selectedIndex.value)
    if (result && Array.isArray(result) && result.length > 0) {
      categories.value = result
      if (categories.value.length > 0) await exploreCategory(categories.value[0])
    }
  } catch (err: any) { console.error('[Explore] 加载分类失败:', err) }
}

async function onSourceChange(val: number) { selectedIndex.value = val; await loadCategories() }

async function exploreCategory(cat: { title: string; url: string }) {
  if (selectedIndex.value < 0) return
  currentCategory.value = cat; loading.value = true; books.value = []
  try {
    const result: any = await engine.getExploreBooks(sources.value[selectedIndex.value], cat.url, currentPage.value)
    books.value = (result?.success && Array.isArray(result.data)) ? result.data : (Array.isArray(result) ? result : [])
  } catch { books.value = [] }
  finally { loading.value = false }
}

async function addToShelf(book: Book) {
  if (selectedIndex.value < 0) return
  const source = sources.value[selectedIndex.value]
  if (!book.name || !book.bookUrl) { message.warning('书籍信息不完整'); return }
  const all = (await store.get('bookshelf')) || []
  const bookList = Array.isArray(all) ? all : []
  if (bookList.find((b: Book) => b.bookUrl === book.bookUrl)) { message.warning('该书已在书架中'); return }
  bookList.unshift({
    ...book,
    origin: source.bookSourceUrl || '',
    originName: source.bookSourceName || source.name || '',
  })
  await store.set('bookshelf', bookList)
  message.success(`已添加《${book.name}》到书架`)
}

function handleCoverError(event: Event) { (event.target as HTMLImageElement).style.display = 'none' }

onMounted(() => { loadSources() })
</script>

<style scoped>
.explore-page { position: relative; z-index: 1; }
.category-tag {
  padding: 7px 16px; font-size: 13px; color: var(--text-secondary);
  background: transparent; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; font-weight: 500;
  transition: color 0.2s var(--ease-out), border-color 0.2s var(--ease-out);
}
.category-tag:hover { color: var(--text-primary); }
.category-tag.active { color: var(--brand); border-bottom-color: var(--brand); }
</style>
