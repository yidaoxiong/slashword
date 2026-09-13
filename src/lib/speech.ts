/**
 * 发音。
 * MVP 用系统内置的 Web Speech API，零成本、离线可用（iOS Safari 的 en 语音是内置的）。
 * 将来要真人音质再换成云端 TTS 或预置音频文件，只要换这一个模块。
 */

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
  const prefer = useUs ? 'en-us' : 'en-gb'
  return (
    en.find((v) => v.lang?.toLowerCase().replace('_', '-') === prefer) ??
    en.find((v) => v.lang?.toLowerCase().replace('_', '-') === 'en-us') ??
    en[0]
  )
}

export function speak(
  text: string,
  opts?: { rate?: number; us?: boolean; onEnd?: () => void },
) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    opts?.onEnd?.()
    return
  }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = opts?.rate ?? 0.8
  u.pitch = 1.05
  const v = pickVoice(opts?.us ?? false)
  if (v) u.voice = v
  u.lang = v?.lang ?? 'en-US'

  let fired = false
  const done = () => {
    if (fired) return
    fired = true
    opts?.onEnd?.()
  }
  u.onend = done
  u.onerror = done
  window.speechSynthesis.speak(u)

  // iOS Safari 偶尔不触发 onend，按字数估算一个兜底时长，避免界面卡住
  const rate = opts?.rate ?? 0.8
  const estimated = Math.max(1200, (text.length * 95) / rate + 700)
  window.setTimeout(done, estimated)
}

/** 估算一段文本朗读完大概要多久，用于决定反馈展示的最短时间 */
export function estimateDuration(text: string, rate = 0.8) {
  return Math.max(1000, (text.length * 95) / rate + 500)
}
