// src/utils/snapPref.ts — 卡片磁吸的偏好（純函式，無 React、無 tldraw）
//
// 磁吸本身不需要自己實作：tldraw 的吸附引擎在 editor 層（SnapManager / BoundsSnaps），
// 而 CardShapeUtil 沒有覆寫 getBoundsSnapGeometry ⇒ 卡片預設就帶「四角＋中心」吸附點。
// 缺的只是開關——`<Tldraw hideUi={true}>` 把 tldraw 自己的偏好選單藏起來了，
// 使用者沒有地方打開它。所以這裡存的是「本 App 說了算」的那份偏好。
//
// ⚠️ 為什麼不直接靠 tldraw 自己的持久化：那是它的內部鍵與格式（實作細節，會變）；
// 而且每次切白板 <Tldraw> 都會重新掛載，我們需要一個能在掛載時明確套用的來源。

export const SNAP_STORAGE_KEY = 'whiteboard-snap'

/** 預設開啟：擺卡片多半是想對齊的，要的是「不用手動喬」而不是像素級自由。 */
export const SNAP_DEFAULT = true

/** 壞值／沒設定一律回預設——這是偏好不是資料，猜錯的代價只是一次點擊。 */
export function parseSnapPref(raw: string | null): boolean {
    if (raw === 'on') return true
    if (raw === 'off') return false
    return SNAP_DEFAULT
}

export function serializeSnapPref(on: boolean): string {
    return on ? 'on' : 'off'
}

export function loadSnapPref(): boolean {
    try {
        return parseSnapPref(localStorage.getItem(SNAP_STORAGE_KEY))
    } catch {
        return SNAP_DEFAULT
    }
}

export function saveSnapPref(on: boolean): void {
    try {
        localStorage.setItem(SNAP_STORAGE_KEY, serializeSnapPref(on))
    } catch {
        /* 隱私模式／配額滿：這輪有效就好，不值得為了記住一個開關中斷操作 */
    }
}

/** 「重新整理」排版時卡片之間的間距（px）。 */
export const TIDY_GAP = 24

/**
 * 決定「重新整理」要作用在哪些形狀。
 *
 * ⚠️⚠️ **沒選取時刻意不整理整塊板**。packShapes 會把所有東西重新打包成格狀，
 * 而這個 App 有好幾塊板的位置是有意義的——日誌板的卡片按日期由左到右排、
 * 作品集板照 Phase 分區——整塊板打包等於把那些排列洗掉。
 * 跟既有的對齊／均分一樣要求「先選 2 個以上」，行為一致也不會誤傷。
 */
export function resolveTidyTargets(selectedIds: readonly string[]): string[] | null {
    return selectedIds.length >= 2 ? [...selectedIds] : null
}
