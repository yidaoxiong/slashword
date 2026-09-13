import { create } from 'zustand'
import {
  api,
  clearSession,
  getStoredUsername,
  getToken,
  saveSession,
} from '../lib/api'
import { getRepo } from '../storage'
import type { Card, CheckinRecord, EngineConfig } from '../types'

const repo = getRepo()
const LOCAL_USER = 'local'

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

  async restore() {
    const token = getToken()
    const username = getStoredUsername()
    if (!token || !username) return
    try {
      await api.me()
      set({ status: 'authed', username })
      await get().sync()
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
    await get().sync()
  },

  async register(username, password) {
    set({ error: null })
    const res = await api.register(username, password)
    saveSession(res.token, res.username)
    set({ status: 'authed', username: res.username })
    await get().sync()
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
        const local = await repo.getCheckin(incoming.userId, incoming.date)
        if (!local || (incoming.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
          await repo.putCheckin(incoming)
        }
      }
      if (remote.config?.data) {
        const incoming = remote.config.data as EngineConfig
        const local = await repo.getConfig(LOCAL_USER)
        if (!local || (remote.config.updatedAt ?? 0) > 0) {
          await repo.putConfig(incoming)
        }
      }

      // ---- 本地 → 云端 ----
      const localCards = await repo.listCards(LOCAL_USER)
      const localLogs = await repo.listLogs(LOCAL_USER)
      const localCheckins = await repo.listCheckins(LOCAL_USER)
      const localConfig = await repo.getConfig(LOCAL_USER)

      await api.push({
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
        config: localConfig
          ? { data: localConfig, updatedAt: Date.now() }
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
