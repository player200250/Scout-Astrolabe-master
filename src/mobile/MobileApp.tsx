// src/mobile/MobileApp.tsx
// 手機速記 PWA 的畫面（S1）。
//
// 範圍刻意極小：**登入 → 打字 → 送出 → 進桌機收件匣**。沒有畫布、沒有白板清單、
// 不能編輯既有卡片（那是 S2 / S3）。理由是最高頻的痛點只有一個：
// 「人在外面想記一下」，而那件事最怕的是流程長、開得慢。
import { useState, useEffect, useCallback, useRef } from 'react'
import { loadSyncConfig, saveSyncConfig, isSyncConfigured, type SyncConfig } from '../sync/syncConfig'
import { signIn, signOut, getCurrentSession } from '../sync/supabaseClient'
import {
    enqueueNote, flushOutbox, getOutbox, migrateLegacyOutbox, loadLastSyncedAt,
    rememberSession, forgetSession, type OutboxNote,
} from './mobileCapture'

type Screen = 'capture' | 'settings'

const formatAgo = (at: number): string => {
    const min = Math.floor((Date.now() - at) / 60000)
    if (min < 1) return '剛剛'
    if (min < 60) return `${min} 分鐘前`
    const hr = Math.floor(min / 60)
    return hr < 24 ? `${hr} 小時前` : `${Math.floor(hr / 24)} 天前`
}

export function MobileApp() {
    const [screen, setScreen] = useState<Screen>('capture')
    const [config, setConfig] = useState<SyncConfig>(() => loadSyncConfig())
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [checkingSession, setCheckingSession] = useState(true)
    const [text, setText] = useState('')
    const [outbox, setOutbox] = useState<OutboxNote[]>([])
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
    const [inboxCount, setInboxCount] = useState<number | null>(null)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const configured = isSyncConfigured(config)

    const notify = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
        setMessage({ text, kind })
        setTimeout(() => setMessage(null), 3500)
    }, [])

    const refreshOutbox = useCallback(async () => {
        setOutbox(await getOutbox())
    }, [])

    // 開啟時：把舊版存在 localStorage 的待送速記搬進 IndexedDB，再看 session 還在不在
    useEffect(() => {
        let alive = true
        void (async () => {
            await migrateLegacyOutbox()
            if (!alive) return
            await refreshOutbox()
            setLastSyncedAt(await loadLastSyncedAt())

            try {
                const session = await getCurrentSession()
                if (!alive) return
                setUserEmail(session?.user.email ?? null)
                // 把 token 抄一份給 service worker（它讀不到 localStorage）
                await rememberSession(session)
            } catch { /* 沒設定 */ }
            if (alive) setCheckingSession(false)
        })()
        return () => { alive = false }
    }, [refreshOutbox])

    const flush = useCallback(async (silent = false) => {
        if ((await getOutbox()).length === 0) return
        setBusy(true)
        const res = await flushOutbox()
        setBusy(false)
        await refreshOutbox()

        if (res.ok && res.sent > 0) {
            setLastSyncedAt(await loadLastSyncedAt())
            if (res.inboxCardCount != null) setInboxCount(res.inboxCardCount)
            notify(`已送出 ${res.sent} 則，收件匣現在有 ${res.inboxCardCount ?? '?'} 張卡`)
            // 順手把最新的 token 抄給 service worker（supabase-js 會自動換新）
            try { await rememberSession(await getCurrentSession()) } catch { /* 無妨 */ }
        } else if (!res.ok && !silent) {
            notify(res.error ?? '送出失敗，已留在手機上', 'err')
        }
    }, [notify, refreshOutbox])

    // 補送的三個時機：開啟 App、恢復連線、**從背景回到前台**。
    // 最後那個是 iOS 的救命繩——iOS Safari 沒有 Background Sync，
    // 唯一可靠的機會就是使用者把 App 切回來的那一刻。
    useEffect(() => {
        if (!userEmail) return
        void flush(true)

        const onOnline = () => { void flush(true) }
        const onVisible = () => { if (document.visibilityState === 'visible') void flush(true) }
        window.addEventListener('online', onOnline)
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            window.removeEventListener('online', onOnline)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [userEmail, flush])

    const handleSubmit = useCallback(async () => {
        const trimmed = text.trim()
        if (!trimmed) return
        // 先落地再送——這一行是整個 App 的重點，送不出去也絕不弄丟
        await enqueueNote(trimmed)
        setText('')
        await refreshOutbox()
        inputRef.current?.focus()
        await flush()
    }, [text, flush, refreshOutbox])

    const handleSignIn = useCallback(async () => {
        setBusy(true)
        saveSyncConfig(config)
        setConfig(loadSyncConfig())
        const res = await signIn(email.trim(), password)
        setBusy(false)
        if (!res.ok) { notify(res.error ?? '登入失敗', 'err'); return }
        setUserEmail(res.session?.user.email ?? email.trim())
        setPassword('')
        await rememberSession(res.session)
        setScreen('capture')
        notify('已登入')
    }, [config, email, password, notify])

    const handleSignOut = useCallback(async () => {
        await signOut()
        await forgetSession()
        setUserEmail(null)
        setInboxCount(null)
        notify('已登出')
    }, [notify])

    // 待送清單。**登入畫面也要顯示**——session 過期時若只看到登入表單，
    // 會讓人以為還沒送出去的速記不見了（其實還好好躺在 IndexedDB 裡）。
    const pendingBlock = outbox.length > 0 && (
        <div className="outbox">
            <div className="row">
                <span className="small grow">還沒送出去的（{outbox.length}）</span>
                {userEmail && <button className="ghost small" onClick={() => void flush()}>重試</button>}
            </div>
            {outbox.map(n => (
                <div key={n.id} className="pending">{n.text}</div>
            ))}
            <p className="muted small">
                {userEmail
                    ? '沒訊號也沒關係，這些都存在手機上了，有連線時會自動送出。'
                    : '這些速記存在這支手機上，不會不見。登入後會自動送出。'}
            </p>
        </div>
    )

    // ── 設定／登入畫面 ───────────────────────────────────────────────────────
    if (checkingSession) {
        return <div className="center muted">載入中…</div>
    }

    if (!userEmail || screen === 'settings') {
        return (
            <div className="screen">
                <header className="bar">
                    <span className="title">☁️ 連線設定</span>
                    {outbox.length > 0 && <span className="badge">{outbox.length} 待送</span>}
                    {userEmail && <button className="ghost" onClick={() => setScreen('capture')}>完成</button>}
                </header>

                <div className="pad scroll">
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

                    {pendingBlock}
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

                {/* 同步狀態：讓人在手機上就能確認東西真的進去了，
                    不必等回到桌機才發現同步早就壞了 */}
                <div className="synced small muted">
                    {outbox.length > 0
                        ? `${outbox.length} 則等待送出`
                        : lastSyncedAt
                            ? `已同步 · ${formatAgo(lastSyncedAt)}${inboxCount != null ? ` · 收件匣 ${inboxCount} 張卡` : ''}`
                            : '尚未同步過'}
                </div>

                {pendingBlock}
            </div>

            {message && <div className={`toast ${message.kind}`}>{message.text}</div>}
        </div>
    )
}
