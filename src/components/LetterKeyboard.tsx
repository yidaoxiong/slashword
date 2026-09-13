import { EXTRA_KEYS } from '../core/lang'
import type { Lang } from '../types'

interface Props {
  onKey: (ch: string) => void
  onBackspace: () => void
  onSubmit: () => void
  disabled?: boolean
  /** 桌面端默认收起：有物理键盘时屏幕键盘纯占地方 */
  visible?: boolean
  /** 词库语言，决定要不要多一行特殊字符（西语的 ñ 和重音） */
  lang?: Lang
}

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

export function LetterKeyboard({
  onKey,
  onBackspace,
  onSubmit,
  disabled,
  visible = true,
  lang = 'en',
}: Props) {
  const extra = EXTRA_KEYS[lang] ?? []
  if (!visible) {
    return (
      <div className="mt-5 rounded-xl bg-neutral-50 px-4 py-3">
        <div className="text-center text-[12px] text-neutral-400">
          直接用键盘拼写，回车提交
        </div>
        {/* 收起也保留特殊字符键：Mac 上打 ñ 要 Option+N 再按 n，
            孩子根本记不住，只能靠点。字母用物理键盘敲，特殊字符用点的最省事 */}
        {extra.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {extra.map((ch) => (
              <button
                key={ch}
                type="button"
                disabled={disabled}
                onClick={() => onKey(ch)}
                className="h-10 w-10 rounded-lg bg-white text-[15px] font-medium text-neutral-800 shadow-sm ring-1 ring-black/8 active:bg-brand-50 disabled:opacity-40"
              >
                {ch}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="w-full select-none">
      {ROWS.map((row, ri) => (
        <div key={ri} className="mb-2 flex justify-center gap-1.5">
          {ri === 2 && (
            <button
              type="button"
              disabled={disabled}
              onClick={onBackspace}
              className="h-11 w-9 rounded-lg bg-white text-[13px] font-medium text-neutral-600 shadow-sm ring-1 ring-black/8 active:bg-neutral-100 disabled:opacity-40"
            >
              ⌫
            </button>
          )}
          {row.split('').map((ch) => (
            <button
              key={ch}
              type="button"
              disabled={disabled}
              onClick={() => onKey(ch)}
              className="h-11 flex-1 rounded-lg bg-white text-[15px] font-medium text-neutral-800 shadow-sm ring-1 ring-black/8 active:bg-brand-50 disabled:opacity-40"
            >
              {ch}
            </button>
          ))}
          {ri === 2 && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSubmit}
              className="h-11 w-12 rounded-lg bg-brand-500 text-[13px] font-medium text-white shadow-sm active:bg-brand-600 disabled:opacity-40"
            >
              确定
            </button>
          )}
        </div>
      ))}
      {extra.length > 0 && (
        <div className="mb-2 flex flex-wrap justify-center gap-1.5">
          {extra.map((ch) => (
            <button
              key={ch}
              type="button"
              disabled={disabled}
              onClick={() => onKey(ch)}
              className="h-10 w-10 rounded-lg bg-neutral-100 text-[15px] font-medium text-neutral-800 shadow-sm ring-1 ring-black/8 active:bg-brand-50 disabled:opacity-40"
            >
              {ch}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onKey(' ')}
          className="h-10 w-24 rounded-lg bg-white text-[12px] text-neutral-600 shadow-sm ring-1 ring-black/8 active:bg-neutral-100 disabled:opacity-40"
        >
          空格
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onKey('-')}
          className="h-10 w-16 rounded-lg bg-white text-[12px] text-neutral-600 shadow-sm ring-1 ring-black/8 active:bg-neutral-100 disabled:opacity-40"
        >
          连字符
        </button>
      </div>
    </div>
  )
}
