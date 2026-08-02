// src/components/ui/ToastHost.tsx
// 非阻塞通知的渲染端（TD9）。由 App 掛載一次，訂閱 'ui-toast' 事件。
// 發送端見 utils/toast.ts 的 showToast()。
import { useEffect, useState, useCallback } from 'react'
import { onAppEvent } from '../../utils/appEvents'
import type { ToastKind } from '../../utils/toast'
import { Z_TOAST } from '../../constants'
import { T } from '../../theme/tokens'
import { Icon } from './icons'
import type { IconName } from './icons'

interface ToastItem {
    id: number
    message: string
    kind: ToastKind
    action?: { label: string; run: () => void }
}

/** 一般訊息 3.5 秒、錯誤 6 秒（錯誤通常要讀完＋可能想截圖回報）。 */
const DURATION: Record<ToastKind, number> = { info: 3500, success: 3500, error: 6000 }

const ICON: Record<ToastKind, IconName> = { info: 'toastInfo', success: 'done', error: 'toastError' }

const ACCENT: Record<ToastKind, string> = { info: T.accent, success: '#22c55e', error: T.danger }

let nextId = 1

export function ToastHost() {
    const [items, setItems] = useState<ToastItem[]>([])

    const dismiss = useCallback((id: number) => {
        setItems(prev => prev.filter(t => t.id !== id))
    }, [])

    useEffect(() => {
        return onAppEvent('ui-toast', ({ message, kind, action, durationMs }) => {
            const id = nextId++
            setItems(prev => [...prev, { id, message, kind, action }])
            // durationMs 明確傳 null＝不自動消失（需要使用者做決定的提示，例如同步衝突）
            const ms = durationMs === undefined ? DURATION[kind] : durationMs
            if (ms !== null) {
                setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), ms)
            }
        })
    }, [])

    if (items.length === 0) return null

    return (
        <div
            style={{
                position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                zIndex: Z_TOAST, display: 'flex', flexDirection: 'column', gap: 8,
                alignItems: 'center',
                // 只有 toast 本體吃點擊，容器放行——否則會擋住底下畫布的操作
                pointerEvents: 'none',
            }}
        >
            {items.map(t => (
                <div
                    key={t.id}
                    onClick={() => dismiss(t.id)}
                    title="點擊關閉"
                    style={{
                        pointerEvents: 'auto', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 9,
                        maxWidth: 460, padding: '10px 15px',
                        background: T.bgPanel, color: T.textPrimary,
                        border: `1px solid ${T.borderLight}`,
                        borderLeft: `3px solid ${ACCENT[t.kind]}`,
                        borderRadius: 9,
                        boxShadow: `${T.shadowLg}, 0 0 0 1px ${T.ringSubtle}`,
                        fontSize: 13, lineHeight: 1.5,
                        // 訊息可能帶換行（例如「已存為模板…\n按頂部…」），保留但仍可自動換行
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}
                >
                    {/* 圖示吃該語氣的 accent 色（與左側 3px 邊條同色）——三種語氣本來就靠
                        顏色分辨，這裡不是規則 1 要防的裝飾用色。 */}
                    <span style={{ flexShrink: 0, display: 'flex', color: ACCENT[t.kind] }}>
                        <Icon name={ICON[t.kind]} size="md" />
                    </span>
                    <span>{t.message}</span>
                    {t.action && (
                        <button
                            onClick={e => {
                                // 不讓點擊冒泡到外層的「點一下關閉」——否則關閉與動作會同時發生，
                                // 看起來沒差但動作若失敗就沒有 toast 可以顯示錯誤了
                                e.stopPropagation()
                                dismiss(t.id)
                                t.action!.run()
                            }}
                            style={{
                                flexShrink: 0, marginLeft: 4, padding: '4px 10px',
                                fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                                border: `1px solid ${ACCENT[t.kind]}`, background: 'transparent',
                                color: ACCENT[t.kind], fontFamily: 'inherit',
                            }}
                        >{t.action.label}</button>
                    )}
                </div>
            ))}
        </div>
    )
}
