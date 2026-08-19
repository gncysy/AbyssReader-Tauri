// ============================================
// RSS 下载检测类型（纯类型定义，零环境依赖）
// 具体实现已迁移到 src/services/download-import.ts
// ============================================

export interface DownloadInfo {
  url: string
  resourceType: string
}
