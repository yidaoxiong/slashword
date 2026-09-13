#!/bin/bash
# 双击运行：启动背单词应用的本地服务，并自动打开浏览器。
# 关闭这个窗口就停止服务。

cd "$(dirname "$0")" || exit 1

# 依次找可用的 node（系统安装的优先，其次用 WorkBuddy 内置的）
NODE=""
for c in node /usr/local/bin/node /opt/homebrew/bin/node "/Users/ray/.workbuddy/binaries/node/versions/22.22.2-2/bin/node"; do
  if command -v "$c" >/dev/null 2>&1; then
    NODE="$(command -v "$c")"
    break
  fi
done

if [ -z "$NODE" ]; then
  echo ""
  echo "  没有找到 Node.js。"
  echo "  请到 https://nodejs.org 下载 LTS 版本安装（一路下一步），"
  echo "  装完之后重新双击本文件即可。"
  echo ""
  read -n 1 -s -r -p "  按任意键关闭…"
  echo ""
  exit 1
fi

export PATH="$(dirname "$NODE"):$PATH"
echo ""
echo "  使用 Node: $NODE"
echo "  首次运行请稍等几秒…"
echo ""

# 依赖没装过就先装
if [ ! -d "node_modules" ]; then
  echo "  正在安装依赖（第一次会比较慢）…"
  npm install
fi

# 等服务起来后自动开浏览器
( sleep 4; open "http://localhost:5173" ) &

npm run dev
