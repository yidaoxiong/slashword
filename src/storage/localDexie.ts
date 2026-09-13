import Dexie, { type Table } from 'dexie'
import type {
  Card,
  CheckinRecord,
  EngineConfig,
  ReviewLog,
  UserBook,
  WordEntry,
} from '../types'
import type { Repository } from './repository'

class WordDatabase extends Dexie {
  entries!: Table<WordEntry, string>
  cards!: Table<Card, string>
  logs!: Table<ReviewLog, number>
  checkins!: Table<CheckinRecord, number>
  config!: Table<EngineConfig, string>
  userBooks!: Table<UserBook, string>

  constructor() {
    super('word-app')
    this.version(1).stores({
      entries: 'id, book, unit, unitOrder, lesson, [book+unitOrder]',
      cards: 'id, userId, wordKey, book, unit, due, [userId+due], [userId+book]',
      logs: '++id, userId, cardId, wordKey, reviewedAt, [userId+reviewedAt]',
      checkins: '++id, userId, date, [userId+date]',
      config: 'userId',
    })
    // v2：用户自己导入的词库。词条嵌在记录里，换设备/清缓存都不丢
    this.version(2).stores({
      userBooks: 'id, createdAt',
    })
  }
}

const db = new WordDatabase()

export class DexieRepository implements Repository {
  async importEntries(book: string, entries: WordEntry[]): Promise<void> {
    await db.transaction('rw', db.entries, async () => {
      await db.entries.where('book').equals(book).delete()
      await db.entries.bulkPut(entries)
    })
  }

  async clearEntries(book: string): Promise<void> {
    await db.entries.where('book').equals(book).delete()
  }

  getEntry(id: string) {
    return db.entries.get(id)
  }

  getEntries(ids: string[]) {
    return db.entries.bulkGet(ids).then((r) => r.filter(Boolean) as WordEntry[])
  }

  listEntries(book: string) {
    return db.entries.where('book').equals(book).toArray()
  }

  countEntries(book: string) {
    return db.entries.where('book').equals(book).count()
  }

  getCard(id: string) {
    return db.cards.get(id)
  }

  getCardByWordKey(userId: string, wordKey: string) {
    return db.cards.get(`${userId}:${wordKey}`)
  }

  putCard(card: Card) {
    return db.cards.put(card).then(() => undefined)
  }

  bulkPutCards(cards: Card[]) {
    return db.cards.bulkPut(cards).then(() => undefined)
  }

  listCards(userId: string) {
    return db.cards.where('userId').equals(userId).toArray()
  }

  listDueCards(userId: string, now: number, limit: number) {
    return db.cards
      .where('[userId+due]')
      .between([userId, Dexie.minKey], [userId, now])
      .limit(limit)
      .toArray()
  }

  appendLog(log: ReviewLog) {
    return db.logs.add(log).then(() => undefined)
  }

  listLogs(userId: string, since?: number) {
    if (since === undefined) {
      return db.logs.where('userId').equals(userId).toArray()
    }
    return db.logs
      .where('[userId+reviewedAt]')
      .between([userId, since], [userId, Dexie.maxKey])
      .toArray()
  }

  listLogsByCard(cardId: string) {
    return db.logs.where('cardId').equals(cardId).toArray()
  }

  getCheckin(userId: string, date: string) {
    return db.checkins.where('[userId+date]').equals([userId, date]).first()
  }

  putCheckin(record: CheckinRecord) {
    return db.checkins.put(record).then(() => undefined)
  }

  listCheckins(userId: string) {
    return db.checkins.where('userId').equals(userId).toArray()
  }

  getConfig(userId: string) {
    return db.config.get(userId)
  }

  putConfig(config: EngineConfig) {
    return db.config.put(config).then(() => undefined)
  }

  // ---- 用户导入的词库 ----

  putUserBook(book: UserBook) {
    return db.userBooks.put(book).then(() => undefined)
  }

  getUserBook(id: string) {
    return db.userBooks.get(id)
  }

  listUserBooks() {
    return db.userBooks.orderBy('createdAt').toArray()
  }

  async deleteUserBook(id: string): Promise<void> {
    await db.transaction('rw', db.userBooks, db.entries, async () => {
      await db.userBooks.delete(id)
      await db.entries.where('book').equals(id).delete()
    })
  }

  async resetProgress(userId: string): Promise<void> {
    await db.transaction('rw', db.cards, db.logs, db.checkins, async () => {
      await db.cards.where('userId').equals(userId).delete()
      await db.logs.where('userId').equals(userId).delete()
      await db.checkins.where('userId').equals(userId).delete()
    })
  }
}

export { db }
