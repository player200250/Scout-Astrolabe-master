// src/components/CloudSyncPanel.tsx
// 雲端同步設定與手動推 / 拉（S0(b) 探路階段）。
//
// 這個面板刻意只做**手動**動作：填設定 → 登入 → 推一塊板 → 拉回來看。
// 沒有自動同步、沒有輪詢、不碰現有存檔流程——先確認整條鏈路在真實 Supabase 上跑得通，
// 再往上疊（見 docs/roadmap-mobile.md S0(b)）。
import { useState, useEffect, useCallback } from 'react'
import type { BoardRecord } from '../db'
import { db } from '../db'
import { loadSyncConfig, saveSyncConfig, isSyncConfigured, type SyncConfig } from '../sync/syncConfig'
import { signIn, signOut, getCurrentSession } from '../sync/supabaseClient'
import { pushBoard, pullBoard, listRemoteBoards, decideSync, type RemoteBoardSummary } from '../sync/boardSync'
import { getCardShapes } from '../utils/snapshot'
import { showToast } from '../utils/toast'
import { T } from '../theme/tokens'
import { Z_PANEL } from '../constants'

interface CloudSyncPanelProps {
    boards: BoardRecord[]
    activeBoardId: string | null
    onClose: () => void
}

const label: React.CSSProperties = { fontSize: 11, color: T.textSecondary, marginBottom: 4, display: 'block' }
const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 12,
    border: `1px solid ${T.borderLight}`, borderRadius: 7,
    background: T.bgApp, color: T.textPrimary, outline: 'none', fontFamily: 'inherit',
}
const btn: React.CSSProperties = {
    padding: '7px 14px', fontSize: 12.5, borderRadius: 7, cursor: 'pointer',
    border: 'none', background: T.accent, color: T.textOnActive, fontWeight: 600,
}
const btnGhost: React.CSSProperties = {
    padding: '7px 14px', fontSize: 12.5, borderRadius: 7, cursor: 'pointer',
    border: `1px solid ${T.borderLight}`, background: 'transparent', color: T.textSecondary,
}
const section: React.CSSProperties = {
    padding: '14px 16px', borderBottom: `1px solid ${T.borderLight}`,
}

