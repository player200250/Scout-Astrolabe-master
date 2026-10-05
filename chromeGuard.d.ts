// chromeGuard.js 的型別宣告（main.js 是純 JS；給 src/ 裡的 TS 測試用）
export declare const GUARD_FILE: string
export declare function chromeMajor(version: string | null | undefined): number | null
export declare function checkChromeDowngrade(storedVersion: string | null, currentVersion: string): {
    ok: boolean
    storedMajor: number | null
    currentMajor: number | null
    record: string
}
