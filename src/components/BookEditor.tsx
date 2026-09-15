import { useMemo, useState, type ReactNode } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { UserBook, WordDraft, WordEntry } from '../types'
import { EMPTY_WORD_DRAFT } from '../types'

/**
 * 自制词库的内容管理：改词条、加词条、删词条。
 *
 * 一开始只做了删除（改词用 Excel 重导更顺手），但实际用起来是：
 * 发现一个词填错了，只想就地改两个字的释义，为它重新导一遍表太重。
 */
export function BookEditor({
  book,
  onClose,
}: {
  book: UserBook
  onClose: () => void
}) {
  const {
    removeWordsFromBook,
    undoRemoveWords,
    lastRemovedWords,
    updateWordInBook,
    addWordToBook,
  } = useAppStore()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)

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

  // 表单是整个页面切过去的，不塞在小卡片里 —— 手机上塞不下
  if (form) {
    return (
      <Shell key="form">
        <WordForm
          title={form.mode === 'new' ? '新增词条' : '改词条'}
          draft={form.draft}
          error={form.error}
          busy={busy}
          units={[...new Set(book.words.map((w) => w.unit).filter(Boolean))]}
          onChange={(draft) => setForm({ ...form, draft, error: '' })}
          onCancel={() => setForm(null)}
          onSave={async () => {
            const word = form.draft.word.trim()
            const cn = form.draft.cn.trim()
            if (!word) return setForm({ ...form, error: '得填单词' })
            if (!cn)
              return setForm({
                ...form,
                error: '得填中文含义 —— 卡片上是看着中文拼单词的',
              })
            // 同一个词 + 同样的释义 = 重复。词同释义不同是多义词，允许
            const dup = book.words.find(
              (w) =>
                w.id !== form.entryId &&
                w.word.toLowerCase() === word.toLowerCase() &&
                w.cn.trim() === cn,
            )
            if (dup)
              return setForm({
                ...form,
                error: `已经有「${word}」配这个释义了，改个不同的意思再存`,
              })

            setBusy(true)
            try {
              if (form.mode === 'new') await addWordToBook(book.id, form.draft)
              else if (form.entryId)
                await updateWordInBook(book.id, form.entryId, form.draft)
              setForm(null)
            } finally {
              setBusy(false)
            }
          }}
        />
      </Shell>
    )
  }

  return (
    <Shell key="list">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[16px] font-medium text-neutral-900">
            {book.name}
          </div>
          <div className="mt-0.5 text-[12px] text-neutral-400">
            共 {book.words.length} 词 · 点词条可改，左边勾选可删
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

      <button
        type="button"
        onClick={() =>
          setForm({
            mode: 'new',
            entryId: null,
            // 单元默认填最后一条的 —— 通常是往正在学的单元里加词
            draft: {
              ...EMPTY_WORD_DRAFT,
              unit: book.words[book.words.length - 1]?.unit ?? '',
            },
            error: '',
          })
        }
        className="mt-3 h-10 w-full rounded-lg bg-brand-500 text-[13px] text-white active:bg-brand-600"
      >
        + 新增词条
      </button>

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
            <div key={w.id} className={`flex items-center ${on ? 'bg-bad-soft' : ''}`}>
              <button
                type="button"
                onClick={() => toggle(w.id)}
                aria-label={on ? '取消选择' : '选择删除'}
                className="flex h-full shrink-0 items-center px-3 py-3"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    on
                      ? 'border-[#a32d2d] bg-[#a32d2d] text-white'
                      : 'border-neutral-300'
                  }`}
                >
                  {on && <span className="text-[10px] leading-none">✓</span>}
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    mode: 'edit',
                    entryId: w.id,
                    draft: draftOf(w),
                    error: '',
                  })
                }
                className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-neutral-900">
                    {w.word}
                  </span>
                  <span className="block truncate text-[11px] text-neutral-400">
                    {w.cn || '（缺中文）'}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] text-neutral-300">›</span>
              </button>
            </div>
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
        改完记得在账号页同步一次，别的设备才会跟着更新。
        改了单词或释义，已经背过的进度会跟着这个词走，不会丢
      </div>
    </Shell>
  )
}

/**
 * 编辑器是独立的一整屏，不是嵌在家长页里的一张卡。
 * 之前它是顶着「词库管理」那张卡的位置渲染的 —— 家长页滚到下面点进来，
 * 表单就出现在半页腰上，标题和「完成」都在屏幕外，看着像页面卡住了。
 * 自带滚动容器，进出都从顶部开始，不受上级滚动位置影响。
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[#f6f5fb]">
      <div className="mx-auto min-h-full w-full max-w-md px-5 py-6 pb-16 sm:max-w-lg">
        {children}
      </div>
    </div>
  )
}

interface FormState {
  mode: 'edit' | 'new'
  entryId: string | null
  draft: WordDraft
  error: string
}

function draftOf(w: WordEntry): WordDraft {
  return {
    word: w.word,
    cn: w.cn,
    phonetic: w.phoneticUk || w.phoneticUs,
    pos: w.pos,
    exampleEn: w.exampleEn,
    exampleCn: w.exampleCn,
    unit: w.unit,
    lesson: w.lesson,
    category: w.category,
  }
}

function WordForm({
  title,
  draft,
  error,
  busy,
  units,
  onChange,
  onSave,
  onCancel,
}: {
  title: string
  draft: WordDraft
  error: string
  busy: boolean
  units: string[]
  onChange: (d: WordDraft) => void
  onSave: () => void | Promise<void>
  onCancel: () => void
}) {
  const set = (patch: Partial<WordDraft>) => onChange({ ...draft, ...patch })

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[16px] font-medium text-neutral-900">{title}</div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] text-neutral-400"
        >
          取消
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <Field
          label="单词"
          required
          value={draft.word}
          onChange={(v) => set({ word: v })}
          placeholder="cat"
        />
        <Field
          label="中文含义"
          required
          value={draft.cn}
          onChange={(v) => set({ cn: v })}
          placeholder="猫"
        />
        <Field
          label="音标"
          value={draft.phonetic}
          onChange={(v) => set({ phonetic: v })}
          placeholder="/kæt/"
        />
        <Field
          label="词性"
          value={draft.pos}
          onChange={(v) => set({ pos: v })}
          placeholder="n."
        />
        <Field
          label="单元"
          value={draft.unit}
          onChange={(v) => set({ unit: v })}
          placeholder="Unit 1"
          options={units}
        />
        <Field
          label="课文"
          value={draft.lesson}
          onChange={(v) => set({ lesson: v })}
          placeholder="Lesson 2"
        />
        <Field
          label="词汇类别"
          value={draft.category}
          onChange={(v) => set({ category: v })}
          placeholder="动物"
        />
        <Field
          label="英文例句"
          value={draft.exampleEn}
          onChange={(v) => set({ exampleEn: v })}
          placeholder="The cat is sleeping."
          multiline
        />
        <Field
          label="例句中文"
          value={draft.exampleCn}
          onChange={(v) => set({ exampleCn: v })}
          placeholder="那只猫在睡觉。"
          multiline
        />
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-[12px] leading-relaxed text-[#a32d2d]">
          {error}
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="h-11 flex-1 rounded-xl bg-brand-500 text-[14px] text-white active:bg-brand-600 disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-xl bg-white px-5 text-[14px] text-neutral-600 ring-1 ring-black/5"
        >
          取消
        </button>
      </div>

      <div className="mt-4 text-[11px] leading-relaxed text-neutral-300">
        单元填一个新的名字就会多出一个单元，排在最后面。
        例句留空也能学，只是少一个环节
      </div>
    </>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  multiline,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  multiline?: boolean
  options?: string[]
}) {
  const cls =
    'mt-1 w-full rounded-lg bg-white px-3 text-[14px] ring-1 ring-black/5 outline-none focus:ring-brand-400'
  return (
    <label className="block">
      <span className="text-[12px] text-neutral-500">
        {label}
        {required && <span className="ml-0.5 text-[#a32d2d]">*</span>}
      </span>
      {multiline ? (
        <textarea
          value={value}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${cls} py-2`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          // 单元给个候选：手打容易拼出"Unit1"和"Unit 1"两个单元
          list={options?.length ? `opts-${label}` : undefined}
          className={`${cls} h-10`}
        />
      )}
      {options && options.length > 0 && (
        <datalist id={`opts-${label}`}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </label>
  )
}
