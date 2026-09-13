/**
 * 发音。
 *
 * 首选：预生成的音频文件（微软神经网络语音，scripts/gen_audio.py 生成）。
 *   好处是所有设备听到的完全一样、离线可用、比系统 TTS 自然得多。
 * 兜底：Web Speech API（系统内置语音），音频文件缺失或加载失败时顶上。
 */
import { DEFAULT_ACCENT, resolveAccent } from '../core/lang'
import type { Lang } from '../types'

export interface SpeakOptions {
  /** 词条 id，用于拼音频文件路径 */
  audioId?: string
  /** word = 单词音频，example = 例句音频 */
  kind?: 'word' | 'example'
  /** 强制用某个口音；不传就用全局口音设置（见 setVoice） */
  accent?: string
  /** 语速，仅影响系统 TTS；小于 0.8 时音频也会放慢一点 */
  rate?: number
  onEnd?: () => void
}

let voices: SpeechSynthesisVoice[] = []

function loadVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  voices = window.speechSynthesis.getVoices()
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices()
  window.speechSynthesis.onvoiceschanged = loadVoices
}

function pickVoice(lang: Lang, accent: string): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) loadVoices()
  const tag = langTag(lang)
  const pool = voices.filter((v) => v.lang?.toLowerCase().startsWith(tag))
  if (pool.length === 0) return undefined
  // 优先挑 "增强 / 高级" 音质（macOS 上名字里带 Enhanced / Premium / Neural）
  const quality = pool.filter((v) =>
    /enhanced|premium|neural|siri/i.test(v.name),
  )
  const candidates = quality.length > 0 ? quality : pool
  // 拉美西语优先挑 es-MX / es-419，找不到就随便一个西语
  const wanted = tag === 'es' && accent.startsWith('es-') ? accent : tag
  return (
    candidates.find((v) => v.lang?.toLowerCase().replace('_', '-') === wanted) ??
    candidates.find((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(tag)) ??
    candidates[0]
  )
}

// ---------- 语言与口音 ----------

/**
 * 全局语言 + 口音，由 App 跟着「当前词库」和「用户配置」同步下来，
 * 这样 7 处 speak() 调用点一个都不用改。
 */
let currentLang: Lang = 'en'
let currentAccent: string = DEFAULT_ACCENT.en

export function setVoice(lang: Lang, accent?: string) {
  currentLang = lang
  currentAccent = resolveAccent(lang, accent)
}

/** 系统 TTS 兜底时用来挑语音的语言标签 */
function langTag(lang: Lang): string {
  return lang === 'es' ? 'es' : 'en'
}

// ---------- 预生成音频 ----------

const audioCache = new Map<string, HTMLAudioElement | null>()

/**
 * 命名规则（gen_audio.py 必须遵守同样的规则）：
 *   该语言的默认口音 -> {id}.mp3（裸文件）
 *   其他口音         -> {id}-{accentId}.mp3
 * 英语默认英音、西语默认拉美，所以英语的 -us 和西语的 -es-es 都是"其他口音"。
 */
function audioPath(
  audioId: string,
  kind: SpeakOptions['kind'],
  accentId: string,
) {
  const dir = kind === 'example' ? 'examples' : 'words'
  const suffix = accentId === DEFAULT_ACCENT[currentLang] ? '' : `-${accentId}`
  return `./audio/${dir}/${audioId}${suffix}.mp3`
}

function audioUrl(opts: SpeakOptions, accentId: string): string | null {
  if (!opts.audioId) return null
  return audioPath(opts.audioId, opts.kind, accentId)
}

function loadAudio(url: string): Promise<HTMLAudioElement | null> {
  if (audioCache.has(url)) return Promise.resolve(audioCache.get(url) ?? null)
  return new Promise((resolve) => {
    const el = new Audio(url)
    el.preload = 'auto'
    let settled = false
    const done = (v: HTMLAudioElement | null) => {
      if (settled) return
      settled = true
      audioCache.set(url, v)
      resolve(v)
    }
    el.addEventListener('canplaythrough', () => done(el), { once: true })
    el.addEventListener('error', () => done(null), { once: true })
    // 网络慢的时候别让孩子干等着，超时就退回系统语音
    setTimeout(() => done(null), 3000)
  })
}

// ---------- 系统 TTS 兜底 ----------

function speakWithSystem(text: string, opts: SpeakOptions) {
  const onEnd = opts.onEnd
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.()
    return
  }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = opts.rate ?? 0.85
  u.pitch = 1.05
  const v = pickVoice(currentLang, opts.accent ?? currentAccent)
  if (v) u.voice = v
  u.lang = v?.lang ?? (currentLang === 'es' ? 'es-MX' : 'en-US')

  let fired = false
  const done = () => {
    if (fired) return
    fired = true
    onEnd?.()
  }
  u.onend = done
  u.onerror = done
  window.speechSynthesis.speak(u)

  const rate = opts.rate ?? 0.85
  const estimated = Math.max(1200, (text.length * 95) / rate + 700)
  window.setTimeout(done, estimated)
}

export async function speak(text: string, opts: SpeakOptions = {}) {
  const want = opts.accent ?? currentAccent
  // 先试当前口音的文件；万一这份没生成出来，退回该语言的默认口音
  //（默认口音是全量生成的，一定有），别一下掉到系统 TTS —— 那才是真的难听
  const fallback = DEFAULT_ACCENT[currentLang]
  const candidates = opts.audioId
    ? want === fallback
      ? [want]
      : [want, fallback]
    : []

  for (const accent of candidates) {
    const url = audioUrl(opts, accent)
    if (!url) continue
    const el = await loadAudio(url)
    if (!el) continue

    let fired = false
    const finish = () => {
      if (fired) return
      fired = true
      opts.onEnd?.()
    }
    el.onended = finish
    el.onerror = () => {
      // 播放中途出错就换系统语音再读一遍
      speakWithSystem(text, { ...opts, accent })
    }
    try {
      el.currentTime = 0
      el.playbackRate = opts.rate && opts.rate < 0.8 ? 0.85 : 1
      await el.play()
      // 兜底：极端情况下 onended 不来，别让界面卡住
      const ms = ((el.duration || 3) * 1000) / el.playbackRate + 1500
      window.setTimeout(finish, ms)
      return
    } catch {
      // play() 被浏览器拦截（比如还没交互过），退回系统语音
    }
  }
  speakWithSystem(text, { ...opts, accent: want })
}

/** 估算朗读时长，用于决定反馈展示的最短时间 */
export function estimateDuration(text: string, rate = 0.85) {
  return Math.max(1000, (text.length * 95) / rate + 500)
}
