// loginStartup.js 的型別宣告（main.js 是純 JS；給 src/ 裡的 TS 測試用）
export declare const LOGIN_ARG: string
export declare function launchedAtLogin(argv: readonly string[]): boolean
export declare function startHidden(s: { atLogin: boolean; hasTray: boolean; minimizeToTray: boolean }): boolean
export declare function loginItemOptions(execPath: string): { path: string; args: string[] }
