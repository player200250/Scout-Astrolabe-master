// desktopLayoutRules.js — Scout Desktop 卡片排列在 main process 這端的規則
//
// 排列本身（換位置、隱藏、補新卡）在 renderer 的 src/utils/desktopLayout.ts。
// main 只做兩件事：存之前檢查格式（Desktop 送來的一律不信），以及依列數調整視窗高度。
//
// 純函式、不 import electron，才能直接在 vitest 裡測。

export const LAYOUT_ID_MAX = 40
export const LAYOUT_LIST_MAX = 20
const ID_PATTERN = /^[a-z][a-z-]*$/

/** 每種列數的最小高度：2 列以下沿用 v1.5.0 的 420；3 列要 600 才放得下 5 行清單 */
export const MIN_HEIGHT_BY_ROWS = { 1: 420, 2: 420, 3: 600 }
/** 第一次排成 3 列時，視窗加高到這個高度（使用者之後自己調的大小照樣記住） */
export const GROW_HEIGHT_3_ROWS = 700

/** 只接受 { order: string[], hidden: string[] }，每個 id 是短的小寫字；不合格回 null */
export function sanitizeStoredLayout(raw) {
  if (!raw || typeof raw !== 'object') return null
  const clean = (list) => {
    if (!Array.isArray(list) || list.length > LAYOUT_LIST_MAX) return null
    if (!list.every(id => typeof id === 'string' && id.length <= LAYOUT_ID_MAX && ID_PATTERN.test(id))) return null
    return [...list]
  }
  const order = clean(raw.order)
  const hidden = clean(raw.hidden)
  if (!order || !hidden) return null
  return { version: 1, order, hidden }
}

/** 列數＝顯示中的卡（order 裡不在 hidden 的）兩張一列，1～3 列。沒存過＝預設 2×2 */
export function layoutRows(layout) {
  if (!layout) return 2
  const visible = layout.order.filter(id => !layout.hidden.includes(id)).length
  return Math.min(3, Math.max(1, Math.ceil(visible / 2)))
}

export function minHeightForRows(rows) {
  return MIN_HEIGHT_BY_ROWS[rows] ?? MIN_HEIGHT_BY_ROWS[2]
}

/**
 * 從 2 列以下變成 3 列、而且視窗比 GROW_HEIGHT_3_ROWS 矮 ⇒ 回傳加高後的 bounds；否則 null。
 * 加高不超出工作區：底部會超出就往上移，整個工作區都不夠高就只長到工作區高度。
 */
export function grownBounds(bounds, workArea, prevRows, nextRows) {
  if (nextRows < 3 || prevRows >= 3 || bounds.height >= GROW_HEIGHT_3_ROWS) return null
  const height = Math.min(GROW_HEIGHT_3_ROWS, workArea.height)
  if (height <= bounds.height) return null
  const bottom = workArea.y + workArea.height
  const y = Math.max(workArea.y, Math.min(bounds.y, bottom - height))
  return { x: bounds.x, y, width: bounds.width, height }
}
