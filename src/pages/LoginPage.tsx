import { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

export function LoginPage({ onClose }: { onClose: () => void }) {
  const { login, register, logout, sync, status, username, syncing } = useAuthStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const submit = async () => {
    if (!name.trim() || !pass) return
    setBusy(true)
    setErr(null)
    try {
      if (mode === 'login') await login(name.trim(), pass)
      else await register(name.trim(), pass)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '出错了')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'authed') {
    const doLogout = async () => {
      // 先把这个账号的数据推上云端再退出，不然最后一段进度会丢
      await sync()
      await logout()
      setConfirmLogout(false)
      onClose()
    }

    return (
      <div className="mx-auto max-w-md px-5 py-10">
        <div className="rounded-card bg-ok-soft px-5 py-6 text-center">
          <div className="text-[16px] font-medium text-[#0f6e56]">
            已登录：{username}
          </div>
          <div className="mt-1 text-[13px] text-[#0f6e56]/70">
            换设备登录同一个账号，进度会自动同步
          </div>
        </div>

        {confirmLogout ? (
          <div className="mt-4 rounded-card bg-bad-soft p-4">
            <div className="text-[13px] leading-relaxed text-[#a32d2d]">
              退出后回到本机未登录的进度。这个账号在这里新学的进度会先同步到云端，
              不会丢。确定退出吗？
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void doLogout()}
                className="h-10 flex-1 rounded-lg bg-[#a32d2d] text-[13px] text-white"
              >
                退出登录
              </button>
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="h-10 flex-1 rounded-lg bg-white text-[13px] text-neutral-600 ring-1 ring-black/5"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="mt-4 h-11 w-full rounded-xl bg-white text-[14px] text-[#a32d2d] shadow-sm ring-1 ring-black/5"
          >
            退出登录
          </button>
        )}

        <button
          type="button"
          disabled={syncing}
          onClick={() => void sync()}
          className="mt-3 h-11 w-full rounded-xl bg-white text-[14px] text-neutral-700 shadow-sm ring-1 ring-black/5 disabled:opacity-40"
        >
          {syncing ? '同步中…' : '立即同步'}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 h-10 w-full text-[13px] text-neutral-400"
        >
          返回
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <div className="text-[20px] font-medium text-neutral-900">
        {mode === 'login' ? '登录' : '注册'}
      </div>
      <div className="mt-1 text-[13px] text-neutral-500">
        和 copilot.slashbro.top 用同一套账号，登录后在 Mac / PC / iPad 上进度同步
      </div>

      <div className="mt-6 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="用户名"
          autoCapitalize="none"
          autoCorrect="off"
          className="h-12 w-full rounded-xl bg-white px-4 text-[15px] ring-1 ring-black/5 outline-none focus:ring-brand-400"
        />
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          type="password"
          placeholder="密码"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          className="h-12 w-full rounded-xl bg-white px-4 text-[15px] ring-1 ring-black/5 outline-none focus:ring-brand-400"
        />
      </div>

      {err && (
        <div className="mt-3 rounded-lg bg-bad-soft px-4 py-2 text-[13px] text-[#a32d2d]">
          {err}
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-5 h-12 w-full rounded-xl bg-brand-500 text-[15px] font-medium text-white active:bg-brand-600 disabled:opacity-50"
      >
        {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login')
          setErr(null)
        }}
        className="mt-3 h-10 w-full text-[13px] text-neutral-500"
      >
        {mode === 'login' ? '还没有账号？去注册' : '已有账号？去登录'}
      </button>

      <button
        type="button"
        onClick={onClose}
        className="mt-2 h-10 w-full text-[13px] text-neutral-300"
      >
        先不登录，在本机使用
      </button>
    </div>
  )
}
