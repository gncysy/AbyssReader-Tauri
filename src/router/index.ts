import { createRouter, createWebHashHistory } from 'vue-router'
import Bookshelf from '../pages/Bookshelf.vue'
import Search from '../pages/Search.vue'
import Explore from '../pages/Explore.vue'
import Market from '../pages/Market.vue'
import Settings from '../pages/Settings.vue'
import SourceManager from '../pages/SourceManager.vue'
import Appearance from '../pages/settings/Appearance.vue'
import Reading from '../pages/settings/Reading.vue'
import Data from '../pages/settings/Data.vue'
import WebDAV from '../pages/settings/WebDAV.vue'
import About from '../pages/settings/About.vue'
import ReplaceRules from '../pages/settings/ReplaceRules.vue'

const routes = [
  { path: '/', redirect: '/bookshelf' },
  { path: '/bookshelf', name: 'bookshelf', component: Bookshelf },
  { path: '/search', name: 'search', component: Search },
  { path: '/explore', name: 'explore', component: Explore },
  { path: '/market', name: 'market', component: Market },
  { path: '/sources', name: 'sources', component: SourceManager },
  { path: '/settings', name: 'settings', component: Settings },
  { path: '/settings/appearance', name: 'appearance', component: Appearance },
  { path: '/settings/reading', name: 'reading', component: Reading },
  { path: '/settings/data', name: 'data', component: Data },
  { path: '/settings/webdav', name: 'webdav', component: WebDAV },
  { path: '/settings/about', name: 'about', component: About },
  { path: '/settings/replaceRules', name: 'replaceRules', component: ReplaceRules },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
