import { useEffect } from 'react'

/**
 * 物理键盘输入。
 * 笔记本自带键盘、PC 键盘、iPad 外接键盘走的是同一个 keydown 事件，
 * 所以不用区分设备，统一监听即可。屏幕上的虚拟键盘仍然保留（触屏时用）。
 */
export function useTyping(params: {
  enabled: boolean
  onChar: (ch: string) => void
  onBackspace: () => void
  onSubmit: () => void
}) {
  const { enabled, onChar, onBackspace, onSubmit } = params

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return
      }

      if (e.key === 'Backspace') {
        e.preventDefault()
        onBackspace()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onSubmit()
        return
      }
      if (e.key === 'Escape') {
        return
      }
      // 单词可能出现的字符：字母、空格、连字符、撇号
      if (e.key.length === 1 && /[a-zA-Z '\-]/.test(e.key)) {
        e.preventDefault()
        onChar(e.key.toLowerCase())
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onChar, onBackspace, onSubmit])
}
