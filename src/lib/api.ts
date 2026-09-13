/**
 * 后端接口。
 *
 * 直接指向 Worker 自己的域名，不走同源 /api ——
 * 这样就不需要在 Cloudflare 配 Workers 路由（/api/* → worker），
 * 换个域名部署也能直接用。Worker 已开放 CORS，跨域没问题。
 * 将来若想走同源，把这里改成 '/api' 并在 Cloudflare 加一条 Workers 路由即可。
 */
export const API_BASE = import.meta.env.VITE_API_BASE
  ?? 'https://slashword-api.ray-lee.workers.dev/api'

const TOKEN_KEY = 'slashword.token'
const USER_KEY = 'slashword.username'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USER_KEY)
}

export function saveSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, username)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `请求失败（${res.status}）`
    throw new Error(msg)
  }
  return data
}

export interface SyncPayload {
  cards: { id: string; data: unknown; updatedAt: number }[]
  logs: { id: string; data: unknown; createdAt: number }[]
  checkins: { id: string; data: unknown; updatedAt: number }[]
  config: { data: unknown; updatedAt: number } | null
}

export const api = {
  register: (username: string, password: string) =>
    request('/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }) as Promise<{ token: string; username: string }>,

  login: (username: string, password: string) =>
    request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }) as Promise<{ token: string; username: string }>,

  logout: () => request('/logout', { method: 'POST' }) as Promise<{ ok: boolean }>,

  me: () => request('/me') as Promise<{ username: string }>,

  pull: () =>
    request('/sync') as Promise<{
      cards: { id: string; data: unknown; updatedAt: number }[]
      logs: { id: string; data: unknown; createdAt: number }[]
      checkins: { id: string; data: unknown; updatedAt: number }[]
      config: { data: unknown; updatedAt: number } | null
      serverTime: number
    }>,

  push: (payload: SyncPayload) =>
    request('/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ ok: boolean; saved: number }>,
}
