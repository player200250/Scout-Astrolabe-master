import { useEffect, useRef, useState } from 'react'

interface QuickCaptureProps {
    onSave: (text: string) => void
    onClose: () => void
    isDark: boolean
}

const kbdStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '1px 5px',
    borderRadius: 4,
    fontSize: 10,
    fontFamily: 'monospace',
    border: '1px solid currentColor',
    opacity: 0.65,
}

export function QuickCapture({ onSave, onClose, isDark }: QuickCaptureProps) {
    const [text, setText] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        textareaRef.current?.focus()
    }, [])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                onClose()
            }
        }
        window.addEventListener('keydown', handler, true)
        return () => window.removeEventListener('keydown', handler, true)
    }, [onClose])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (text.trim()) onSave(text.trim())
        }
    }

    const bg = isDark ? '#1e293b' : '#ffffff'
    const border = isDark ? '#334155' : 'rgba(0,0,0,0.08)'
    const inputBg = isDark ? '#0f172a' : '#f8fafc'
    const inputColor = isDark ? '#e2e8f0' : '#0f172a'
    const inputBorder = isDark ? '#334155' : '#e2e8f0'
    const hintColor = isDark ? '#475569' : '#94a3b8'
    const titleColor = isDark ? '#94a3b8' : '#64748b'

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 99999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.45)',
            }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 480, borderRadius: 14,
                    background: bg,
                    border: `1px solid ${border}`,
                    boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
                    padding: '16px 18px 14px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                }}
            >
                <div style={{ fontSize: 13, fontWeight: 600, color: titleColor }}>
                    📥 快速新增到收件匣
                </div>
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="輸入任何想法、任務或筆記..."
                    rows={4}
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        border: `1.5px solid ${inputBorder}`,
                        borderRadius: 8, padding: '10px 12px',
                        fontSize: 15, lineHeight: 1.6,
                        background: inputBg, color: inputColor,
                        outline: 'none', resize: 'none',
                        fontFamily: 'inherit',
                        transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb' }}
                    onBlur={e => { e.currentTarget.style.borderColor = inputBorder }}
                />
                <div style={{ fontSize: 11.5, color: hintColor, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <span><kbd style={kbdStyle}>Enter</kbd> 儲存</span>
                    <span><kbd style={kbdStyle}>Shift+Enter</kbd> 換行</span>
                    <span><kbd style={kbdStyle}>Esc</kbd> 取消</span>
                </div>
            </div>
        </div>
    )
}
