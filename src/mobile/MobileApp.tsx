// src/mobile/MobileApp.tsx
// 手機速記 PWA 的畫面（S1）。
//
// 範圍刻意極小：**登入 → 打字 → 送出 → 進桌機收件匣**。沒有畫布、沒有白板清單、
// 不能編輯既有卡片（那是 S2 / S3）。理由是最高頻的痛點只有一個：
// 「人在外面想記一下」，而那件事最怕的是流程長、開得慢。
import { useState, useEffect, useCallback, useRef } from 'react'
import { loadSyncConfig, saveSyncConfig, isSyncConfigured, type SyncConfig } from '../sync/syncConfig'
import { signIn, signOut, getCurrentSession } from '../sync/supabaseClient'
import { enqueueNote, flushOutbox, loadOutbox, type OutboxNote } from './mobileCapture'

type Screen = 'capture' | 'settings'

export function MobileApp() {
    const [screen, setScreen] = useState<Screen>('capture')
    const [config, setConfig] = useState<SyncConfig>(() => loadSyncConfig())
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [checkingSession, setCheckingSession] = useState(true)
    const [text, setText] = useState('')
    const [outbox, setOutbox] = useState<OutboxNote[]>(() => loadOutbox())
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const configured = isSyncConfigured(config)

    const notify = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
        setMessage({ text, kind })
        setTimeout(() => setMessage(null), 3000)
    }, [])

    // 開啟時先看 session 還在不在（persistSession 存 localStorage，不必每次重登）
    useEffect(() => {
        let alive = true
        getCurrentSession()
            .then(s => { if (alive) setUserEmail(s?.user.email ?? null) })
            .catch(() => { /* 沒設定 */ })
            .finally(() => { if (alive) setCheckingSession(false) })
        return () => { alive = false }
    }, [])

    const flush = useCallback(async (silent = false) => {
        if (loadOutbox().length === 0) return
        setBusy(true)
        const res = await flushOutbox()
        setBusy(false)
        setOutbox(loadOutbox())
        if (res.ok && res.sent > 0) notify(`已送出 ${res.sent} 則到收件匣`)
        else if (!res.ok && !silent) notify(res.error ?? '送出失敗，已留在本機', 'err')
    }, [notify])

    // 一開啟就把上次沒送成功的補送；恢復連線時也補一次。
    // silent＝失敗時不吵使用者（多半就是還沒有訊號），東西還在 outbox 不會掉。
    useEffect(() => {
        if (!userEmail) return
        void flush(true)
        const onOnline = () => { void flush(true) }
        window.addEventListener('online', onOnline)
        return () => window.removeEventListener('online', onOnline)
    }, [userEmail, flush])

    const handleSubmit = useCallback(async () => {
        const trimmed = text.trim()
        if (!trimmed) return
        // 先落地再送——這一行是整個 App 的重點，送不出去也絕不弄丟
        enqueueNote(trimmed)
        setText('')
        setOutbox(loadOutbox())
        inputRef.current?.focus()
        await flush()
    }, [text, flush])

    const handleSignIn = useCallback(async () => {
        setBusy(true)
        saveSyncConfig(config)
        setConfig(loadSyncConfig())
        const res = await signIn(email.trim(), password)
        setBusy(false)
        if (!res.ok) { notify(res.error ?? '登入失敗', 'err'); return }
        setUserEmail(res.session?.user.email ?? email.trim())
        setPassword('')
        setScreen('capture')
        notify('已登入')
    }, [config, email, password, notify])

    const handleSignOut = useCallback(async () => {
        await signOut()
        setUserEmail(null)
        notify('已登出')
    }, [notify])

    // ── 設定／登入畫面 ───────────────────────────────────────────────────────
    if (checkingSession) {
        return <div className="center muted">載入中…</div>
    }

    if (!userEmail || screen === 'settings') {
        return (
            <div className="screen">
                <header className="bar">
                    <span className="title">☁️ 連線設定</span>
                    {userEmail && <button className="ghost" onClick={() => setScreen('capture')}>完成</button>}
                </header>

                <div className="pad">
                    <p className="muted small">
                        填桌機版同一組 Supabase 設定（後台 <b>Project Settings → API</b>），
                        再用同一個帳號登入，速記就會進到桌機的收件匣。
                    </p>

                    <label className="label">Project URL</label>
                    <input
                        className="input" inputMode="url" autoCapitalize="off" autoCorrect="off"
                        placeholder="https://xxxxx.supabase.co"
                        value={config.url} onChange={e => setConfig(c => ({ ...c, url: e.target.value }))}
                    />

                    <label className="label">anon (public) key</label>
                    <input
                        className="input mono" autoCapitalize="off" autoCorrect="off"
                        placeholder="eyJhbGciOiJIUzI1NiIs..."
                        value={config.anonKey} onChange={e => setConfig(c => ({ ...c, anonKey: e.target.value }))}
                    />

                    {userEmail ? (
                        <div className="row">
                            <span className="grow small">✅ {userEmail}</span>
                            <button className="ghost" onClick={() => void handleSignOut()}>登出</button>
                        </div>
                    ) : (
                        <>
                            <label className="label">Email</label>
                            <input
                                className="input" type="email" inputMode="email"
                                autoCapitalize="off" autoCorrect="off"
                                value={email} onChange={e => setEmail(e.target.value)}
                            />

                            <label className="label">密碼</label>
                            <input
                                className="input" type="password"
                                value={password} onChange={e => setPassword(e.target.value)}
                            />

                            <button
                                className="primary block" disabled={!configured || busy}
                                onClick={() => void handleSignIn()}
                            >{busy ? '登入中…' : '登入'}</button>
                        </>
                    )}
                </div>

                {message && <div className={`toast ${message.kind}`}>{message.text}</div>}
            </div>
        )
    }

    // ── 速記畫面 ─────────────────────────────────────────────────────────────
    return (
        <div className="screen">
            <header className="bar">
                <span className="title">📥 速記</span>
                {outbox.length > 0 && <span className="badge">{outbox.length} 待送</span>}
                <button className="ghost" onClick={() => setScreen('settings')}>設定</button>
            </header>

            <div className="pad grow-col">
                <textarea
                    ref={inputRef}
                    className="note"
                    placeholder="想到什麼就打進來…"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    autoFocus
                />
                <button
                    className="primary block big"
                    disabled={!text.trim() || busy}
                    onClick={() => void handleSubmit()}
                >{busy ? '送出中…' : '送到收件匣'}</button>

                {outbox.length > 0 && (
                    <div className="outbox">
                        <div className="row">
                            <span className="small grow">還沒送出去的（{outbox.length}）</span>
                            <button className="ghost small" onClick={() => void flush()}>重試</button>
                        </div>
                        {outbox.map(n => (
                            <div key={n.id} className="pending">{n.text}</div>
                        ))}
                        <p className="muted small">
                            沒訊號也沒關係，這些都存在手機上了，有連線時會自動送出。
                        </p>
                    </div>
                )}
            </div>

            {message && <div className={`toast ${message.kind}`}>{message.text}</div>}
        </div>
    )
}
