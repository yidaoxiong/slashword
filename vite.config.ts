import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

// 界面上要显示版本号：把 package.json 的版本、构建日期、commit 短号在
// 打包时烘进产物里。运行时读不到这些，只能构建时定死。
// commit 号是给自己看的 —— 手机上出问题时能一眼确认孩子用的是哪一版
function gitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

// base 用相对路径，方便部署到 Cloudflare Pages 的子路径或个人域名目录
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_HASH__: JSON.stringify(gitHash()),
  },
  build: {
    outDir: 'dist',
    // 不清空 dist：里面有 30MB 预生成的发音音频，每次全删全拷既慢又容易被
    // 当成危险操作拦下来。音频文件名由词条 id 决定，本身是幂等的，
    // 真要清就手动 rm -rf dist
    emptyOutDir: false,
  },
})
