/**
 * 构建时注入的常量，见 vite.config.ts 的 define。
 * 运行时不存在，所以类型要在这里声明清楚。
 */
declare const __APP_VERSION__: string
/** ISO 字符串，构建那一刻的时间 */
declare const __BUILD_TIME__: string
/** commit 短号，取不到时是空串 */
declare const __GIT_HASH__: string
