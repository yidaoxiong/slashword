import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base 用相对路径，方便部署到 Cloudflare Pages 的子路径或个人域名目录
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    // 不清空 dist：里面有 30MB 预生成的发音音频，每次全删全拷既慢又容易被
    // 当成危险操作拦下来。音频文件名由词条 id 决定，本身是幂等的，
    // 真要清就手动 rm -rf dist
    emptyOutDir: false,
  },
})
