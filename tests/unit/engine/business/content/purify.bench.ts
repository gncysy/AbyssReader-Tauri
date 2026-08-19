// ============================================
// purify.ts 性能基准测试
// ============================================

import { bench, describe } from 'vitest'
import { reSegment } from '@engine/business/content/purify.js'

describe('reSegment 性能测试', () => {
  // 生成 1000 段中文文本
  const generateText = (paragraphs: number): string => {
    const sentences = [
      '今天天气真好。',
      '阳光明媚，适合出游。',
      '他说：“你好，世界！”',
      '《红楼梦》是中国古典文学的瑰宝。',
      '他沉默了……然后转身离去。',
      '太棒了！！今天真开心！！',
      '突然，他停了下来。',
      '这是一个测试段落。',
      '包含省略号……还有破折号——',
      '最后一句结束了。',
    ]
    const result: string[] = []
    for (let i = 0; i < paragraphs; i++) {
      const idx = i % sentences.length
      result.push(sentences[idx])
    }
    return result.join('')
  }

  const shortText = generateText(10)
  const mediumText = generateText(100)
  const longText = generateText(500)

  bench('短文本 (10句)', () => {
    reSegment(shortText, '')
  })

  bench('中等文本 (100句)', () => {
    reSegment(mediumText, '')
  })

  bench('长文本 (500句)', () => {
    reSegment(longText, '')
  })
})
