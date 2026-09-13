/**
 * 发音。
 *
 * 首选：预生成的音频文件（微软神经网络语音，scripts/gen_audio.py 生成）。
 *   好处是所有设备听到的完全一样、离线可用、比系统 TTS 自然得多。
 * 兜底：Web Speech API（系统内置语音），音频文件缺失或加载失败时顶上。
 */

export interface SpeakOptions {
  /** 词条 id，用于拼音频文件路径 */
  audioId?: string
  /** word = 单词音频，example = 例句音频 */
  kind?: 'word' | 'example'
  /** 用美式发音（只在词表里英美音标不同时才会有这个文件） */
  us?: boolean
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

function pickVoice(useUs: boolean): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) loadVoices()
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
  if (en.length === 0) return undefined
  // 优先挑 "增强 / 高级" 音质（macOS 上名字里带 Enhanced / Premium / Neural）
  const quality = en.filter((v) =>
    /enhanced|premium|neural|siri/i.test(v.name),
  )
  const prefer = useUs ? 'en-us' : 'en-gb'
  const pool = quality.length > 0 ? quality : en
  return (
    pool.find((v) => v.lang?.toLowerCase().replace('_', '-') === prefer) ??
    pool.find((v) => v.lang?.toLowerCase().replace('_', '-') === 'en-us') ??
    pool[0]
  )
}

// ---------- 预生成音频 ----------

const audioCache = new Map<string, HTMLAudioElement | null>()

function audioUrl(opts: SpeakOptions): string | null {
  if (!opts.audioId) return null
  const dir = opts.kind === 'example' ? 'examples' : 'words'
  const suffix = opts.us ? '-us' : ''
  return `./audio/${dir}/${opts.audioId}${suffix}.mp3`
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
  const v = pickVoice(opts.us ?? false)
  if (v) u.voice = v
  u.lang = v?.lang ?? 'en-US'

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
  const url = audioUrl(opts)
  if (url) {
    const el = await loadAudio(url)
    if (el) {
      let fired = false
      const finish = () => {
        if (fired) return
        fired = true
        opts.onEnd?.()
      }
      el.onended = finish
      el.onerror = () => {
        // 播放中途出错就换系统语音再读一遍
        speakWithSystem(text, opts)
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
  }
  speakWithSystem(text, opts)
}

/** 估算朗读时长，用于决定反馈展示的最短时间 */
export function estimateDuration(text: string, rate = 0.85) {
  return Math.max(1000, (text.length * 95) / rate + 500)
}
