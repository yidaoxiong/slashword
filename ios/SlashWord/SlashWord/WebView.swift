import SwiftUI
import WebKit

/// 站点地址。登录 / 同步 / 存储全靠它带一个正常的 https 源 ——
/// 换成 file:// 的话 Origin 会是 null，跨域请求和 IndexedDB 都可能出问题。
private let siteURL = URL(string: "https://english-slashword.slashbro.top/")!

struct ContentView: View {
    @StateObject private var model = WebModel()

    var body: some View {
        ZStack {
            // 和网页 body 同一个底色（#f6f5fb），
            // 安全区露出来的那一条才不会显得是拼上去的
            Color(red: 0.965, green: 0.961, blue: 0.984).ignoresSafeArea()

            WebView(model: model)

            if model.state == .failed {
                OfflineView {
                    model.reload()
                }
            } else if model.state == .loading {
                LaunchView()
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.state)
    }
}

// MARK: - 加载状态

enum LoadState {
    case loading
    case loaded
    case failed
}

final class WebModel: NSObject, ObservableObject {
    @Published var state: LoadState = .loading

    let webView: WKWebView

    override init() {
        let config = WKWebViewConfiguration()
        // 关键：答完题会自动念一遍单词，属于"非用户触发"的播放。
        // 不把这项清空的话 iOS 会把它当成自动播放给拦掉，孩子听不到发音
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsInlineMediaPlayback = true
        // 用默认（持久化）的存储：学习进度、卡片全在 IndexedDB 里，
        // 用非持久化 store 的话每次冷启动都是空的
        config.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.965, green: 0.961, blue: 0.984, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        // 橡皮筋回弹在孩子手上容易把页面拖歪，关掉
        webView.scrollView.bounces = false
        // 禁止左右滑动前进后退：做题时误触会直接退出当前页，很崩溃
        webView.allowsBackForwardNavigationGestures = false

        super.init()
        webView.navigationDelegate = self
        load()
    }

    func load() {
        state = .loading
        webView.load(URLRequest(url: siteURL, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 20))
    }

    func reload() {
        load()
    }
}

extension WebModel: WKNavigationDelegate {
    /// 只放行本站和后端接口；别的一律交给 Safari，
    /// 免得在 app 里打开一个没有返回按钮的网页
    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else {
            decisionHandler(.allow)
            return
        }
        if isInternal(url) {
            decisionHandler(.allow)
            return
        }
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    private func isInternal(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "english-slashword.slashbro.top"
            || host.hasSuffix(".slashbro.top")
            || host.hasSuffix(".workers.dev")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        state = .loaded
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        showErrorIfReallyBroken(error)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        showErrorIfReallyBroken(error)
    }

    /// 有些错误是"页面内部的资源没加载上"，整个页面其实还能用，
    /// 这时候不能拿一张"没网了"的大图把正在做的题盖住
    private func showErrorIfReallyBroken(_ error: Error) {
        let code = (error as NSError).code
        let fatal: [Int] = [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorTimedOut,
            NSURLErrorDNSLookupFailed,
            NSURLErrorNetworkConnectionLost,
        ]
        if fatal.contains(code) {
            state = .failed
        }
    }
}

// MARK: - SwiftUI 包一层

struct WebView: UIViewRepresentable {
    @ObservedObject var model: WebModel

    func makeUIView(context: Context) -> WKWebView {
        model.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - 启动 / 断网时的界面

struct LaunchView: View {
    var body: some View {
        ZStack {
            Color(red: 0.965, green: 0.961, blue: 0.984).ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView()
                Text("正在准备词库…")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct OfflineView: View {
    let retry: () -> Void

    var body: some View {
        ZStack {
            Color(red: 0.965, green: 0.961, blue: 0.984).ignoresSafeArea()
            VStack(spacing: 18) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 44))
                    .foregroundStyle(Color(red: 0.44, green: 0.20, blue: 0.96))
                Text("连不上网了")
                    .font(.system(size: 18, weight: .medium))
                Text("背单词需要联网取词库和发音。\n连上 Wi-Fi 或蜂窝数据后重试。")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button(action: retry) {
                    Text("重试")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(width: 140, height: 44)
                        .background(Color(red: 0.44, green: 0.20, blue: 0.96))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, 32)
        }
    }
}
