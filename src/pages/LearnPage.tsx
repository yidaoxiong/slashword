import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { Skill } from '../types'
import {
  DefinitionTrainer,
  ExampleTrainer,
  SpellTrainer,
} from '../components/Trainers'

/**
 * 只存环节名，不存关号。
 *
 * 关号原来写死在这里（example 是「第 2 关」、definition 是「第 3 关」），
 * 结果调一次环节顺序，标题就和实际顺序对不上了 —— 孩子看到「第 3 关」
 * 却是第二道题目。关号改成按当前顺序实时算，以后再调也不会错。
 */
const SKILL_NAME: Record<Skill, string> = {
  pron: '发音',
  spell: '拼写',
  example: '例句',
  definition: '释义',
}

function skillTitle(skill: Skill, order: number): string {
  return `第 ${order} 关 · ${SKILL_NAME[skill]}`
}

export function LearnPage() {
  const { entry, session, config, queue, idx, entries, catalog, submitSkill } =
    useAppStore()

  /**
   * 什么时候默认亮出屏幕键盘。
   *
   * 原来是只看宽度（< 768 才给），但 iPhone 横过来宽度是 852 —— 会被判成
   * "宽屏"然后把键盘收起来，而手机上根本没有物理键盘，等于没法答题。
   * 所以改成先问设备是不是触屏：有鼠标的（Mac / PC）才默认收起，
   * 手指戳的（手机 / iPad，横竖都算）一律给键盘。
   */
  const [showKeyboard, setShowKeyboard] = useState(true)
  useEffect(() => {
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
    setShowKeyboard(isTouch || window.innerWidth < 768)
  }, [])

  // 以前这里是 return null —— 数据一旦没装上，整页变空白，
  // 只剩顶部那条登录条，看着就像"点错跳到登录页去了"。
  // 给条能自救的出路：回到首页重新开始
  if (!entry || !session || !config) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-5 py-16 text-center sm:max-w-lg">
        <div className="text-[14px] text-neutral-500">这一张没准备好</div>
        <button
          type="button"
          onClick={() => useAppStore.getState().skipItem()}
          className="mt-4 h-11 rounded-xl bg-brand-500 px-6 text-[14px] text-white active:bg-brand-600"
        >
          跳过这一张
        </button>
        <button
          type="button"
          onClick={() =>
            useAppStore.setState({ phase: 'idle', session: null, card: null })
          }
          className="mt-2 h-11 px-6 text-[13px] text-neutral-400"
        >
          回首页
        </button>
      </div>
    )
  }

  const bookName = catalog.find((b) => b.id === config.activeBook)?.name ?? ''
  const skills = config.enabledSkills
  const skill = skills[session.skillIdx]
  const total = queue.length
  const progress = (idx + (session.skillIdx + 1) / skills.length) / total

  return (
    // 手机横屏要放开 448/512 的宽度上限：那时候是卡片和键盘左右分栏，
    // 再限宽等于把两栏硬塞进半个屏幕。Mac / iPad 不命中 land，保持窄栏易读
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-6 sm:max-w-lg short:py-3 land:max-w-none land:px-4 land:py-1">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
        <div className="text-[12px] tabular-nums text-neutral-400">
          {idx + 1}/{total}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 short:mt-2.5 land:mt-2">
        <div className="text-[13px] font-medium text-neutral-700">
          {skillTitle(skill, session.skillIdx + 1)}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowKeyboard((v) => !v)}
            className="rounded-md px-2 py-1 text-[11px] text-neutral-400 ring-1 ring-black/5 active:bg-neutral-50"
          >
            {showKeyboard ? '收起键盘' : '屏幕键盘'}
          </button>
          <div className="flex gap-1.5">
            {skills.map((s, i) => (
              <span
                key={s}
                className={`h-1.5 w-6 rounded-full ${
                  i < session.skillIdx
                    ? 'bg-ok'
                    : i === session.skillIdx
                      ? 'bg-brand-500'
                      : 'bg-neutral-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex-1 short:mt-2.5 land:mt-2">
        {skill === 'spell' && (
          <SpellTrainer
            entry={entry}
            candidates={entries}
            hint={config.spellHint}
            showKeyboard={showKeyboard}
            onDone={(ok, input, usedHint) =>
              void submitSkill('spell', ok, input, usedHint)
            }
          />
        )}
        {skill === 'example' && (
          <ExampleTrainer
            entry={entry}
            candidates={entries}
            showKeyboard={showKeyboard}
            // 第一遍（拼写）写对了，第二遍就不用再敲一遍同一个词
            canSkip={session.results.spell === true}
            onDone={(ok, input, usedHint, skipped) =>
              void submitSkill('example', ok, input, usedHint, skipped)
            }
          />
        )}
        {skill === 'definition' && (
          <DefinitionTrainer
            entry={entry}
            candidates={entries}
            onDone={(ok, input) => void submitSkill('definition', ok, input)}
          />
        )}
      </div>

      {/* 词书/单元是给家长看的，孩子做题时用不上；矮屏直接让位给键盘。
          顺手修了原来 lesson 为空时会多出一个孤零零的「·」 */}
      <div className="pt-4 text-center text-[11px] text-neutral-300 short:hidden">
        {bookName && <span className="text-neutral-400">{bookName}</span>}
        {bookName && (entry.unit || entry.lesson) && <span> · </span>}
        {[entry.unit, entry.lesson, entry.category]
          .filter(Boolean)
          .join(' · ')}
      </div>
    </div>
  )
}
