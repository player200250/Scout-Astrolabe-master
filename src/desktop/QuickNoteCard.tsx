// src/desktop/QuickNoteCard.tsx — 右下：快速筆記 → 收件匣
//
// 走跟 Ctrl+Shift+Space 同一條路（主視窗的 handleAddCardToInbox）。
// 主視窗回 ok 才清空：沒就緒時文字留著，使用者不會白打。

import { useEffect, useState } from 'react'
import { DESKTOP_NOTE_MAX } from '../utils/desktopSummary'
import { sendDesktopCommand } from './useDesktopSummary'

type Status = 'idle' | 'sending' | 'sent' | 'failed'

export function QuickNoteCard({ connected }: { connected: boolean }) {
    const [text, setText] = useState('')
    const [status, setStatus] = useState<Status>('idle')

    useEffect(() => {
        if (status !== 'sent') return
        const id = setTimeout(() => setStatus('idle'), 2000)
        return () => clearTimeout(id)
    }, [status])

    const canSend = connected && status !== 'sending' && text.trim().length > 0

    const send = async () => {
        if (!canSend) return
        setStatus('sending')
        const res = await sendDesktopCommand({ type: 'quick-capture', text: text.trim() })
        if (res.ok) { setText(''); setStatus('sent') }
        else setStatus('failed')
    }

    const message = status === 'sent' ? '已送到收件匣'
        : status === 'failed' ? 'Scout 尚未就緒，文字已保留'
        : !connected ? '等待 Scout…'
        : 'Ctrl+Enter 送出'

    return (
        <section className="dt-card dt-note">
            <div className="dt-card-title">快速筆記</div>
            <textarea
                className="dt-textarea"
                value={text}
                maxLength={DESKTOP_NOTE_MAX}
                placeholder="想到什麼先記下來…"
                onChange={e => { setText(e.target.value); if (status === 'failed') setStatus('idle') }}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() } }}
            />
            <div className="dt-note-footer">
                <span className={status === 'failed' ? 'dt-hint dt-hint-error' : 'dt-hint'}>{message}</span>
                <button className="dt-button dt-button-primary" disabled={!canSend} onClick={() => void send()}>送出</button>
            </div>
        </section>
    )
}
