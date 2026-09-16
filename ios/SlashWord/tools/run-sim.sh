#!/bin/bash
# 编译并装到模拟器里跑起来。改完 Swift 代码用这个最快。
#
# 用法：ios/SlashWord/tools/run-sim.sh [模拟器名字]
set -euo pipefail

NAME="${1:-iPhone 17 Pro}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HERE/build/Debug-iphonesimulator/SlashWord.app"
BUNDLE_ID="top.slashbro.word"

echo "==> 编译（${NAME}）"
xcodebuild \
  -project "$HERE/SlashWord.xcodeproj" \
  -scheme SlashWord \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,name=$NAME" \
  -derivedDataPath "$HERE/build" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  build 2>&1 | grep -E "error:|warning:|BUILD" || true

[ -d "$APP" ] || { echo "编译产物不在，先看上面的报错"; exit 1; }

# 取一台这个名字的模拟器，没启动就启动
UDID=$(xcrun simctl list devices available | grep -A30 -- "-- iOS" | grep "$NAME (" | head -1 | grep -oE '[0-9A-F-]{36}')
if [ -z "$UDID" ]; then
  echo "找不到模拟器「${NAME}」。可用："
  xcrun simctl list devices available | grep -E "iPhone|iPad" | head -12
  exit 1
fi
xcrun simctl boot "$UDID" 2>/dev/null || true

echo "==> 安装到 ${UDID}"
xcrun simctl install "$UDID" "$APP"

echo "==> 启动"
xcrun simctl launch "$UDID" "$BUNDLE_ID"

echo
echo "跑起来了。要看界面就打开 Simulator app，或者："
echo "  xcrun simctl io ${UDID} screenshot /tmp/shot.png"
