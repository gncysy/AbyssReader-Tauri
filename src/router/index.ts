import { createRouter, createWebHashHistory } from 'vue-router'
import Bookshelf from '../pages/Bookshelf.vue'
import Search from '../pages/Search.vue'
import Explore from '../pages/Explore.vue'
import RssSources from '../pages/RssSources.vue'
import RssArticles from '../pages/RssArticles.vue'
import RssReader from '../pages/RssReader.vue'
import Settings from '../pages/Settings.vue'
import SourceManager from '../pages/SourceManager.vue'
import Appearance from '../pages/settings/Appearance.vue'
import Reading from '../pages/settings/Reading.vue'
import Data from '../pages/settings/Data.vue'
import WebDAV from '../pages/settings/WebDAV.vue'
import About from '../pages/settings/About.vue'
import ReplaceRules from '../pages/settings/ReplaceRules.vue'
import Network from '../pages/settings/Network.vue'
import TxtTocRule from '../pages/settings/TxtTocRule.vue'
import DictRule from '../pages/settings/DictRule.vue'

const routes = [
  { path: '/', redirect: '/bookshelf' },
  { path: '/bookshelf', name: 'bookshelf', component: Bookshelf },
  { path: '/search', name: 'search', component: Search },
  { path: '/explore', name: 'explore', component: Explore },
  { path: '/rss', name: 'rss', component: RssSources },
  { path: '/rss/articles', name: 'rss-articles', component: RssArticles },
  { path: '/rss/read', name: 'rss-read', component: RssReader },
  { path: '/sources', name: 'sources', component: SourceManager },
  { path: '/settings', name: 'settings', component: Settings },
  { path: '/settings/appearance', name: 'appearance', component: Appearance },
  { path: '/settings/reading', name: 'reading', component: Reading },
  { path: '/settings/data', name: 'data', component: Data },
  { path: '/settings/webdav', name: 'webdav', component: WebDAV },
  { path: '/settings/replaceRules', name: 'replaceRules', component: ReplaceRules },
  { path: '/settings/txtTocRule', name: 'txtTocRule', component: TxtTocRule },
  { path: '/settings/dictRule', name: 'dictRule', component: DictRule },
  { path: '/settings/network', name: 'network', component: Network },
  { path: '/settings/about', name: 'about', component: About },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
