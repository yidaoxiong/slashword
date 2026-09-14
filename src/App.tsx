import { useEffect, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { useAuthStore } from './store/useAuthStore'
import { HomePage } from './pages/HomePage'
import { LearnPage } from './pages/LearnPage'
import { DonePage } from './pages/DonePage'
import { ParentPage } from './pages/ParentPage'
import { LoginPage } from './pages/LoginPage'
import { setVoice } from './lib/speech'
import { langOf, DEFAULT_ACCENT } from './core/lang'

type Tab = 'learn' | 'parent'

export default function App() {
  const { phase, init, refreshCatalog, error, config, catalog } = useAppStore()
  const { status, username, syncing, lastSyncAt, restore, sync } = useAuthStore()
  const [tab, setTab] = useState<Tab>('learn')
  const [view, setView] = useState<'main' | 'login'>('main')

  // 顺序不能反：先确定身份，再按身份加载数据，最后才同步。
  // 反过来会先把未登录那批数据当成新账号的推上云端（Ray 选的是「登录后从零开始」）
  useEffect(() => {
    void restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 身份一变（登录 / 登出 / 刷新后恢复会话）就整套重新加载，
  // 顺便把上一个用户的进度从界面上清掉，不留混在一起的观感
  useEffect(() => {
    void (async () => {
      await init()
      // 同步可能从别的设备拉到新词库，拉完要重算目录才会出现在列表里
      if (username) {
        await sync()
        await refreshCatalog()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  // 语言由当前词书决定，口音由用户配置决定 —— 一起下发给发音模块，
  // 这样各处 speak() 一个参数都不用传
  const lang = langOf(
    catalog.find((b) => b.id === config?.activeBook)?.lang,
  )
  useEffect(() => {
    setVoice(lang, config?.accent ?? DEFAULT_ACCENT[lang])
  }, [lang, config?.accent])

  // 学完一轮就同步一次，换设备能看到最新进度
  useEffect(() => {
    if (phase === 'done' && status === 'authed') {
      void sync().then(() => void refreshCatalog())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, status])

  if (view === 'login') {
    return <LoginPage onClose={() => setView('main')} />
  }

  const syncLabel = syncing
    ? '同步中…'
    : lastSyncAt
      ? `已同步 ${new Date(lastSyncAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
      : '点此管理账号'

  return (
    <div className="flex min-h-full flex-col">
      <button
        type="button"
        onClick={() => setView('login')}
        className={`w-full px-4 py-2 text-center text-[11px] ${
          status === 'authed'
            ? 'bg-ok-soft text-[#0f6e56]'
            : 'bg-amber-50 text-[#854f0b]'
        }`}
      >
        {status === 'authed'
          ? `${username} · ${syncLabel}`
          : '未登录 · 数据只存在本机，点击登录可多设备同步'}
      </button>

      <div className="flex-1 pb-20">
        {error && (
          <div className="mx-auto mt-6 max-w-md rounded-card bg-bad-soft px-4 py-3 text-[13px] text-[#a32d2d]">
            {error}
          </div>
        )}
        {!error && phase === 'loading' && (
          <div className="pt-24 text-center text-[13px] text-neutral-400">
            正在准备词库…
          </div>
        )}
        {!error && tab === 'learn' && phase === 'idle' && <HomePage />}
        {!error && tab === 'learn' && phase === 'learning' && <LearnPage />}
        {!error && tab === 'learn' && phase === 'done' && <DonePage />}
        {!error && tab === 'parent' && <ParentPage />}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-black/5 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          {(
            [
              ['learn', '学习'],
              ['parent', '家长'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`h-14 flex-1 text-[13px] ${
                tab === id ? 'font-medium text-brand-500' : 'text-neutral-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
