import SwiftUI
import AVFoundation

@main
struct SlashWordApp: App {
    init() {
        AudioSession.activate()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

/**
 * 发音不受静音键影响。
 *
 * 这条是做原生壳最大的实际好处：Safari 和「添加到主屏幕」里，
 * 手机侧边的静音键一拨，网页播放的音频就没声了。
 * 一个背单词的 app 听不到发音等于废掉一半 —— 而孩子手里那台
 * iPhone 常年是静音状态。
 *
 * .playback 分类会告诉系统：这个 app 的主要用途就是出声，
 * 于是静音键对它无效，后台/锁屏也继续播。
 */
enum AudioSession {
    static func activate() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            // 出错了也不能让 app 起不来，静音键影响发音而已
            print("[SlashWord] AVAudioSession 设置失败：\(error)")
        }

        // 来电、别的 app 抢走音频之后再还回来时，重新激活一次
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { note in
            guard
                let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                let type = AVAudioSession.InterruptionType(rawValue: raw),
                type == .ended
            else { return }
            try? AVAudioSession.sharedInstance().setActive(true)
        }
    }
}
