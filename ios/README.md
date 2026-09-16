# 背单词 · iOS App

网页版套了一个原生壳。**只有一个 Swift 文件里的一个常量是"业务配置"** ——
站点地址 `WebView.swift` 顶部的 `siteURL`。网页一改，App 不用重新发版。

## 怎么装到自己手机上

前置：Mac 上装 Xcode（已装，26.6），iPhone 用数据线连上。

1. 打开工程
   ```bash
   open "ios/SlashWord/SlashWord.xcodeproj"
   ```
2. **填签名**（只做一次）
   - 左侧点 `SlashWord` 这个 target → `Signing & Capabilities`
   - 勾上 `Automatically manage signing`
   - `Team` 选你的 Apple ID
     - 没有的话：Xcode 菜单 → `Settings` → `Accounts` → `+` → 登录 Apple ID
     - **免费 Apple ID 就够**（见下面「免费 vs 付费」）
3. 顶部设备选你的 iPhone（不是模拟器）→ 按 ▶️ Run
4. 手机上会提示"不受信任的开发者"：
   `设置` → `通用` → `VPN 与设备管理` → 点你的 Apple ID → `信任`
5. 第一次装完就能用了，以后每次改代码重复第 3 步

### 免费 Apple ID vs 付费开发者账号

| | 免费 Apple ID | 付费（$99/年） |
|---|---|---|
| 装到自己手机 | ✅ | ✅ |
| 有效期 | **7 天**，到期重新 Run 一次 | 1 年 |
| 设备数 | 3 台 | 100 台 |
| 给别人装 | ❌ | ✅ TestFlight |
| 上架 App Store | ❌ | ✅ |

孩子天天用的东西，7 天要重签一次比较烦 —— 想省事就买个开发者账号。
**但今天先免费跑起来完全没问题。**

## 在模拟器里跑（不用手机、不用签名）

```bash
ios/SlashWord/tools/run-sim.sh          # 默认 iPhone 17 Pro
ios/SlashWord/tools/run-sim.sh "iPhone Air"
```

## 壳里做了什么

`SlashWord/` 就三个文件：

| 文件 | 干什么 |
|---|---|
| `App.swift` | 启动 + **把音频会话设成 playback** |
| `WebView.swift` | WKWebView 配置、离线兜底、外链跳 Safari |
| `Info.plist` | 显示名「背单词」、启动底色、版本号 |

三个值得说的地方：

**1. 静音键不再是问题（做原生壳最大的实际收益）**
Safari 和「添加到主屏幕」里，手机侧边的静音键一拨，网页的发音就没声了。
孩子那台 iPhone 常年静音 —— 一个背单词的 app 听不到发音等于废掉一半。
`AVAudioSession` 设成 `.playback` 之后，静音键对它无效。
来电打断之后会自动重新激活。

**2. 发音的自动播放**
答完题会自动念一遍单词，这在 iOS 里算"非用户触发的播放"，
`mediaTypesRequiringUserActionForPlayback = []` 放行。
不设这一项的话孩子听不到任何发音。

**3. 为什么加载线上地址，不是把网页打包进去**
打包进 App 用 `file://` 打开的话，页面 Origin 会变成 `null`：
- 登录 / 同步的跨域请求会被挡（后端在 Cloudflare Worker 上）
- IndexedDB 在 file:// 下也不可靠 —— 而学习进度全在里面

所以壳加载 `https://english-slashword.slashbro.top/`，存储、登录、同步、
发音全部和现在一样。断网时显示一个原生的"连不上网"页 + 重试按钮，
不会是一片白。

## 工程文件是生成的

`SlashWord.xcodeproj` 由脚本生成（手写 pbxproj 的 UUID 长度很容易写错）：

```bash
python3 ios/SlashWord/tools/gen_project.py
```

改 Swift 文件不需要重跑它；只有**加新文件**才要 ——
先往 `gen_project.py` 里加一条，再重新生成。
（其实也可以直接在 Xcode 里 Add Files，那样就不用管这个脚本了。）

## 其他

- Bundle ID：`top.slashbro.word`
- 最低系统：iOS 16
- 图标：品牌圆标，源图 `public/brand/slashbro-mark-512.png`
- 版本号跟 `package.json` 的 `MARKETING_VERSION` 走，改的时候两边一起改
