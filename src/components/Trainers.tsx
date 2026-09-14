import { useEffect, useMemo, useRef, useState } from 'react'
import type { WordEntry } from '../types'
import { estimateDuration, speak } from '../lib/speech'
import { useTyping } from '../lib/useTyping'
import { blankOut, checkSpelling, normalize } from '../lib/spell'
import { LetterKeyboard } from './LetterKeyboard'

interface TrainerProps {
  entry: WordEntry
  candidates: WordEntry[]
  hint?: boolean
  /** 桌面端可收起屏幕键盘 */
  showKeyboard?: boolean
  /** usedHint：答题前听过发音。拼对了也只能算半掌握 */
  onDone: (correct: boolean, input?: string, usedHint?: boolean) => void
}

/**
 * 比对答案时忽略标点、大小写和空格。
 * 词表里有 "Washington, D.C."、"p.m."、"Mid-Autumn Festival" 这类词，
 * 键盘上根本没有句点和逗号，严格要求标点只会让孩子卡死。
 * 拼写训练要抓的是字母序列对不对，不是标点。
 */
function ResultBanner({
  ok,
  word,
  phonetic,
  note,
  article,
  pos,
  accentOnly,
}: {
  ok: boolean
  word: string
  /** 英语显示音标；西语不显示（西语拼写即发音，教材也不标） */
  phonetic?: string
  note?: string
  /** 西语的冠词 el / la，比音标有用得多 —— 性数才是西语要记的东西 */
  article?: string
  pos?: string
  /** 字母对但重音写错了 */
  accentOnly?: boolean
}) {
  const meta = article ? `${article} ${word}${pos ? ` · ${pos}` : ''}` : (phonetic ?? '')
  return (
    <div
      className={`pop mt-4 rounded-card px-4 py-3 short:mt-2.5 short:px-3 short:py-2 ${
        ok ? 'bg-ok-soft text-[#0f6e56]' : 'bg-bad-soft text-[#a32d2d]'
      }`}
    >
      <div className="text-[15px] font-medium">
        {ok ? '答对了' : `正确拼写：${article ? `${article} ${word}` : word}`}
      </div>
      {meta && <div className="mt-0.5 text-[12px] opacity-80">{meta}</div>}
      {accentOnly && (
        <div className="mt-1.5 text-[11px] opacity-80">
          字母都对，注意重音符号：{word}
        </div>
      )}
      {note && <div className="mt-1.5 text-[11px] opacity-60">{note}</div>}
    </div>
  )
}

function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 h-11 w-full rounded-xl bg-neutral-900 text-[14px] text-white active:bg-neutral-700 short:mt-2 short:h-10"
    >
      {label}
    </button>
  )
}

/**
 * 答对之后的流转：等语音读完再进下一关，不抢孩子的耳朵。
 * 同时给一个"继续"按钮，读得慢或者不想等可以直接跳过。
 */
function useAdvance(onDone: TrainerProps['onDone']) {
  const fired = useRef(false)
  const timer = useRef<number | null>(null)

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  const arm = (
    text: string,
    audio: { audioId: string; kind?: 'word' | 'example' },
    rate: number,
    correct: boolean,
    input: string,
    usedHint: boolean,
  ) => {
    fired.current = false
    const finish = () => {
      if (fired.current) return
      fired.current = true
      clear()
      onDone(correct, input, usedHint)
    }
    speak(text, { ...audio, rate, onEnd: finish })
    // 兜底：iOS Safari 偶尔不回调 onend，别让界面卡死
    timer.current = window.setTimeout(finish, estimateDuration(text, rate) + 800)
    return finish
  }

  const manual = (correct: boolean, input: string, usedHint: boolean) => {
    fired.current = true
    clear()
    onDone(correct, input, usedHint)
  }

  return { arm, manual, clear }
}

function TypingHint() {
  // 手机上本来就只有屏幕键盘，这句提示没信息量，矮屏直接省掉 —— 一屏放得下更要紧
  return (
    <div className="mt-2 text-center text-[11px] text-neutral-300 short:hidden">
      可以直接敲键盘，也可以点下面的字母
    </div>
  )
}

