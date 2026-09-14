import type {
  Card,
  CheckinRecord,
  EngineConfig,
  ReviewLog,
  UserBook,
  WordEntry,
} from '../types'

/**
 * 存储抽象层。
 *
 * 现在只有 Dexie（IndexedDB）一个实现，将来要换成 Cloudflare D1 / Supabase
 * 做多端同步时，只要再写一个实现并替换 factory，UI 与业务代码一行都不用改。
 */
export interface Repository {
  // ---- 词条（静态内容，可整体导入替换）----
  importEntries(book: string, entries: WordEntry[]): Promise<void>
  clearEntries(book: string): Promise<void>
  getEntry(id: string): Promise<WordEntry | undefined>
  getEntries(ids: string[]): Promise<WordEntry[]>
  listEntries(book: string): Promise<WordEntry[]>
  countEntries(book: string): Promise<number>
  /** 从自制词库里挑着删词条时用 */
  deleteEntries(ids: string[]): Promise<void>

  // ---- 用户自己导入的词库（词条嵌在记录里，跨设备不丢）----
  putUserBook(book: UserBook): Promise<void>
  getUserBook(id: string): Promise<UserBook | undefined>
  /** 只列这个账号没被删的词库 */
  listUserBooks(userId: string): Promise<UserBook[]>
  /** 同步用：连墓碑一起，否则"删除"传不到别的设备 */
  listAllUserBooks(userId: string): Promise<UserBook[]>
  /** 删成墓碑（不真删），词条一并清掉 */
  deleteUserBook(id: string): Promise<void>
  /** 真删：收到别处传来的墓碑时调用 */
  purgeUserBook(id: string): Promise<void>

  // ---- 学习卡 ----
  getCard(id: string): Promise<Card | undefined>
  getCardByWordKey(userId: string, wordKey: string): Promise<Card | undefined>
  putCard(card: Card): Promise<void>
  bulkPutCards(cards: Card[]): Promise<void>
  listCards(userId: string): Promise<Card[]>
  /** 删掉词条后清掉没人再引用的卡片 */
  deleteCards(ids: string[]): Promise<void>
  listDueCards(userId: string, now: number, limit: number): Promise<Card[]>

  // ---- 复习事件流（append-only，只增不改不删）----
  appendLog(log: ReviewLog): Promise<void>
  listLogs(userId: string, since?: number): Promise<ReviewLog[]>
  listLogsByCard(cardId: string): Promise<ReviewLog[]>

  // ---- 打卡 ----
  getCheckin(userId: string, date: string): Promise<CheckinRecord | undefined>
  putCheckin(record: CheckinRecord): Promise<void>
  listCheckins(userId: string): Promise<CheckinRecord[]>

  // ---- 配置 ----
  getConfig(userId: string): Promise<EngineConfig | undefined>
  putConfig(config: EngineConfig): Promise<void>

  /** 清空某个用户的全部学习记录（卡片、复习事件、打卡），词库保留 */
  resetProgress(userId: string): Promise<void>
}
