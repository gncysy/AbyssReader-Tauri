<template>
  <n-modal
    v-model:show="visible"
    preset="dialog"
    :title="title"
    :positive-text="positiveText"
    :negative-text="negativeText"
    @positive-click="handleConfirm"
    @negative-click="visible = false"
    :closable="false"
    :close-on-esc="false"
    :mask-closable="false"
  >
    <p style="color:var(--text-secondary);font-size:14px;line-height:1.6;white-space:pre-wrap">{{ message }}</p>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage, NModal } from 'naive-ui'
import { executeDownloadImport } from '../../engine/business/rss-download.js'

const message = useMessage()

const visible = ref(false)
const title = ref('')
const msg = ref('')
const positiveText = ref('')
const negativeText = ref('取消')
let pendingData: any = null

function show(info: any) {
  pendingData = info
  negativeText.value = '取消'
  switch (info.resourceType) {
    case 'bookSource':
      title.value = '安装书源'
      msg.value = `检测到 ${info.count} 个书源\n来自: ${info.url}\n是否安装？`
      positiveText.value = '安装'
      break
    case 'rssSource':
      title.value = '安装订阅源'
      msg.value = `检测到 ${info.count} 个订阅源\n来自: ${info.url}\n是否安装？`
      positiveText.value = '安装'
      break
    case 'replaceRule':
      title.value = '导入替换规则'
      msg.value = `检测到替换规则\n来自: ${info.url}\n是否导入？`
      positiveText.value = '导入'
      break
    case 'txtTocRule':
      title.value = '导入目录规则'
      msg.value = `检测到 TXT 目录规则\n来自: ${info.url}\n是否导入？`
      positiveText.value = '导入'
      break
    case 'purifyRule':
      title.value = '导入净化规则'
      msg.value = `检测到净化规则\n来自: ${info.url}\n是否导入？`
      positiveText.value = '导入'
      break
    default:
      title.value = '下载完成'
      msg.value = `未识别的资源类型，已保存到下载目录:\n${info.savedPath || info.url}`
      positiveText.value = '知道了'
      negativeText.value = ''
      break
  }
  visible.value = true
}

async function handleConfirm() {
  if (!pendingData) { visible.value = false; return }
  try {
    const result = await executeDownloadImport({ url: pendingData.url, resourceType: pendingData.resourceType } as any)
    message.success(result)
  } catch (err: any) {
    message.error(err?.message || '操作失败')
  }
  visible.value = false
}

defineExpose({ show })
</script>
