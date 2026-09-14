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

/** 词库语言。en = 英语，es = 西班牙语 */
export type Lang = 'en' | 'es'

/** 静态词条：来自词表，不含任何用户数据，可整体替换 */
export interface WordEntry {
  id: string
  word: string
  /** 词表里被剥掉的括号注释，如 "=mathematics, AmE math"、"pl. lives" */
  note: string
  phoneticUk: string
  phoneticUs: string
  /**
   * 西班牙语等有性的语言用：el / la。
   * 单独存而不拼进 word —— 拼写练习考的是词本身，冠词只在卡片上提示。
   */
  article?: string
  /** 词条所属语言。老词库没有这个字段，按 en 处理 */
  lang?: Lang
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
  lang?: Lang
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
  /**
   * 归属账号。未登录是 'local'。
   * 不同账号各自上传自己的词库，互相看不见 —— 内置词库是大家共有的，不受这个约束。
   */
  userId: string
  name: string
  grade: string
  source: string
  lang?: Lang
  wordCount: number
  units: string[]
  words: WordEntry[]
  createdAt: number
  updatedAt: number
  /**
   * 墓碑。删除时不清记录，而是打这个标记并把 words 清空 ——
   * 这样别的设备同步时才知道「这本被删了」，否则删掉的动作传不出去，
   * 换台设备它又冒出来了。界面上永远不显示墓碑。
   */
  deleted?: boolean
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
  /**
   * 当天打卡发出去的奖金（元）。存档用 —— 真正算钱在 core/reward.ts，
   * 规则改了可以整体重算，这个字段只是留个当时的凭据。
   */
  rewardYuan?: number
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
  /**
   * 发音口音。具体可选值由词库语言决定（见 core/lang.ts）：
   * 英语 uk / us，西语 es-mx（拉美）/ es-es（西班牙）。
   * 存成 string 是为了加语言时不用再改数据模型。
   */
  accent: string
  /**
   * 不想再看到的词书 id。
   *
   * 内置词库是从 data/*.json 每次 fetch 回来的，浏览器改不了源文件，
   * 所以"删除"只能是不让它出现在列表里（还能恢复）。
   * 自己导入的词库是真删除 —— 记录本身就存在本地。
   */
  hiddenBooks: string[]
  /** 目标：真正记住 = 四维都达标 */
  masteryThreshold: number
  /**
   * 同步冲突裁决的唯一依据（last-write-wins）。
   * setConfig 每次都会刷新它 —— 不刷的话本地改完永远是旧时间戳，
   * 推上去云端不收、拉下来又被云端旧配置盖掉。
   */
  updatedAt: number
}