/** 一个不起眼的"提前听"入口：用了会记一笔，本次只算半掌握 */
function PeekButton({ used, onClick }: { used: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-3 h-9 w-full rounded-lg text-[12px] short:mt-2 short:h-8 ${
        used
          ? 'bg-neutral-100 text-neutral-400'
          : 'bg-white text-neutral-400 ring-1 ring-black/5 active:bg-neutral-50'
      }`}
    >
      {used ? '已经听过了（本次算半掌握）' : '实在不会？先听一遍'}
    </button>
  )
}

/** 环节一：拼写 —— 先自己拼，写完再听发音验证 */
export function SpellTrainer({ entry, hint, showKeyboard = true, onDone }: TrainerProps) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const [ok, setOk] = useState(false)
  const [usedHint, setUsedHint] = useState(false)
  /** 字母都对，只是重音符号写错了 */
  const [accentOnly, setAccentOnly] = useState(false)
  const { arm, manual, clear } = useAdvance(onDone)
  // 必须用 ref：submit 里赋值后会触发 re-render，
  // 用普通变量的话按钮的 onClick 闭包会拿到 null，点了没反应
  const finishRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setValue('')
    setChecked(false)
    setOk(false)
    setUsedHint(false)
    setAccentOnly(false)
    return () => clear()
  }, [entry.id])

  const submit = () => {
    if (checked || value.trim() === '') return
    const r = checkSpelling(value, entry.word)
    setChecked(true)
    setOk(r.ok)
    setAccentOnly(r.accentOnly)
    // 重音写错也算过，但和"听了提示"一样按半掌握记，别让孩子觉得重音无所谓
    const penalized = usedHint || r.accentOnly
    // 写完才发音：让孩子先自己拼，再用耳朵验证
    if (r.ok) {
      finishRef.current = arm(entry.word, { audioId: entry.id }, 0.9, true, value, penalized)
    } else {
      speak(entry.word, { audioId: entry.id })
    }
  }

  useTyping({
    enabled: !checked,
    onChar: (ch) => setValue((v) => (v + ch).slice(0, 40)),
    onBackspace: () => setValue((v) => v.slice(0, -1)),
    onSubmit: submit,
  })

  const letterCount = entry.word.replace(/[^a-zA-Z]/g, '').length

  return (
    <div className="flex flex-col">
      <div className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5 short:p-3.5">
        {/* 答完之后这行引导语就没用了，收掉能省一行 —— 手机上每一行都换算成键高 */}
        {!checked && (
          <div className="text-[12px] tracking-wide text-neutral-400">
            根据意思，拼出这个单词
          </div>
        )}
        {/* 词性并到中文同一行，不再单独占一行 */}
        <div className="mt-2 text-[22px] font-medium text-neutral-900 short:mt-0.5 short:text-[19px]">
          {entry.cn}
          {entry.pos && (
            <span className="ml-2 align-middle text-[12px] font-normal text-neutral-400">
              {entry.pos}
            </span>
          )}
        </div>

        <div
          className={`mt-4 flex min-h-[52px] items-center justify-center rounded-xl border-2 px-3 text-center text-[20px] tracking-widest short:mt-2.5 short:min-h-[44px] short:text-[18px] ${
            checked
              ? ok
                ? 'border-ok bg-ok-soft text-[#0f6e56]'
                : 'shake border-bad bg-bad-soft text-[#a32d2d]'
              : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          {value || (
            <span className="text-[13px] tracking-normal text-neutral-300">
              拼出这个单词
            </span>
          )}
        </div>

        {hint && !checked && (
          <div className="mt-2 text-center text-[12px] text-neutral-400 short:mt-1.5">
            提示：{entry.word[0]} … （{letterCount} 个字母）
          </div>
        )}
        {!checked && <TypingHint />}
        {!checked && (
          <PeekButton
            used={usedHint}
            onClick={() => {
              setUsedHint(true)
              speak(entry.word, { audioId: entry.id, rate: 0.7 })
            }}
          />
        )}

        {checked && (
          <ResultBanner
            ok={ok}
            word={entry.word}
            phonetic={entry.phoneticUk}
            note={entry.note}
            article={entry.article}
            pos={entry.pos}
            accentOnly={accentOnly}
          />
        )}

        {checked && ok && <NextButton label="继续" onClick={() => finishRef.current?.()} />}
        {checked && !ok && (
          <NextButton
            label="我记住了，下一个"
            onClick={() => manual(false, value, usedHint || accentOnly)}
          />
        )}
      </div>

      <div className="mt-5">
        <LetterKeyboard
          disabled={checked}
          onKey={(ch) => setValue((v) => (v + ch).slice(0, 40))}
          onBackspace={() => setValue((v) => v.slice(0, -1))}
          onSubmit={submit}
          visible={showKeyboard}
          lang={entry.lang}
        />
      </div>
    </div>
  )
}

/** 环节二：例句 —— 先把句子补完整，再听整句验证 */
export function ExampleTrainer({ entry, showKeyboard = true, onDone }: TrainerProps) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const [ok, setOk] = useState(false)
  const [usedHint, setUsedHint] = useState(false)
  /** 字母都对，只是重音符号写错了 */
  const [accentOnly, setAccentOnly] = useState(false)
  const { arm, manual, clear } = useAdvance(onDone)
  const finishRef = useRef<(() => void) | null>(null)

  const { text, blanked } = useMemo(
    () => blankOut(entry.exampleEn, entry.word),
    [entry.id],
  )

  useEffect(() => {
    setValue('')
    setChecked(false)
    setOk(false)
    setUsedHint(false)
    setAccentOnly(false)
    return () => clear()
  }, [entry.id])

  const submit = () => {
    if (checked || value.trim() === '') return
    const r = checkSpelling(value, entry.word)
    setChecked(true)
    setOk(r.ok)
    setAccentOnly(r.accentOnly)
    // 重音写错也算过，但和"听了提示"一样按半掌握记，别让孩子觉得重音无所谓
    const penalized = usedHint || r.accentOnly
    // 填完才读整句，否则等于把答案念出来了
    if (r.ok) {
      finishRef.current = arm(entry.exampleEn, { audioId: entry.id, kind: 'example' }, 0.9, true, value, penalized)
    } else {
      speak(entry.exampleEn, { audioId: entry.id, kind: 'example' })
    }
  }

  useTyping({
    enabled: !checked,
    onChar: (ch) => setValue((v) => (v + ch).slice(0, 40)),
    onBackspace: () => setValue((v) => v.slice(0, -1)),
    onSubmit: submit,
  })

  return (
    <div className="flex flex-col">
      <div className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5 short:p-3.5">
        <div className="text-[12px] tracking-wide text-neutral-400">
          放进句子里，这个词怎么用
        </div>

        <div className="mt-3 rounded-xl bg-neutral-50 p-4 short:mt-2 short:p-2.5">
          <div className="text-[15px] leading-relaxed text-neutral-800 short:text-[14px] short:leading-snug">
            {blanked ? text : entry.exampleEn}
          </div>
          <div className="mt-2 text-[13px] leading-relaxed text-neutral-500 short:mt-0.5 short:text-[12px] short:leading-snug">
            {entry.exampleCn}
          </div>
        </div>

        {/* 上面已经写了「放进句子里，这个词怎么用」，这句是重复的，矮屏去掉 */}
        <div className="mt-4 text-[13px] text-neutral-500 short:hidden">
          {blanked ? '把句子补完整：' : '写出这个句子里的生词：'}
        </div>

        <div
          className={`mt-2 flex min-h-[52px] items-center justify-center rounded-xl border-2 px-3 text-center text-[20px] tracking-widest short:min-h-[44px] short:text-[18px] ${
            checked
              ? ok
                ? 'border-ok bg-ok-soft text-[#0f6e56]'
                : 'shake border-bad bg-bad-soft text-[#a32d2d]'
              : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          {value || (
            <span className="text-[13px] tracking-normal text-neutral-300">拼写单词</span>
          )}
        </div>

        {!checked && <TypingHint />}
        {!checked && (
          <PeekButton
            used={usedHint}
            onClick={() => {
              setUsedHint(true)
              speak(entry.exampleEn, { audioId: entry.id, kind: 'example' })
            }}
          />
        )}

        {checked && (
          <ResultBanner
            ok={ok}
            word={entry.word}
            phonetic={entry.phoneticUk}
            note={entry.note}
            article={entry.article}
            pos={entry.pos}
            accentOnly={accentOnly}
          />
        )}

        {checked && ok && <NextButton label="继续" onClick={() => finishRef.current?.()} />}
        {checked && !ok && (
          <NextButton
            label="我记住了，下一个"
            onClick={() => manual(false, value, usedHint || accentOnly)}
          />
        )}
      </div>

      <div className="mt-5">
        <LetterKeyboard
          disabled={checked}
          onKey={(ch) => setValue((v) => (v + ch).slice(0, 40))}
          onBackspace={() => setValue((v) => v.slice(0, -1))}
          onSubmit={submit}
          visible={showKeyboard}
          lang={entry.lang}
        />
      </div>
    </div>
  )
}

/**
 * 环节三：释义 —— 这一关考的就是"听到词能想起意思"，
 * 所以一上来就发音，它不是提示而是题目本身。
 */
export function DefinitionTrainer({ entry, candidates, onDone }: TrainerProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const { arm, manual, clear } = useAdvance(onDone)
  const finishRef = useRef<(() => void) | null>(null)

  const options = useMemo(() => {
    const pool = candidates.filter(
      (c) => normalize(c.word) !== normalize(entry.word) && c.cn,
    )
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 3)
    return [entry, ...shuffled].sort(() => Math.random() - 0.5)
  }, [entry.id, candidates.length])

  useEffect(() => {
    setPicked(null)
    const t = window.setTimeout(() => speak(entry.word, { audioId: entry.id }), 220)
    return () => {
      window.clearTimeout(t)
      clear()
    }
  }, [entry.id])

  const choose = (word: string) => {
    if (picked) return
    setPicked(word)
    const correct = normalize(word) === normalize(entry.word)
    if (correct) {
      finishRef.current = arm(entry.word, { audioId: entry.id }, 0.9, true, word, false)
    } else {
      speak(entry.word, { audioId: entry.id })
    }
  }

  return (
    <div className="rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="text-[12px] tracking-wide text-neutral-400">
        听到这个词，是什么意思
      </div>

      <button
        type="button"
        onClick={() => speak(entry.word, { audioId: entry.id, rate: 0.7 })}
        className="mt-3 flex h-14 w-full items-center justify-center rounded-xl bg-brand-50 text-[13px] text-brand-600 active:bg-brand-100"
      >
        再听一遍
      </button>

      <div className="mt-4 grid gap-2">
        {options.map((opt) => {
          const isAnswer = normalize(opt.word) === normalize(entry.word)
          const chosen = picked === opt.word
          let cls = 'border-neutral-200 bg-white'
          if (picked) {
            if (isAnswer) cls = 'border-ok bg-ok-soft'
            else if (chosen) cls = 'shake border-bad bg-bad-soft'
          }
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!!picked}
              onClick={() => choose(opt.word)}
              className={`rounded-xl border-2 px-4 py-3 text-left text-[15px] ${cls}`}
            >
              {opt.cn}
            </button>
          )
        })}
      </div>

      {picked && (
        <div className="pop mt-4 rounded-card bg-neutral-50 px-4 py-3 text-[13px] text-neutral-600">
          {entry.word} · {entry.phoneticUk} · {entry.cn}
        </div>
      )}

      {picked && normalize(picked) === normalize(entry.word) && (
        <NextButton label="继续" onClick={() => finishRef.current?.()} />
      )}
      {picked && normalize(picked) !== normalize(entry.word) && (
        <NextButton
          label="我记住了，下一个"
          onClick={() => manual(false, picked ?? undefined, false)}
        />
      )}
    </div>
  )
}
