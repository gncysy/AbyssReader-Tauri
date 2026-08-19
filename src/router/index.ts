import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/bookshelf' },
  { path: '/bookshelf', name: 'bookshelf', component: () => import('@/views/bookshelf/index.vue') },
  { path: '/search', name: 'search', component: () => import('@/views/search/index.vue') },
  { path: '/explore', name: 'explore', component: () => import('@/views/explore/index.vue') },
  { path: '/rss', name: 'rss', component: () => import('@/views/rss/index.vue') },
  { path: '/rss/browser', name: 'rss-browser', component: () => import('@/views/rss/browser.vue') },
  { path: '/rss/articles', name: 'rss-articles', component: () => import('@/views/rss/articles.vue') },
  { path: '/rss/read', name: 'rss-read', component: () => import('@/views/rss/reader.vue') },
  { path: '/rss/edit', name: 'rss-edit', component: () => import('@/views/rss/edit.vue') },
  { path: '/rss/debug', name: 'rss-debug', component: () => import('@/views/rss/debug.vue') },
  { path: '/sources', name: 'sources', component: () => import('@/views/sources/index.vue') },
  { path: '/settings', name: 'settings', component: () => import('@/views/settings/index.vue') },
  { path: '/settings/appearance', name: 'appearance', component: () => import('@/views/settings/appearance.vue') },
  { path: '/settings/data', name: 'data', component: () => import('@/views/settings/data.vue') },
  { path: '/settings/webdav', name: 'webdav', component: () => import('@/views/settings/webdav.vue') },
  { path: '/settings/replaceRules', name: 'replaceRules', component: () => import('@/views/settings/replace-rules.vue') },
  { path: '/settings/txtTocRule', name: 'txtTocRule', component: () => import('@/views/settings/txt-toc-rule.vue') },
  { path: '/settings/dictRule', name: 'dictRule', component: () => import('@/views/settings/dict-rule.vue') },
  { path: '/settings/network', name: 'network', component: () => import('@/views/settings/network.vue') },
  { path: '/settings/diagnostics', name: 'diagnostics', component: () => import('@/views/settings/diagnostics.vue') },
  { path: '/settings/about', name: 'about', component: () => import('@/views/settings/about.vue') },
]

export const router = createRouter({ history: createWebHashHistory(), routes })
