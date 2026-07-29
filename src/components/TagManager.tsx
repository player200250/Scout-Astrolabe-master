// src/components/TagManager.tsx
//
// Tag Manager（N4）— 標籤管理中心。
// 標籤只能在卡片上逐張輸入，打錯字就多一個孤兒標籤，且沒有地方看到全貌。
// 這裡集中：跨白板統計、改名、合併（改成既有標籤即為合併）、指定顏色、刪除。
//
// 統計與改寫邏輯在 utils/tagManager.ts、顏色在 utils/tagColors.ts（皆為純函式、有測試）。

import { useState, useMemo, useEffect, useCallback } from 'react'
import type { BoardRecord } from '../db'
import { collectTagStats, normalizeTagName, validateTagName } from '../utils/tagManager'
import {
    TAG_PALETTE, loadTagColors, saveTagColors, getTagColor, rewriteTagColor, type TagColorMap,
} from '../utils/tagColors'
import { hexToRgba } from '../utils/cardMeta'
import { SideDrawer } from './ui/SideDrawer'
import { T } from '../theme/tokens'
import { useIsDark } from '../theme/ThemeContext'
import { InlineEdit } from './ui/InlineEdit'

export interface TagManagerProps {
    boards: BoardRecord[]
    /** to 為 null＝刪除；目標已存在＝合併 */
    onRewriteTag: (from: string, to: string | null) => void
    onClose: () => void
}

export function TagManager({ boards, onRewriteTag, onClose }: TagManagerProps) {
    const isDark = useIsDark()
    const stats = useMemo(() => collectTagStats(boards), [boards])
    const [colors, setColors] = useState<TagColorMap>(() => loadTagColors())
    const [editing, setEditing] = useState<string | null>(null)
    // 旁邊那顆「儲存」鈕需要拿到目前輸入值 → 用 InlineEdit 的 onChange 同步一份
    const [draft, setDraft] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

    const existingTags = useMemo(() => new Set(stats.map(s => s.tag)), [stats])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const startEdit = useCallback((tag: string) => {
        setEditing(tag)
        setDraft(tag)
        setError(null)
        setConfirmDelete(null)
    }, [])

    const setTagColor = useCallback((tag: string, color: string) => {
        setColors(prev => {
            const next = { ...prev, [tag]: color }
            saveTagColors(next)
            return next
        })
    }, [])

    const commitRename = useCallback((tag: string, draft: string) => {
        const next = normalizeTagName(draft)
        const err = validateTagName(draft, tag)
        if (err) {
            // 「名稱沒有變更」不是錯誤，直接收起編輯狀態
            if (err === '名稱沒有變更') { setEditing(null); return }
            setError(err)
            return
        }
        // 改成既有標籤＝合併，先確認再動（會把兩個標籤的卡片併在一起，不易還原）
        if (existingTags.has(next) && !confirm(`「${next}」已經存在。要把 #${tag} 合併進 #${next} 嗎？`)) return

        onRewriteTag(tag, next)
        setColors(prev => {
            const updated = rewriteTagColor(prev, tag, next)
            if (updated !== prev) saveTagColors(updated)
            return updated
        })
        setEditing(null)
    }, [existingTags, onRewriteTag])

    const commitDelete = useCallback((tag: string) => {
        onRewriteTag(tag, null)
        setColors(prev => {
            const updated = rewriteTagColor(prev, tag, null)
            if (updated !== prev) saveTagColors(updated)
            return updated
        })
        setConfirmDelete(null)
        setEditing(null)
    }, [onRewriteTag])

    // 外框／標題列／關閉鈕／底部分隔線由 SideDrawer 提供
    const border = T.borderLight
    const headerBorder = T.borderLight
    const titleColor = T.textPrimary
    const mutedColor = T.textSecondary
    const inputBg = T.bgApp

    return (
        <SideDrawer
            title="🏷️ 標籤管理"
            badge={<span style={{ fontSize: 11, color: mutedColor }}>{stats.length} 個標籤</span>}
            onClose={onClose}
            bodyPadding={0}
            footer={stats.length > 0 ? (
                <div style={{ fontSize: 11, color: mutedColor, lineHeight: 1.6 }}>
                    點標籤可改名或改色；改成既有標籤即為合併。
                </div>
            ) : undefined}
        >
            <div>
                {stats.length === 0 ? (
                    <div style={{ padding: '36px 16px', textAlign: 'center', color: mutedColor, fontSize: 13, lineHeight: 1.8 }}>
                        還沒有任何標籤<br />
                        <span style={{ fontSize: 11 }}>在卡片的屬性列加上標籤後，這裡就會列出</span>
                    </div>
                ) : stats.map(stat => {
                    const color = getTagColor(colors, stat.tag)
                    const isEditing = editing === stat.tag
                    return (
                        <div
                            key={stat.tag}
                            style={{ padding: '9px 16px', borderBottom: `1px solid ${headerBorder}` }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                {isEditing ? (
                                    <InlineEdit
                                        value={stat.tag}
                                        onCommit={v => commitRename(stat.tag, v)}
                                        onCancel={() => setEditing(null)}
                                        onChange={v => { setDraft(v); setError(null) }}
                                        /* 有驗證的欄位不能失焦即送出——錯誤訊息還沒看到就被關掉了 */
                                        commitOnBlur={false}
                                        hasError={!!error}
                                        style={{
                                            flex: 1, minWidth: 0, fontSize: 13, padding: '4px 8px',
                                            borderRadius: 6, border: `1.5px solid ${T.accent}`,
                                            background: inputBg, color: titleColor,
                                        }}
                                    />
                                ) : (
                                    <span
                                        onClick={() => startEdit(stat.tag)}
                                        title="點擊改名"
                                        style={{
                                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                            padding: '2px 8px', borderRadius: 6,
                                            color, background: hexToRgba(color, isDark ? 0.2 : 0.1),
                                        }}
                                    >#{stat.tag}</span>
                                )}
                                <div style={{ flex: 1 }} />
                                <span style={{ fontSize: 11, color: mutedColor, flexShrink: 0 }}>
                                    {stat.count} 張 · {stat.boardIds.length} 板
                                </span>
                            </div>

                            {isEditing && (
                                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {error && <div style={{ fontSize: 11, color: '#dc2626' }}>{error}</div>}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                        {TAG_PALETTE.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setTagColor(stat.tag, c)}
                                                title="設為此顏色"
                                                style={{
                                                    width: 18, height: 18, borderRadius: '50%', background: c,
                                                    border: c === color ? `2px solid ${titleColor}` : '2px solid transparent',
                                                    cursor: 'pointer', padding: 0,
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            onClick={() => commitRename(stat.tag, draft)}
                                            style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                                        >儲存</button>
                                        <button
                                            onClick={() => setEditing(null)}
                                            style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: `1px solid ${border}`, background: 'transparent', color: mutedColor, cursor: 'pointer', fontSize: 12 }}
                                        >取消</button>
                                        {confirmDelete === stat.tag ? (
                                            <button
                                                onClick={() => commitDelete(stat.tag)}
                                                style={{ flex: 1.4, padding: '5px 0', borderRadius: 7, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                                            >確定移除 {stat.count} 張？</button>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmDelete(stat.tag)}
                                                title="從所有卡片移除此標籤（卡片本身不會被刪除）"
                                                style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: `1px solid ${border}`, background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                                            >移除標籤</button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </SideDrawer>
    )
}
