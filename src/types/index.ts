/**
 * 数据模型
 *
 * 设计约束（来自"自用起步、预留产品化"的决策）：
 * 1. 所有用户相关记录都带 userId，当前固定为 'local'，将来接多用户不改结构。
 * 2. 复习记录是 append-only 事件流 —— 将来升级 FSRS 版本或换算法，
 *    可以拿历史事件重算每个人的复习曲线，而不是丢数据重来（Anki 的做法）。
 * 3. 静态词条（WordEntry）与用户学习状态（Card）严格分离：
 *    词条可随教材更新整体替换，不影响学习进度。
 * 4. 训练环节按四个技能维度记账（发音/拼写/例句/释义），
 *    这四维共同决定一次复习的评分，而不是笼统的"会/不会"。
 */

export type Skill = 'pron' | 'spell' | 'example' | 'definition'

export const SKILLS: Skill[] = ['pron', 'spell', 'example', 'definition']

export const SKILL_LABEL: Record<Skill, string> = {
  pron: '能发音',
  spell: '能拼写',
  example: '能看懂',
  definition: '能听懂',
}

/** 静态词条：来自词表，不含任何用户数据，可整体替换 */
export interface WordEntry {
  id: string
  word: string
  /** 词表里被剥掉的括号注释，如 "=mathematics, AmE math"、"pl. lives" */
  note: string
  phoneticUk: string
  phoneticUs: string
  pos: string
  cn: string
  exampleEn: string
  exampleCn: string
  book: string
  grade: string
  source: string
  unit: string
  unitOrder: number
  unitTitle: string
  lesson: string
  lessonOrder: number
  lessonTitle: string
  category: string
  /** 自然拼读切分，如 ['sh', 'ip']，由规则或 LLM 补 */
  phonics: string[]
  /** 儿童友好英英释义，由 LLM 补 */
  definitionEn: string
}

export interface BookMeta {
  id: string
  name: string
  grade: string
  source: string
  wordCount: number
  units: string[]
}

export interface Book {
  meta: BookMeta
  words: WordEntry[]
}

/**
 * 用户自己导入的词库。
 *
 * 词条直接嵌在记录里（而不是只存 meta）—— 这样换设备、清浏览器缓存、
 * 甚至同步到别的机器都不会丢。内置词库可以每次从 JSON 重新灌，自制的丢了就没了。
 */
export interface UserBook {
  id: string
  name: string
  grade: string
  source: string
  wordCount: number
  units: string[]
  words: WordEntry[]
  createdAt: number
  updatedAt: number
}

/** 四个技能维度的掌握度，0-100 */
export type Mastery = Record<Skill, number>

/** 学习卡：用户 × 单词 的学习状态。按 wordKey 归一，跨单元/多义词不会重复排程 */
export interface Card {
  id: string
  userId: string
  /** 归一 key：小写单词 + 义项序号 */
  wordKey: string
  display: string
  /** 关联词条 id 列表（同一词可能出现在多个单元/多个义项） */
  entryIds: string[]
  book: string
  unit: string
  unitOrder: number
  lesson: string
  lessonOrder: number

  /** FSRS 状态 */
  state: number
  due: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number

  mastery: Mastery
  createdAt: number
  lastReviewAt: number | null
  /** 最后修改时间，多设备同步时按它决定谁覆盖谁 */
  updatedAt: number
}

/** 一次技能训练的结果，append-only */
export interface ReviewLog {
  id?: number
  userId: string
  cardId: string
  wordKey: string
  reviewedAt: number
  skill: Skill
  correct: boolean
  /** 用户输入（拼写训练时是孩子敲出来的字符串） */
  input?: string
  durationMs: number
  /** FSRS 评分 1=Again 2=Hard 3=Good 4=Easy */
  rating: number
  /** 算法版本，便于日后重算 */
  schedulerVersion: string
}

/** 每日打卡 */
export interface CheckinRecord {
  id?: number
  userId: string
  /** YYYY-MM-DD */
  date: string
  newCount: number
  reviewCount: number
  durationSec: number
  completed: boolean
  completedAt: number | null
  updatedAt: number
}

/** 每日任务队列中的一项 */
export interface QueueItem {
  cardId: string
  entryId: string
  word: string
  isNew: boolean
}

/** 学习引擎配置（对应拓词那 20-30 项智能参数的核心部分） */
export interface EngineConfig {
  userId: string
  /** 每日新词上限 */
  dailyNewLimit: number
  /** 每日复习上限 */
  dailyReviewLimit: number
  /** 当前词书 */
  activeBook: string
  /**
   * 每本词书各自解锁了几个单元，key 是 bookId。
   * 不能直接用单元编号比较 —— 厚海的单元是 Unit 7~12，五上是 Unit One~Seven，
   * 编号体系完全不一样，只能按"这本词书的第几个单元"来算。
   */
  unitProgress: Record<string, number>
  /** 每个新词要走完的训练环节 */
  enabledSkills: Skill[]
  /** 拼写训练是否显示首字母提示 */
  spellHint: boolean
  /** 发音口音：uk = 英音（Sonia），us = 美音（Aria） */
  accent: 'uk' | 'us'
  /** 目标：真正记住 = 四维都达标 */
  masteryThreshold: number
}
