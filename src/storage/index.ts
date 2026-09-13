import { DexieRepository } from './localDexie'
import type { Repository } from './repository'

/**
 * 仓储工厂。
 * 现在返回 IndexedDB 实现；将来要做多端同步，只要在这里换成
 * CloudflareRepository / SupabaseRepository，业务层不用动。
 */
let instance: Repository | null = null

export function getRepo(): Repository {
  if (!instance) {
    instance = new DexieRepository()
  }
  return instance
}

export type { Repository }
