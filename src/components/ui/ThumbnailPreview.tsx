import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { T } from '../../theme/tokens'

/**
 * 白板縮圖的懸停放大預覽（roadmap B4）。
 *
 * 側邊欄的縮圖只有 20×14px，實際上分辨不出哪塊板是哪塊；這裡用**已經存在的**
 * `board.thumbnail`（base64 PNG）放大顯示，不重新渲染白板、不多讀一次 IndexedDB。
 *
 * 兩個延遲是刻意的：進場 250ms 避免滑鼠只是「掃過」清單就閃一堆浮層；
 * 離場 150ms 讓連續在相鄰白板間移動時預覽是「換內容」而不是「消失再出現」。
 *
 * 浮層 portal 到 body 並且 `pointerEvents: 'none'`——側邊欄那排項目是可點的，
 * 預覽絕不能擋住點擊（B4 的驗收標準就寫著不可影響切換白板）。
 */
const SHOW_DELAY_MS = 250
const HIDE_DELAY_MS = 150
const PREVIEW_W = 240
const PREVIEW_H = 180
const GAP = 12
const MARGIN = 8

interface PreviewState {
    src: string
    name: string
    left: number
    top: number
}

export function placeNear(rect: DOMRect): { left: number; top: number } {
    // 側邊欄在畫面右側，所以優先放左邊；左邊放不下才翻到右邊。
    const leftSide = rect.left - PREVIEW_W - GAP
    const left = leftSide >= MARGIN ? leftSide : Math.min(rect.right + GAP, window.innerWidth - PREVIEW_W - MARGIN)
    const wanted = rect.top + rect.height / 2 - PREVIEW_H / 2
    const top = Math.max(MARGIN, Math.min(wanted, window.innerHeight - PREVIEW_H - MARGIN))
    return { left: Math.max(MARGIN, left), top }
}

export function useThumbnailPreview() {
    const [preview, setPreview] = useState<PreviewState | null>(null)
    const showTimer = useRef<number | null>(null)
    const hideTimer = useRef<number | null>(null)

    const clearTimers = useCallback(() => {
        if (showTimer.current != null) { window.clearTimeout(showTimer.current); showTimer.current = null }
        if (hideTimer.current != null) { window.clearTimeout(hideTimer.current); hideTimer.current = null }
    }, [])

    // 元件收掉時還有 timer 在跑 → setState on unmounted。清掉。
    useEffect(() => clearTimers, [clearTimers])

    /** 綁到縮圖容器上。thumbnail 不是點陣圖（舊的 SVG 佔位／null）就整個不啟用。 */
    const bindPreview = useCallback((thumbnail: string | null | undefined, name: string) => {
        if (!thumbnail || !thumbnail.startsWith('data:image')) return {}
        return {
            onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
                const rect = e.currentTarget.getBoundingClientRect()
                clearTimers()
                showTimer.current = window.setTimeout(() => {
                    setPreview({ src: thumbnail, name, ...placeNear(rect) })
                }, SHOW_DELAY_MS)
            },
            onMouseLeave: () => {
                clearTimers()
                hideTimer.current = window.setTimeout(() => setPreview(null), HIDE_DELAY_MS)
            },
        }
    }, [clearTimers])

    const previewNode = preview && typeof document !== 'undefined'
        ? createPortal(
            <div style={{
                position: 'fixed', left: preview.left, top: preview.top,
                width: PREVIEW_W, zIndex: 30000, pointerEvents: 'none',
                background: T.bgPanel, border: `1px solid ${T.borderLight}`,
                borderRadius: 10, boxShadow: T.shadowLg, overflow: 'hidden',
            }}>
                <img
                    src={preview.src}
                    alt=""
                    style={{ display: 'block', width: '100%', height: PREVIEW_H, objectFit: 'cover', background: T.bgHover }}
                />
                <div style={{
                    padding: '6px 10px', fontSize: 12, color: T.textPrimary,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{preview.name}</div>
            </div>,
            document.body,
        )
        : null

    return { bindPreview, previewNode }
}
