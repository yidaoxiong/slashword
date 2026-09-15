/**
 * 页脚：slashbro 标识 + 版本号。
 *
 * 版本号是给排查用的 —— 孩子在手机上出的问题，先问一句"页脚写的哪一版"，
 * 就知道他跑的是不是最新代码，省掉一轮来回猜。
 */
export function SiteFooter({ tone = 'light' }: { tone?: 'light' | 'muted' }) {
  const d = new Date(__BUILD_TIME__)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-neutral-400">by</span>
        <img
          src="./brand/slashbro-lockup.png"
          alt="slashbro"
          className="h-[18px] w-auto opacity-80"
        />
      </div>
      <div
        className={`text-[10px] tabular-nums ${
          tone === 'light' ? 'text-neutral-400' : 'text-neutral-500'
        }`}
      >
        v{__APP_VERSION__} · {stamp}
        {__GIT_HASH__ ? ` · ${__GIT_HASH__}` : ''}
      </div>
    </div>
  )
}