export function CloudSyncPanel({ boards, activeBoardId, onClose }: CloudSyncPanelProps) {
    const [config, setConfig] = useState<SyncConfig>(() => loadSyncConfig())
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [remote, setRemote] = useState<RemoteBoardSummary[] | null>(null)
    const [pulled, setPulled] = useState<BoardRecord | null>(null)

    const activeBoard = boards.find(b => b.id === activeBoardId) ?? null

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    // 進面板時看看之前登入的 session 還在不在（persistSession 會存 localStorage）
    useEffect(() => {
        let alive = true
        getCurrentSession().then(s => { if (alive) setUserEmail(s?.user.email ?? null) }).catch(() => { /* 未設定 */ })
        return () => { alive = false }
    }, [])

    const handleSaveConfig = useCallback(() => {
        saveSyncConfig(config)
        // 不必 resetSupabase()：getSupabase() 以設定內容為快取鍵，變了會自己重建。
        // 每次都 reset 反而會一直生新的 GoTrueClient 實例（supabase-js 會警告）。
        setConfig(loadSyncConfig()) // 讀回正規化後的值，讓使用者看到實際會用的 URL
        showToast('已儲存連線設定', 'success')
    }, [config])

    const handleSignIn = useCallback(async () => {
        setBusy('signin')
        saveSyncConfig(config)
        setConfig(loadSyncConfig())
        const res = await signIn(email.trim(), password)
        setBusy(null)
        if (!res.ok) { showToast(res.error ?? '登入失敗', 'error'); return }
        setUserEmail(res.session?.user.email ?? email.trim())
        setPassword('')
        showToast('已登入 Supabase', 'success')
    }, [config, email, password])

    const handleSignOut = useCallback(async () => {
        await signOut()
        setUserEmail(null)
        setRemote(null)
        setPulled(null)
        showToast('已登出')
    }, [])

    const handlePush = useCallback(async () => {
        if (!activeBoard) return
        setBusy('push')
        const res = await pushBoard(activeBoard)
        setBusy(null)
        if (!res.ok) { showToast(`推送失敗：${res.error}`, 'error'); return }
        showToast(`已推送「${activeBoard.name}」到雲端`, 'success')
    }, [activeBoard])

    const handleList = useCallback(async () => {
        setBusy('list')
        const res = await listRemoteBoards()
        setBusy(null)
        if (!res.ok) { showToast(`讀取失敗：${res.error}`, 'error'); return }
        setRemote(res.data ?? [])
        showToast(`雲端有 ${res.data?.length ?? 0} 塊白板`)
    }, [])

    const handlePull = useCallback(async (boardId: string) => {
        setBusy('pull')
        const res = await pullBoard(boardId)
        setBusy(null)
        if (!res.ok) { showToast(`拉取失敗：${res.error}`, 'error'); return }
        if (!res.data) { showToast('雲端沒有這塊白板', 'error'); return }
        setPulled(res.data)
        showToast(`已取回「${res.data.name}」，請確認後再決定要不要覆蓋本機`)
    }, [])

    // ⚠️ 唯一的破壞性動作：直接覆寫本機的那塊板。
    // 探路階段刻意做成「拉下來先看，再手動按覆蓋」兩步，而不是拉了就蓋。
    const handleOverwriteLocal = useCallback(async () => {
        if (!pulled) return
        const local = boards.find(b => b.id === pulled.id)
        const ok = window.confirm(
            `即將以雲端版本覆蓋本機的「${pulled.name}」。\n\n` +
            `本機：${local ? new Date(local.updatedAt).toLocaleString() : '（本機沒有這塊板，會新增）'}\n` +
            `雲端：${new Date(pulled.updatedAt).toLocaleString()}\n\n` +
            `覆蓋後 App 會重新載入。要繼續嗎？`
        )
        if (!ok) return
        try {
            await db.table('boards').put(pulled)
            // 重載是最保險的做法：boards state、tldraw editor、backlink 索引全部重新建立，
            // 不必在探路階段就處理「畫布正開著這塊板」的即時換頁問題
            window.location.reload()
        } catch (e) {
            showToast(`寫入本機失敗：${e instanceof Error ? e.message : String(e)}`, 'error')
        }
    }, [pulled, boards])

    const configured = isSyncConfigured(config)
    const cardCount = (b: BoardRecord | null) => (b?.snapshot ? getCardShapes(b.snapshot).length : 0)

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '92vw',
            background: T.bgPanel, borderLeft: `1px solid ${T.borderLight}`,
            boxShadow: T.shadowPanel, zIndex: Z_PANEL,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            {/* 標題列 */}
            <div style={{ ...section, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, flex: 1 }}>☁️ 雲端同步</span>
                <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 5,
                    background: userEmail ? T.accentBg : T.bgMuted,
                    color: userEmail ? T.accent : T.textMuted,
                }}>{userEmail ? '已連線' : configured ? '未登入' : '未設定'}</span>
                <button onClick={onClose} style={{ ...btnGhost, padding: '3px 9px' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* 1. 連線設定 */}
                <div style={section}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 10 }}>1. 連線設定</div>
                    <div style={{ marginBottom: 10 }}>
                        <label style={label}>Project URL</label>
                        <input
                            style={input} placeholder="https://xxxxx.supabase.co"
                            value={config.url} onChange={e => setConfig(c => ({ ...c, url: e.target.value }))}
                        />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <label style={label}>anon (public) key</label>
                        <input
                            style={{ ...input, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11 }}
                            placeholder="eyJhbGciOiJIUzI1NiIs..."
                            value={config.anonKey} onChange={e => setConfig(c => ({ ...c, anonKey: e.target.value }))}
                        />
                    </div>
                    <button onClick={handleSaveConfig} style={btnGhost}>儲存設定</button>
                    <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 8, lineHeight: 1.6 }}>
                        兩個值都在 Supabase 後台 <b>Project Settings → API</b>。
                        anon key 是設計上可公開的值，資料安全靠 RLS（<code>supabase/schema.sql</code> 已設定）。
                    </div>
                </div>

                {/* 2. 登入 */}
                <div style={section}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 10 }}>2. 登入</div>
                    {userEmail ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: T.textPrimary, flex: 1 }}>✅ {userEmail}</span>
                            <button onClick={handleSignOut} style={btnGhost}>登出</button>
                        </div>
                    ) : (
                        <>
                            <div style={{ marginBottom: 8 }}>
                                <label style={label}>Email</label>
                                <input style={input} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <label style={label}>密碼</label>
                                <input
                                    style={input} type="password" value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && configured) void handleSignIn() }}
                                />
                            </div>
                            <button
                                onClick={() => void handleSignIn()}
                                disabled={!configured || busy === 'signin'}
                                style={{ ...btn, opacity: !configured || busy === 'signin' ? 0.5 : 1 }}
                            >{busy === 'signin' ? '登入中…' : '登入'}</button>
                        </>
                    )}
                </div>

                {/* 3. 手動推 / 拉（探路） */}
                <div style={{ ...section, opacity: userEmail ? 1 : 0.45, pointerEvents: userEmail ? 'auto' : 'none' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 4 }}>3. 手動推 / 拉</div>
                    <div style={{ fontSize: 10.5, color: T.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
                        探路階段：<b>不會</b>自動同步，也不影響平常的存檔。先確認這條鏈路通了再往上做。
                    </div>

                    <div style={{ fontSize: 11.5, color: T.textSecondary, marginBottom: 8 }}>
                        目前白板：<b style={{ color: T.textPrimary }}>{activeBoard?.name ?? '（無）'}</b>
                        {activeBoard && <span style={{ color: T.textMuted }}>　{cardCount(activeBoard)} 張卡</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => void handlePush()} disabled={!activeBoard || busy === 'push'} style={btn}>
                            {busy === 'push' ? '推送中…' : '⬆ 推送目前白板'}
                        </button>
                        <button onClick={() => void handleList()} disabled={busy === 'list'} style={btnGhost}>
                            {busy === 'list' ? '讀取中…' : '🔄 列出雲端白板'}
                        </button>
                    </div>

                    {remote && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, color: T.textSecondary, marginBottom: 6 }}>雲端白板（{remote.length}）</div>
                            {remote.length === 0 && (
                                <div style={{ fontSize: 11.5, color: T.textMuted }}>雲端還沒有任何白板，先按上面的「推送目前白板」。</div>
                            )}
                            {remote.map(r => {
                                const local = boards.find(b => b.id === r.id)
                                const decision = decideSync(local?.updatedAt ?? null, r.updatedAt)
                                const DECISION_LABEL: Record<string, string> = {
                                    'push': '本機較新', 'pull': '雲端較新', 'in-sync': '一致',
                                    'local-only': '僅本機', 'remote-only': '僅雲端',
                                }
                                return (
                                    <div key={r.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
                                        border: `1px solid ${T.borderLight}`, borderRadius: 7, marginBottom: 6,
                                        background: T.bgApp,
                                    }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 12, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {r.name}{r.deletedAt ? '（已刪除）' : ''}
                                            </div>
                                            <div style={{ fontSize: 10, color: T.textMuted }}>
                                                {new Date(r.updatedAt).toLocaleString()}　·　{DECISION_LABEL[decision]}
                                            </div>
                                        </div>
                                        <button onClick={() => void handlePull(r.id)} disabled={busy === 'pull'} style={{ ...btnGhost, padding: '4px 9px', fontSize: 11 }}>
                                            ⬇ 取回
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {pulled && (
                        <div style={{
                            marginTop: 12, padding: '10px 12px', borderRadius: 8,
                            border: `1px solid ${T.accentBorder}`, background: T.accentBg,
                        }}>
                            <div style={{ fontSize: 11.5, color: T.textPrimary, marginBottom: 6 }}>
                                已從雲端取回：<b>{pulled.name}</b>
                            </div>
                            <div style={{ fontSize: 10.5, color: T.textSecondary, lineHeight: 1.7, marginBottom: 8 }}>
                                卡片數 {cardCount(pulled)}　·　更新於 {new Date(pulled.updatedAt).toLocaleString()}<br />
                                縮圖 {pulled.thumbnail ? '有' : '無'}　·　snapshot {pulled.snapshot ? '有' : '空'}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => void handleOverwriteLocal()} style={{ ...btn, background: T.danger }}>
                                    ⚠ 以此覆蓋本機並重載
                                </button>
                                <button onClick={() => setPulled(null)} style={btnGhost}>取消</button>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '12px 16px', fontSize: 10.5, color: T.textMuted, lineHeight: 1.7 }}>
                    還沒設定過？請照 <code>docs/cloud-sync-setup.md</code> 的五個步驟建立 Supabase 專案。
                    本機 IndexedDB 仍是主要資料來源，雲端只是同步層（ADR 0006）。
                </div>
            </div>
        </div>
    )
}
