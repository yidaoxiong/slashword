import { useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import {
  buildEntries,
  downloadBook,
  mapColumns,
  newBookId,
  readSpreadsheet,
  type ColumnMap,
  type ImportReport,
  type SheetData,
} from '../lib/importer'
import type { Lang, WordEntry } from '../types'
import { LANG_LABEL, langOf } from '../core/lang'
import { canHideBook, visibleBooks } from '../core/books'
import { BookEditor } from './BookEditor'

const TEMPLATE_URL = './词库导入模板.xlsx'

const FIELD_LABEL: Record<string, string> = {
  word: '单词',
  phonetic: '音标',
  pos: '词性',
  cn: '中文含义',
  exampleCn: '例句中文',
  exampleEn: '英文例句',
  unitTitle: '单元主题',
  unit: '单元',
  lessonTitle: '课文题目',
  lesson: '课文',
  category: '词汇类别',
}

interface Pending {
  bookId: string
  name: string
  lang: Lang
  words: WordEntry[]
  report: ImportReport
  map: ColumnMap
}

export function BookImporter() {
  const { userBooks, importBook, removeBook, catalog, config, setConfig } =
    useAppStore()
  const username = useAuthStore((s) => s.username)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [lang, setLang] = useState<Lang>('en')
  const [editing, setEditing] = useState<string | null>(null)

  const visible = visibleBooks(catalog, config?.hiddenBooks)
  const hidden = catalog.filter((b) => (config?.hiddenBooks ?? []).includes(b.id))
  const builtin = visible.filter((b) => !b.custom)

  const hide = async (id: string) => {
    const next = [...(config?.hiddenBooks ?? []), id]
    await setConfig({ hiddenBooks: next })
  }

  const restore = async (id: string) => {
    const next = (config?.hiddenBooks ?? []).filter((b) => b !== id)
    await setConfig({ hiddenBooks: next })
  }

  async function pick(file: File) {
    setError(null)
    setDone(null)
    setBusy(true)
    try {
      let sheet: SheetData
      try {
        sheet = await readSpreadsheet(file)
      } catch (e) {
        throw new Error(
          `读不了这个文件${e instanceof Error ? `：${e.message}` : ''}。支持 .xlsx / .xls / .csv`,
        )
      }
      if (sheet.rows.length < 2) {
        throw new Error('表里没有数据行（第一行是表头，从第二行开始才是单词）')
      }
      const map = mapColumns(sheet.rows[0])
      if (map.missing.length > 0) {
        throw new Error(
          `没找到「${map.missing.map((f) => FIELD_LABEL[f]).join('」「')}」列。` +
            `实际表头：${sheet.rows[0].filter(Boolean).join('、') || '（空）'}`,
        )
      }
      const bookId = newBookId()
      const { words, report } = buildEntries(sheet.rows, map, {
        bookId,
        grade: '自定义',
        source: '自制词库',
        lang,
      })
      if (words.length === 0) throw new Error('没解析出任何单词')
      setPending({
        bookId,
        name: file.name.replace(/\.(xlsx|xls|csv|txt)$/i, ''),
        lang,
        words,
        report,
        map,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!pending) return
    setBusy(true)
    try {
      await importBook({
        id: pending.bookId,
        name: pending.name.trim() || '未命名词库',
        grade: '自定义',
        source: '自制词库',
        lang: pending.lang,
        wordCount: pending.words.length,
        units: [...new Set(pending.words.map((w) => w.unit).filter(Boolean))],
        words: pending.words,
      })
      setDone(`已导入「${pending.name}」，${pending.words.length} 个词。去首页就能选它打卡。`)
      setPending(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 管理词条时整张卡片换成编辑器 —— 列表塞进小卡片里会挤得没法看
  const editingBook = editing
    ? userBooks.find((b) => b.id === editing)
    : undefined
  if (editingBook) {
    return <BookEditor book={editingBook} onClose={() => setEditing(null)} />
  }

  return (
    <div className="mt-5 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium text-neutral-800">词库管理</div>
        <a
          href={encodeURI(TEMPLATE_URL)}
          download
          className="text-[11px] text-brand-500"
        >
          下载模板
        </a>
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-neutral-400">
        按模板填好 Excel 传上来就行，只要有「单词」和「中文含义」两列就能用。
        {username
          ? `导入的词库归「${username}」所有，换账号登录后看不到`
          : '未登录时导入的词库只属于本机，登录后看不到'}
      </div>

      <div className="mt-3">
        <div className="text-[12px] text-neutral-500">这门语言</div>
        <div className="mt-2 flex overflow-hidden rounded-lg ring-1 ring-black/5">
          {(['en', 'es'] as Lang[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setLang(id)}
              className={`h-9 flex-1 text-[12px] ${
                lang === id ? 'bg-brand-500 text-white' : 'bg-white text-neutral-500'
              }`}
            >
              {LANG_LABEL[id]}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-neutral-300">
          决定发音音色和屏幕键盘
          {lang === 'es' && '（西语会多出 ñ 和重音键）'}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void pick(f)
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="mt-3 h-10 w-full rounded-lg bg-brand-500 text-[13px] text-white disabled:opacity-40"
      >
        {busy ? '解析中…' : '选择词表文件导入'}
      </button>

      {error && (
        <div className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-[12px] leading-relaxed text-[#a32d2d]">
          {error}
        </div>
      )}
      {done && (
        <div className="mt-3 rounded-lg bg-ok-soft px-3 py-2 text-[12px] leading-relaxed text-[#0f6e56]">
          {done}
        </div>
      )}

      {pending && <Preview pending={pending} onChange={setPending} />}

      {pending && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="h-10 flex-1 rounded-lg bg-brand-500 text-[13px] text-white disabled:opacity-40"
          >
            {busy ? '导入中…' : `确认导入（${pending.words.length} 词）`}
          </button>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="h-10 px-4 rounded-lg bg-white text-[13px] text-neutral-600 ring-1 ring-black/5"
          >
            取消
          </button>
        </div>
      )}

      {builtin.length > 0 && (
        <div className="mt-4 border-t border-black/5 pt-3">
          <div className="text-[12px] text-neutral-500">内置词库</div>
          <div className="mt-2 space-y-2">
            {builtin.map((b) => (
              <div key={b.id} className="rounded-lg bg-neutral-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-neutral-800">
                      {b.name}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {LANG_LABEL[langOf(b.lang)]} · {b.wordCount} 词 ·{' '}
                      {b.unitCount} 单元
                    </div>
                  </div>
                  {b.locked ? (
                    <span className="shrink-0 text-[11px] text-neutral-300">
                      主线教材
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        !canHideBook(b, config?.activeBook, visible.length)
                      }
                      onClick={() => void hide(b.id)}
                      className="shrink-0 text-[11px] text-neutral-400 disabled:opacity-30"
                    >
                      {b.id === config?.activeBook ? '使用中' : '移除'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-neutral-300">
            内置词库是从站点加载的，移除只是在列表里不显示（可从下面恢复）。
            主线教材锁死不能移除，至少要留一本在学
          </div>
        </div>
      )}

      {hidden.length > 0 && (
        <div className="mt-4 border-t border-black/5 pt-3">
          <div className="text-[12px] text-neutral-500">已移除的词库</div>
          <div className="mt-2 space-y-2">
            {hidden.map((b) => (
              <div key={b.id} className="rounded-lg bg-neutral-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] text-neutral-500">
                    {b.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => void restore(b.id)}
                    className="shrink-0 text-[11px] text-brand-500"
                  >
                    恢复
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {userBooks.length > 0 && (
        <div className="mt-4 border-t border-black/5 pt-3">
          <div className="text-[12px] text-neutral-500">已导入的词库</div>
          <div className="mt-2 space-y-2">
            {userBooks.map((b) => (
              <div
                key={b.id}
                className="rounded-lg bg-neutral-50 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-neutral-800">
                      {b.name}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {LANG_LABEL[langOf(b.lang)]} · {b.wordCount} 词 ·{' '}
                      {new Set(b.words.map((w) => w.unit).filter(Boolean)).size || 1} 单元
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setEditing(b.id)}
                      className="text-neutral-500"
                    >
                      管理词条
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadBook({
                          meta: {
                            id: b.id,
                            name: b.name,
                            grade: b.grade,
                            source: b.source,
                            wordCount: b.wordCount,
                            units: b.units,
                          },
                          words: b.words,
                        })
                      }
                      className="text-brand-500"
                    >
                      导出
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(b.id)}
                      className="text-neutral-400"
                    >
                      删除
                    </button>
                  </div>
                </div>

                {confirmDelete === b.id && (
                  <div className="mt-2 rounded-lg bg-bad-soft px-3 py-2">
                    <div className="text-[11px] text-[#a32d2d]">
                      会连学习记录一起删掉，导出过的 JSON 不受影响。确定吗？
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelete(null)
                          void removeBook(b.id)
                        }}
                        className="h-8 flex-1 rounded-md bg-[#a32d2d] text-[12px] text-white"
                      >
                        删除
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="h-8 flex-1 rounded-md bg-white text-[12px] text-neutral-600"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] leading-relaxed text-neutral-300">
            导入的词库暂用设备自带语音。点「导出」拿到 json 放进 word-app/data/，
            再跑 npm run import-book 和 npm run audio，就有和内置词库一样的高品质发音了
          </div>
        </div>
      )}
    </div>
  )
}

function Preview({
  pending,
  onChange,
}: {
  pending: Pending
  onChange: (p: Pending) => void
}) {
  const { report } = pending
  const miss = [
    report.missing.phonetic && `缺音标 ${report.missing.phonetic}`,
    report.missing.cn && `缺中文 ${report.missing.cn}`,
    report.missing.example && `缺例句 ${report.missing.example}`,
  ].filter(Boolean) as string[]

  return (
    <div className="mt-3 rounded-lg bg-neutral-50 p-3">
      <div className="text-[12px] text-neutral-500">词库名称</div>
      <input
        value={pending.name}
        onChange={(e) => onChange({ ...pending, name: e.target.value })}
        className="mt-1 h-9 w-full rounded-lg bg-white px-3 text-[13px] ring-1 ring-black/5 outline-none focus:ring-brand-500"
      />

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500">
        <span>{report.total} 个词</span>
        <span>{report.unitCount} 个单元</span>
        {report.skipped > 0 && <span>跳过空行 {report.skipped}</span>}
        {report.duplicates.length > 0 && (
          <span>去重 {report.duplicates.length} 个</span>
        )}
      </div>

      {miss.length > 0 && (
        <div className="mt-1 text-[11px] text-amber-600">
          {miss.join(' · ')}（缺了也能学，只是对应的卡片信息会少）
        </div>
      )}

      <div className="mt-3 space-y-1">
        {report.samples.map((w) => (
          <div key={w.id} className="flex gap-2 text-[12px]">
            <span className="w-28 shrink-0 truncate text-neutral-800">
              {w.word}
            </span>
            <span className="min-w-0 flex-1 truncate text-neutral-400">
              {w.cn || '（缺中文）'}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-neutral-300">
        识别到的列：
        {Object.entries(pending.map.index)
          .map(([f]) => FIELD_LABEL[f] ?? f)
          .join('、')}
      </div>
    </div>
  )
}
