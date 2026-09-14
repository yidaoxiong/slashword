import { create } from 'zustand'
import {
  api,
  clearSession,
  getStoredUsername,
  getToken,
  saveSession,
} from '../lib/api'
import { getRepo } from '../storage'
import type { Card, CheckinRecord, EngineConfig, UserBook } from '../types'

const repo = getRepo()

/** 未登录时数据挂在这个用户下。登出后回到它，未登录时的进度不会丢 */
export const LOCAL_USER = 'local'

/**
 * 当前生效的用户。
 *
 * 未登录是 'local'，登录后是用户名 —— 卡片、复习记录、打卡、配置、自制词库
 * 全部按它隔离。登出就回到 'local'，所以「登录前学的东西」一直都在，只是
 * 不属于任何账号。
 *
 * 这里不能反过来让 useAppStore 依赖它之外的东西：useAuthStore 不 import
 * useAppStore，靠 App 监听 username 变化去触发 init，避免循环依赖。
 */
export function getUserId(): string {
  return useAuthStore.getState().username ?? LOCAL_USER
}

type Status = 'guest' | 'authed'

interface AuthState {
  status: Status
  username: string | null
  syncing: boolean
  lastSyncAt: number | null
  error: string | null

  restore: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  sync: () => Promise<void>
}

/**
 * 同步策略：last-write-wins。
 * 先拉云端，逐条按 updatedAt 比大小合并进本地；再把本地推上去，
 * 云端同样按 updatedAt 决定要不要覆盖。
 * 一个人跨 Mac/PC/iPad 用，同一时刻只有一台设备在学，这个策略够用。
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'guest',
  username: null,
  syncing: false,
  lastSyncAt: null,
  error: null,

  /**
   * 只恢复身份，不同步。
   *
   * 同步必须等 useAppStore 切到这个用户之后再做 —— 否则会把未登录时
   * 'local' 那批数据当成当前账号的推上云端，等于把别人的进度灌进新账号。
   * 顺序由 App 控制：restore -> init(切用户) -> sync。
   */
  async restore() {
    const token = getToken()
    const username = getStoredUsername()
    if (!token || !username) return
    try {
      await api.me()
      set({ status: 'authed', username })
    } catch {
      clearSession()
      set({ status: 'guest', username: null })
    }
  },

  async login(username, password) {
    set({ error: null })
    const res = await api.login(username, password)
    saveSession(res.token, res.username)
    set({ status: 'authed', username: res.username })
  },

  async register(username, password) {
    set({ error: null })
    const res = await api.register(username, password)
    saveSession(res.token, res.username)
    set({ status: 'authed', username: res.username })
  },

  async logout() {
    try {
      await api.logout()
    } catch {
      // 网络失败也要退出本地，不拦着
    }
    clearSession()
    set({ status: 'guest', username: null, lastSyncAt: null })
  },

  async sync() {
    if (get().syncing) return
    set({ syncing: true, error: null })
    // 只同步当前账号的数据。切账号前必须先 init，否则会把上一个用户的记录推上去
    const userId = getUserId()
    try {
      const remote = await api.pull()

      // ---- 云端 → 本地 ----
      for (const item of remote.cards || []) {
        const incoming = item.data as Card
        const local = await repo.getCard(incoming.id)
        if (!local || (incoming.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
          await repo.putCard(incoming)
        }
      }
      for (const item of remote.checkins || []) {
        const incoming = item.data as CheckinRecord
        // 用当前 userId 查，不用 incoming.userId —— 云端返回的一定是这个账号的
        const local = await repo.getCheckin(userId, incoming.date)
        // 已完成的打卡优先级更高：别的设备打完了，本地这条还写着"没开始"的话，
        // 不能因为本地时间戳新就把它挡回去（和工作端的规则一致）
        const beatsLocal =
          !local ||
          (incoming.updatedAt ?? 0) > (local.updatedAt ?? 0) ||
          (incoming.completed && !local.completed)
        if (beatsLocal) {
          await repo.putCheckin(incoming)
        }
      }
      // 自制词库：整体 last-write-wins，谁新听谁的。
      // 墓碑（deleted）是"这本被删了"这个动作的载体，必须处理，
      // 否则在 A 设备删掉的词库，到 B 设备同步完又冒出来
      for (const item of remote.books || []) {
        const incoming = item.data as UserBook
        if (!incoming?.id) continue
        const local = await repo.getUserBook(incoming.id)
        const incomingNewer = !local || (item.updatedAt ?? 0) > (local.updatedAt ?? 0)
        if (!incomingNewer) continue

        if (item.deleted) {
          await repo.purgeUserBook(incoming.id)
        } else {
          await repo.putUserBook({ ...incoming, userId, updatedAt: item.updatedAt })
          // 词条也要跟着进本地库，不然切过去是空的
          await repo.importEntries(incoming.id, incoming.words ?? [])
        }
      }

      if (remote.config?.data) {
        const incoming = remote.config.data as EngineConfig
        const local = await repo.getConfig(userId)
        // 按 updatedAt 比，跟卡片/打卡一个规则。
        // 原来是 `(remote.config.updatedAt ?? 0) > 0` —— 只要云端有配置就无条件
        // 覆盖本地，等于每次同步把用户在本地改的设置（词书、每天新词数、口音）
        // 冲掉，换回云端的旧值
        if (!local || (remote.config.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
          await repo.putConfig({
            ...incoming,
            userId,
            updatedAt: remote.config.updatedAt ?? Date.now(),
          })
        }
      }

      // ---- 本地 → 云端 ----
      const localCards = await repo.listCards(userId)
      const localLogs = await repo.listLogs(userId)
      const localCheckins = await repo.listCheckins(userId)
      const localConfig = await repo.getConfig(userId)

      // 连墓碑一起推，删除才能传出去
      const localBooks = await repo.listAllUserBooks(userId)

      await api.push({
        books: localBooks.map((b) => ({
          id: b.id,
          data: b,
          updatedAt: b.updatedAt ?? 0,
          deleted: b.deleted === true,
        })),
        cards: localCards.map((c) => ({ id: c.id, data: c, updatedAt: c.updatedAt ?? 0 })),
        logs: localLogs.map((l) => ({
          id: `${l.cardId}:${l.reviewedAt}:${l.skill}`,
          data: l,
          createdAt: l.reviewedAt,
        })),
        checkins: localCheckins.map((c) => ({
          id: c.date,
          data: c,
          updatedAt: c.updatedAt ?? 0,
        })),
        // 用配置自己的 updatedAt，不能用 Date.now() ——
        // 否则每次同步都声称自己是最新，会把云端真正新的设置盖掉。
        // 本地真改过的话 setConfig 已经刷新过它了
        config: localConfig
          ? { data: localConfig, updatedAt: localConfig.updatedAt ?? Date.now() }
          : null,
      })

      set({ lastSyncAt: Date.now() })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '同步失败' })
    } finally {
      set({ syncing: false })
    }
  },
}))
