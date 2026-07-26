// src/components/ui/PromptHost.tsx
// 命名對話框的渲染端（TD9）。由 App 掛載一次，訂閱 'ui-prompt' 事件。
// 發送端見 utils/promptName.ts 的 promptName()——那是 Electron 無 window.prompt 的替代品。
import { useEffect, useRef, useState } from 'react'
import { onAppEvent } from '../../utils/appEvents'
import { Z_MODAL_BACKDROP, Z_MODAL } from '../../constants'
import { T } from '../../theme/tokens'

interface PendingPrompt {
    title: string
    defaultValue: string
    placeholder?: string
    confirmLabel?: string
    resolve: (value: string | null) => void
}

export function PromptHost() {
    const [pending, setPending] = useState<PendingPrompt | null>(null)
    const [value, setValue] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        return onAppEvent('ui-prompt', detail => {
            setPending(detail)
            setValue(detail.defaultValue)
        })
    }, [])

    useEffect(() => {
        if (!pending) return
        // 命名情境幾乎都是「改寫預設值」→ 全選讓使用者直接打字覆蓋
        inputRef.current?.focus()
        inputRef.current?.select()
    }, [pending])

    if (!pending) return null

    const finish = (result: string | null) => {
        pending.resolve(result)
        setPending(null)
    }
    const confirm = () => {
        const trimmed = value.trim()
        finish(trimmed === '' ? null : trimmed)
    }

    return (
        <>
            <div
                onClick={() => finish(null)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: Z_MODAL_BACKDROP }}
            />
            <div
                style={{
                    position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)',
                    width: 380, maxWidth: '92vw', zIndex: Z_MODAL,
                    background: T.bgPanel, borderRadius: 12, padding: '18px 20px 16px',
                    boxShadow: `${T.shadowModal}, 0 0 0 1px ${T.ringSubtle}`,
                }}
                // 這個 modal 常在 tldraw 畫布上開啟；不擋住的話按鍵會被畫布的全域快捷鍵吃掉
                onKeyDown={e => e.stopPropagation()}
            >
                <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, marginBottom: 12 }}>
                    {pending.title}
                </div>
                <input
                    ref={inputRef}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={pending.placeholder}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); confirm() }
                        if (e.key === 'Escape') { e.preventDefault(); finish(null) }
                    }}
                    style={{
                        width: '100%', boxSizing: 'border-box', padding: '8px 11px',
                        fontSize: 13, fontFamily: 'inherit',
                        border: `1.5px solid ${T.accent}`, borderRadius: 8,
                        background: T.bgApp, color: T.textPrimary, outline: 'none',
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                    <button
                        onClick={() => finish(null)}
                        style={{
                            padding: '7px 14px', fontSize: 13, borderRadius: 7, cursor: 'pointer',
                            border: `1px solid ${T.borderLight}`, background: 'transparent', color: T.textSecondary,
                        }}
                    >取消</button>
                    <button
                        onClick={confirm}
                        disabled={value.trim() === ''}
                        style={{
                            padding: '7px 14px', fontSize: 13, borderRadius: 7,
                            cursor: value.trim() === '' ? 'not-allowed' : 'pointer',
                            border: 'none', background: T.accent, color: T.textOnActive,
                            fontWeight: 600, opacity: value.trim() === '' ? 0.5 : 1,
                        }}
                    >{pending.confirmLabel ?? '確定'}</button>
                </div>
            </div>
        </>
    )
}
