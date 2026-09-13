import type { Lang } from '../types'

/**
 * 语言与口音的中枢配置。
 *
 * 加一门新语言只要在这里加一项：口音选项、默认口音、语音名。
 * 其他地方（家长端口音开关、发音文件命名、音频生成脚本）都读这里。
 */
export interface AccentOption {
  id: string
  label: string
  /** Edge TTS 语音名，scripts/gen_audio.py 里要用完全一样的 */
  voice: string
}

export const ACCENTS: Record<Lang, AccentOption[]> = {
  en: [
    { id: 'uk', label: '英音 Sonia', voice: 'en-GB-SoniaNeural' },
    { id: 'us', label: '美音 Aria', voice: 'en-US-AriaNeural' },
  ],
  es: [
    { id: 'es-mx', label: '拉美 Dalia', voice: 'es-MX-DaliaNeural' },
    { id: 'es-es', label: '西班牙 Elvira', voice: 'es-ES-ElviraNeural' },
  ],
}

/**
 * 每门语言的默认口音。
 * 默认口音的音频文件**不带后缀**（{id}.mp3），其他口音带 -{accentId}。
 * 英语默认英音是历史包袱（最早只有英音），西语默认拉美是 Ray 选的。
 */
export const DEFAULT_ACCENT: Record<Lang, string> = {
  en: 'uk',
  es: 'es-mx',
}

export function langOf(v: string | undefined): Lang {
  return v === 'es' ? 'es' : 'en'
}

/** 取当前语言下合法的口音，配错或等于别语言的口音时退回默认 */
export function resolveAccent(lang: Lang, accent: string | undefined): string {
  if (accent && ACCENTS[lang].some((a) => a.id === accent)) return accent
  return DEFAULT_ACCENT[lang]
}

export const LANG_LABEL: Record<Lang, string> = {
  en: '英语',
  es: '西班牙语',
}

/** 西语要显示的特殊字符（屏幕键盘额外加一行） */
export const EXTRA_KEYS: Record<Lang, string[]> = {
  en: [],
  es: ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'],
}
