/**
 * 拼写判定。
 *
 * 抽出来单独放一个文件，是因为三条训练都要用，而且这类规则最容易出错 ——
 * 单独成文件才能写测试（scripts 下可以用 esbuild 直接跑）。
 */

/**
 * 比对前先归一：小写、去掉标点和空格。
 *
 * 注意不能写 [^a-z0-9] —— 那个正则会把西语的 ñ 和 á é í ó ú ü 整个删掉，
 * niño 会变成 nio，孩子再怎么拼都不可能对。用 \p{L}\p{N} 匹配所有语言的字母数字。
 */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** 去掉重音符号，只留字母骨架：niño -> nino、está -> esta */
export function foldAccents(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .normalize('NFC')
}

/**
 * 判定拼写。
 *
 * 西语里重音符号写错（esta vs está）非常常见，手机上打重音也确实麻烦。
 * 一律判错会让孩子反复受挫；一律判对又会养成不写重音的坏习惯。
 * 折中：字母骨架对就算过，但标记 accentOnly —— 上层据此提示一句，
 * 并按"半掌握"记（掌握度封顶 65）。
 */
export function checkSpelling(
  input: string,
  answer: string,
): { ok: boolean; accentOnly: boolean } {
  const a = normalize(input)
  const b = normalize(answer)
  if (a === b) return { ok: true, accentOnly: false }
  if (a !== '' && foldAccents(a) === foldAccents(b)) {
    return { ok: true, accentOnly: true }
  }
  return { ok: false, accentOnly: false }
}

/** 把例句里的目标词挖空，找不到就整句展示 */
export function blankOut(sentence: string, word: string) {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  if (!re.test(sentence)) return { text: sentence, blanked: false }
  return { text: sentence.replace(re, '________'), blanked: true }
}
