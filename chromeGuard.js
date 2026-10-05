// chromeGuard.js — 防止「用較舊的 Electron 開啟被較新版寫過的資料」（2026-10-05 事故）
//
// Chromium 的 IndexedDB 不支援降版：舊版 Chromium 打開新版寫過的資料庫時，會判定損毀、
// **整個刪掉重建**。這個 App 的白板全在 IndexedDB，重建＝本機資料全沒了（接著同步引擎還曾把
// 雲端一起清空，見 src/sync/tombstoneGuard.ts）。
//
// 做法：每次啟動把「用過的最高 Chromium 主版號」記在 userData；這次的版號比它低就拒絕啟動，
// 而且必須在**建立任何視窗之前**擋下——資料庫是 renderer 一開頁面就打開的。
//
// 純函式、不 import electron，才能直接在 vitest 裡測。

export const GUARD_FILE = 'chromium-version.json'

/** "152.0.7977.130" → 152；格式不對回 null */
export function chromeMajor(version) {
    const m = /^(\d+)\./.exec(String(version ?? ''))
    return m ? Number(m[1]) : null
}

/**
 * @param {string|null} storedVersion 檔案裡記的版本（沒有＝第一次跑）
 * @param {string} currentVersion process.versions.chrome
 * @returns {{ ok: boolean, storedMajor: number|null, currentMajor: number|null, record: string }}
 *   ok=false ⇒ 必須拒絕啟動；record＝應寫回檔案的版本（永遠保留較高者）
 */
export function checkChromeDowngrade(storedVersion, currentVersion) {
    const storedMajor = chromeMajor(storedVersion)
    const currentMajor = chromeMajor(currentVersion)
    if (storedMajor === null || currentMajor === null) {
        return { ok: true, storedMajor, currentMajor, record: currentVersion }
    }
    if (currentMajor < storedMajor) {
        return { ok: false, storedMajor, currentMajor, record: storedVersion }
    }
    return { ok: true, storedMajor, currentMajor, record: currentMajor > storedMajor ? currentVersion : storedVersion }
}
