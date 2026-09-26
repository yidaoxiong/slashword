import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { getRepo } from '../storage'
import { visibleBooks } from '../core/books'
import type { WordEntry } from '../types'

const repo = getRepo()

interface LessonRow {
  order: number
  label: string
  count: number
}
interface UnitGroup {
  order: number
  label: string
  lessons: LessonRow[]
}

/** 一课的编号：`"单元序:课序"`，比如 "1:3" = 第 1 单元第 3 课 */
const keyOf = (unitOrder: number, lessonOrder: number) =>
  `${unitOrder}:${lessonOrder}`

/**
 * 家长端挑"打卡要考哪几课"。
 *
 * 原来只能靠「学到第几个单元」那根滑杆整段推进，孩子想跳过某一课、
 * 或者只复习某几课都做不到。这里直接把单元—课列出来勾。
 *
 * 存储上刻意区分两态：
 *   - 没设（undefined）＝ 不限制，照旧整本推进 —— 老用户都在这个状态
 *   - 设了（哪怕是空数组）＝ 严格按名单来
 * 混成一回事的话，家长把勾全去掉就会退化成"全学"，正好和意图相反。
 */
export function LessonPicker() {
  const { config, catalog, setConfig } = useAppStore()
  const books = useMemo(
    () => visibleBooks(catalog, config?.hiddenBooks ?? []),
    [catalog, config?.hiddenBooks],
  )

  const [bookId, setBookId] = useState('')
  const [entries, setEntries] = useState<WordEntry[]>([])

  // 打开时先看当前在学的那本
  useEffect(() => {
    if (config?.activeBook) setBookId(config.activeBook)
  }, [config?.activeBook])

  // 读哪本词书的词条：不能只用 store 里的 entries，那是当前 activeBook 的，
  // 家长要能不动 activeBook 就改另一本的勾选
  useEffect(() => {
    if (!bookId) return
    let alive = true
    void repo.listEntries(bookId).then((list) => {
      if (alive) setEntries(list)
    })
    return () => {
      alive = false
    }
  }, [bookId])

  const tree = useMemo(() => {
    const byUnit = new Map<number, UnitGroup>()
    for (const e of entries) {
      let u = byUnit.get(e.unitOrder)
      if (!u) {
        u = { order: e.unitOrder, label: e.unit, lessons: [] }
        byUnit.set(e.unitOrder, u)
      }
      let l = u.lessons.find((x) => x.order === e.lessonOrder)
      if (!l) {
        l = { order: e.lessonOrder, label: e.lesson, count: 0 }
        u.lessons.push(l)
      }
      l.count += 1
    }
    return [...byUnit.values()]
      .sort((a, b) => a.order - b.order)
      .map((u) => ({
        ...u,
        lessons: [...u.lessons].sort((a, b) => a.order - b.order),
      }))
  }, [entries])

  if (!config) return null

  const saved = config.lessonFilter?.[bookId]
  const limited = Array.isArray(saved)
  const allKeys = tree.flatMap((u) =>
    u.lessons.map((l) => keyOf(u.order, l.order)),
  )
  // 没设就当成全勾 —— 界面上显示"全都选着"，而不是一片空白
  const selected = saved ?? allKeys
  const isOn = (k: string) => selected.includes(k)

  const commit = (next: string[]) => {
    void setConfig({
      lessonFilter: { ...(config.lessonFilter ?? {}), [bookId]: next },
    }).then(
      // 孩子可能正在另一台/另一个标签页做题，改完范围要让队列立刻跟着变
      () => void useAppStore.getState().applyLessonScope(),
    )
  }

  const toggle = (k: string) => {
    commit(isOn(k) ? selected.filter((x) => x !== k) : [...selected, k])
  }

  /** 点单元名整组开关 */
  const toggleUnit = (u: UnitGroup) => {
    const keys = u.lessons.map((l) => keyOf(u.order, l.order))
    const allOn = keys.every(isOn)
    commit(
      allOn
        ? selected.filter((k) => !keys.includes(k))
        : [...new Set([...selected, ...keys])],
    )
  }

  /** 恢复成"不限制"：删掉这个 key，而不是塞一份全量名单进去 */
  const clearFilter = () => {
    const next = { ...(config.lessonFilter ?? {}) }
    delete next[bookId]
    void setConfig({ lessonFilter: next }).then(
      () => void useAppStore.getState().applyLessonScope(),
    )
  }

  return (
    <div className="mt-5 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] font-medium text-neutral-800">学习范围</div>
        {limited && (
          <button
            type="button"
            onClick={clearFilter}
            className="text-[11px] text-brand-500"
          >
            恢复全部
          </button>
        )}
      </div>
      <div className="mt-1 text-[11px] text-neutral-400">
        勾掉的课不再出题，新旧词都不出
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {books.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBookId(b.id)}
            className={`rounded-lg px-2.5 py-1 text-[12px] ${
              b.id === bookId
                ? 'bg-brand-500 text-white'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-72 space-y-3 overflow-y-auto">
        {tree.map((u) => (
          <div key={u.order}>
            <button
              type="button"
              onClick={() => toggleUnit(u)}
              className="flex w-full items-center justify-between text-[12px] font-medium text-neutral-700"
            >
              <span>{u.label}</span>
              <span className="text-[11px] font-normal text-neutral-400">
                {u.lessons.filter((l) => isOn(keyOf(u.order, l.order))).length}/
                {u.lessons.length}
              </span>
            </button>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {u.lessons.map((l) => {
                const k = keyOf(u.order, l.order)
                const on = isOn(k)
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggle(k)}
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] ${
                      on
                        ? 'bg-brand-50 text-neutral-800'
                        : 'bg-neutral-50 text-neutral-400'
                    }`}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px] ${
                        on
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-neutral-300'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="truncate">{l.label}</span>
                    <span className="ml-auto text-[10px] text-neutral-400">
                      {l.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {limited && selected.length === 0 && (
        <div className="mt-2 text-[11px] text-[#a32d2d]">
          这一本一课都没勾，打卡不会出任何词
        </div>
      )}
    </div>
  )
}
