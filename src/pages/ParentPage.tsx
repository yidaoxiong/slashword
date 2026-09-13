import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { getRepo } from '../storage'
import { currentUnitLabel, unlockedCount, unitsOf } from '../core/queue'
import type { Card, CheckinRecord, Skill } from '../types'
import { SKILL_LABEL, SKILLS } from '../types'

const repo = getRepo()

export function ParentPage() {
  const { config, streak, entries, catalog, init, setConfig, reset } = useAppStore()
  const [cards, setCards] = useState<Card[]>([])
  const [checkins, setCheckins] = useState<CheckinRecord[]>([])
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!config) return
    void Promise.all([
      repo.listCards(config.userId),
      repo.listCheckins(config.userId),
    ]).then(([c, k]) => {
      setCards(c)
      setCheckins(k)
    })
  }, [config])

  const stats = useMemo(() => {
    const threshold = config?.masteryThreshold ?? 80
    const enabled = (config?.enabledSkills ?? SKILLS) as Skill[]
    const learned = cards.filter((c) => c.reps > 0)
    const mastered = learned.filter((c) =>
      enabled.every((s) => c.mastery[s] >= threshold),
    )
    const weak = learned.filter((c) =>
      enabled.some((s) => c.mastery[s] < 40),
    )
    const avg = (s: Skill) =>
      learned.length === 0
        ? 0
        : Math.round(
            learned.reduce((a, c) => a + c.mastery[s], 0) / learned.length,
          )
    return {
      learned: learned.length,
      mastered: mastered.length,
      weak: weak.length,
      avg: {
        spell: avg('spell'),
        example: avg('example'),
        definition: avg('definition'),
      } as Record<string, number>,
    }
  }, [cards, config])

  const last7 = useMemo(() => {
    const set = new Set(checkins.filter((c) => c.completed).map((c) => c.date))
    const out: { date: string; done: boolean }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      out.push({ date: key, done: set.has(key) })
    }
    return out
  }, [checkins])

  if (!config) return null

  return (
    <div className="mx-auto min-h-full w-full max-w-md sm:max-w-lg px-5 py-8">
      <div className="text-[20px] font-medium text-neutral-900">家长端</div>
      <div className="mt-1 text-[13px] text-neutral-500">
        看得到细节，才知道孩子卡在哪
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Box label="已学" value={stats.learned} />
        <Box label="已掌握" value={stats.mastered} accent />
        <Box label="薄弱词" value={stats.weak} />
      </div>

      <div className="mt-5 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="text-[13px] font-medium text-neutral-800">四维掌握度</div>
        <div className="mt-3 space-y-3">
          {(['spell', 'example', 'definition'] as Skill[]).map((s) => (
            <div key={s}>
              <div className="flex justify-between text-[12px]">
                <span className="text-neutral-500">{SKILL_LABEL[s]}</span>
                <span className="tabular-nums text-neutral-400">{stats.avg[s]}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-brand-400"
                  style={{ width: `${stats.avg[s]}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="text-[13px] font-medium text-neutral-800">
          最近 7 天 · 连续 {streak} 天
        </div>
        <div className="mt-3 flex justify-between">
          {last7.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1">
              <div
                className={`h-8 w-8 rounded-lg ${
                  d.done ? 'bg-ok-soft text-ok' : 'bg-neutral-100 text-neutral-300'
                } flex items-center justify-center text-[13px]`}
              >
                {d.done ? '✓' : '—'}
              </div>
              <div className="text-[10px] text-neutral-400">{d.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="text-[13px] font-medium text-neutral-800">设置</div>

        <div className="mt-3">
          <div className="text-[12px] text-neutral-500">词书</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {catalog.map((book) => (
              <button
                key={book.id}
                type="button"
                onClick={() => {
                  void setConfig({ activeBook: book.id }).then(() => void init())
                }}
                className={`h-9 rounded-lg text-[13px] ${
                  config.activeBook === book.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {book.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-[12px] text-neutral-500">
            <span>每天新词</span>
            <span className="tabular-nums">{config.dailyNewLimit} 个</span>
          </div>
          <input
            type="range"
            min={5}
            max={30}
            step={5}
            value={config.dailyNewLimit}
            onChange={(e) =>
              void setConfig({ dailyNewLimit: Number(e.target.value) })
            }
            className="mt-2 w-full accent-[#7132f5]"
          />
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-[12px] text-neutral-500">
            <span>学到第几个单元</span>
            <span className="tabular-nums">
              {currentUnitLabel(entries, config)} · {unlockedCount(config)}/
              {Math.max(1, unitsOf(entries).length)}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={Math.max(1, unitsOf(entries).length)}
            step={1}
            value={unlockedCount(config)}
            onChange={(e) =>
              void setConfig({
                unitProgress: {
                  ...(config.unitProgress ?? {}),
                  [config.activeBook]: Number(e.target.value),
                },
              })
            }
            className="mt-2 w-full accent-[#7132f5]"
          />
          <div className="mt-1 text-[11px] text-neutral-300">
            每本词书的进度各自独立保存
          </div>
        </div>

        <label className="mt-4 flex items-center justify-between text-[12px] text-neutral-500">
          <span>拼写时给首字母提示</span>
          <input
            type="checkbox"
            checked={config.spellHint}
            onChange={(e) => void setConfig({ spellHint: e.target.checked })}
            className="h-4 w-4 accent-[#7132f5]"
          />
        </label>
      </div>

      <div className="mt-5">
        {confirmReset ? (
          <div className="rounded-card bg-bad-soft p-4">
            <div className="text-[13px] text-[#a32d2d]">
              会清空全部学习记录（掌握度、连续天数、打卡），词库保留。确定吗？
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(false)
                  void reset()
                }}
                className="h-10 flex-1 rounded-lg bg-[#a32d2d] text-[13px] text-white"
              >
                确定清空
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="h-10 flex-1 rounded-lg bg-white text-[13px] text-neutral-600 ring-1 ring-black/5"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="h-10 w-full rounded-lg text-[12px] text-neutral-400 ring-1 ring-black/5 active:bg-neutral-50"
          >
            清空学习记录，重新开始
          </button>
        )}
      </div>

      <div className="mt-4 text-[11px] leading-relaxed text-neutral-300">
        当前词书 {entries.length} 条 · 数据存在本机浏览器，不上传
      </div>
    </div>
  )
}

function Box({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="rounded-card bg-white px-3 py-4 text-center shadow-sm ring-1 ring-black/5">
      <div
        className={`text-[20px] font-medium ${accent ? 'text-brand-500' : 'text-neutral-900'}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-neutral-400">{label}</div>
    </div>
  )
}
