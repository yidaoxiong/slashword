import { useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { UserBook } from '../types'

/**
 * 自制词库的内容管理：挑出不要的词条删掉。
 *
 * 只做删除 —— 加词和改释义用 Excel 改完重新导入更顺手，
 * 在手机上一个个填反而难用。
 */
export function BookEditor({ book, onClose }: { book: UserBook; onClose: () => void }) {
  const { removeWordsFromBook, undoRemoveWords, lastRemovedWords } = useAppStore()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const words = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return book.words
    return book.words.filter(
      (w) =>
        w.word.toLowerCase().includes(q) || (w.cn ?? '').toLowerCase().includes(q),
    )
  }, [book.words, query])

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allPicked = words.length > 0 && words.every((w) => picked.has(w.id))

  const doRemove = async () => {
    setBusy(true)
    await removeWordsFromBook(book.id, [...picked])
    setBusy(false)
    setPicked(new Set())
    setConfirming(false)
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-md sm:max-w-lg px-5 py-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[16px] font-medium text-neutral-900">
            {book.name}
          </div>
          <div className="mt-0.5 text-[12px] text-neutral-400">
            共 {book.words.length} 词，删掉不想要的
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] text-neutral-400"
        >
          完成
        </button>
      </div>

      {lastRemovedWords?.bookId === book.id && (
        <button
          type="button"
          onClick={() => void undoRemoveWords()}
          className="mt-3 h-10 w-full rounded-lg bg-brand-50 text-[13px] text-brand-600 ring-1 ring-brand-200"
        >
          撤销上一次删除（恢复成 {lastRemovedWords.words.length} 词）
        </button>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜单词或中文"
        className="mt-3 h-10 w-full rounded-lg bg-white px-3 text-[14px] ring-1 ring-black/5 outline-none focus:ring-brand-400"
      />

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setPicked(allPicked ? new Set() : new Set(words.map((w) => w.id)))
          }
          className="text-[12px] text-neutral-500"
        >
          {allPicked ? '取消全选' : `全选当前 ${words.length} 个`}
        </button>
        <span className="text-[12px] text-neutral-400">已选 {picked.size}</span>
      </div>

      <div className="mt-2 divide-y divide-neutral-100 rounded-card bg-white ring-1 ring-black/5">
        {words.map((w) => {
          const on = picked.has(w.id)
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => toggle(w.id)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                on ? 'bg-bad-soft' : ''
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  on ? 'border-[#a32d2d] bg-[#a32d2d] text-white' : 'border-neutral-300'
                }`}
              >
                {on && <span className="text-[10px] leading-none">✓</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-neutral-900">
                  {w.word}
                </span>
                <span className="block truncate text-[11px] text-neutral-400">
                  {w.cn}
                </span>
              </span>
            </button>
          )
        })}
        {words.length === 0 && (
          <div className="px-3 py-6 text-center text-[13px] text-neutral-300">
            没有匹配的词
          </div>
        )}
      </div>

      {picked.size > 0 && (
        <div className="mt-4">
          {confirming ? (
            <div className="rounded-card bg-bad-soft p-3">
              <div className="text-[13px] leading-relaxed text-[#a32d2d]">
                删掉这 {picked.size} 个词？已经背过的卡片会一并清掉，
                删完可以在上面点「撤销」恢复。
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doRemove()}
                  className="h-10 flex-1 rounded-lg bg-[#a32d2d] text-[13px] text-white disabled:opacity-50"
                >
                  {busy ? '删除中…' : `删掉 ${picked.size} 个`}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-10 flex-1 rounded-lg bg-white text-[13px] text-neutral-600 ring-1 ring-black/5"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="h-11 w-full rounded-xl bg-[#a32d2d] text-[14px] text-white"
            >
              删掉选中的 {picked.size} 个词
            </button>
          )}
        </div>
      )}

      <div className="mt-4 text-[11px] leading-relaxed text-neutral-300">
        删完记得在账号页同步一次，别的设备才会跟着更新
      </div>
    </div>
  )
}
