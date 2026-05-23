import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Z_MODAL_BACKDROP, Z_MODAL } from '../constants'

interface TrashDialogProps {
    message: string
    subMessage?: string
    confirmLabel?: string
    onConfirm: () => void
    onCancel: () => void
    isDark: boolean
}

export function TrashDialog({
    message,
    subMessage = '你可以在垃圾桶中找回（14 天內）',
    confirmLabel = '移至垃圾桶',
    onConfirm,
    onCancel,
    isDark,
}: TrashDialogProps) {
    const confirmRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        confirmRef.current?.focus()
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
            if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onConfirm, onCancel])

    const bg     = isDark ? '#1e293b' : '#ffffff'
    const text   = isDark ? '#e2e8f0' : '#1a1a1a'
    const muted  = isDark ? '#94a3b8' : '#666'
    const border = isDark ? '#334155' : '#e5e7eb'

    return createPortal(
        <>
            <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: Z_MODAL_BACKDROP }}
                onClick={onCancel}
            />
            <div style={{
                position: 'fixed', top: '50%', left: '50%',
                transform: 'translate(-50%,-50%)',
                background: bg, borderRadius: 14, padding: '24px', width: 360,
                boxShadow: '0 8px 40px rgba(0,0,0,0.3)', zIndex: Z_MODAL,
                border: `1px solid ${border}`,
                display: 'flex', flexDirection: 'column', gap: 12,
            }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: text }}>{message}</div>
                <div style={{ fontSize: 13, color: muted }}>{subMessage}</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px', borderRadius: 8,
                            border: `1px solid ${border}`,
                            background: 'transparent', cursor: 'pointer',
                            fontSize: 13, color: muted,
                        }}
                    >
                        取消
                    </button>
                    <button
                        ref={confirmRef}
                        onClick={onConfirm}
                        style={{
                            padding: '8px 16px', borderRadius: 8, border: 'none',
                            background: '#dc2626', color: 'white',
                            cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </>,
        document.body
    )
}
