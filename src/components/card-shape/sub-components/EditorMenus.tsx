// src/components/card-shape/sub-components/EditorMenus.tsx
//
// 編輯器的兩個補全選單：`/` 格式選單與 `[[` 連結補全。原本私有在 TextContent 裡，
// 2026-09-30 抽出來讓日記／週回顧編輯器共用（第二步；第一步是 richText.ts＋RichTextToolbar）。
//
// 呼叫端要做兩件事：
//   1. 在 useTiptap **之前**建一個 keyRef，並接進 editorProps.handleKeyDown：
//        handleKeyDown: (_view, event) => keyRef.current(event)
//      ⚠️ 必須走 ProseMirror 的 handleKeyDown，不能用 React 的 onKeyDown：PM 的 listener 掛在
//      contenteditable 上（target 階段），React 委派在 root（bubble 階段），PM 會先把 Enter
//      變成 splitBlock，等 React 收到時段落已經被切開了。useTiptap 的 config 只讀一次，所以用 ref。
//   2. 把回傳的 popups 渲染出來（position:fixed，放哪一層都行）。
//
// 連結候選（linkTargets）由呼叫端給：白板裡有 BacklinksContext 的增量索引，
// 復盤中心不在那個 Provider 底下，改由 boards 自己算。

import { useEffect, useState, useRef, useCallback, type MutableRefObject } from 'react'
import type { Editor } from '@tiptap/react'
import { buildSlashCommands, matchSlashQuery, groupSlashCommands, type SlashCommand } from '../../../utils/slashCommands'
import { filterCommands } from '../../../utils/commands'
import { filterLinkTargets, groupLinkTargets, type LinkTarget } from '../../../utils/cardLinks'
import { T } from '../../../theme/tokens'
import { Icon } from '../../ui/icons'
import { SuggestPopup } from './SuggestPopup'

// registry 是純資料、與元件無關 → 模組層建一次即可，不隨每次 render 重算
const SLASH_COMMANDS = buildSlashCommands()

/* ================================================
   Wiki-link autocomplete helpers
================================================ */
interface SuggestState {
    query: string
    from: number
    coords: { x: number; y: number }
    index: number
    matches: LinkTarget[]
}

/* ================================================
   `/` 選單（階段 1）
   ——只露出 StarterKit 早就支援、但工具列沒給入口的東西（引用/分隔線/H3…）。
   命令 registry 與過濾在 utils/slashCommands.ts（純函式、有測試）。
================================================ */
interface SlashState {
    query: string
    from: number
    coords: { x: number; y: number }
    index: number
    matches: SlashCommand[]
}

/** 上下鍵／Enter／Tab／Esc 的共用處理；回傳 true ＝ 攔下，PM 不再跑預設行為 */
function menuKey<S extends { index: number; matches: unknown[] }>(
    event: KeyboardEvent,
    state: S | null,
    set: (fn: (prev: S | null) => S | null) => void,
    pick: (s: S) => void,
): boolean {
    if (!state || state.matches.length === 0) return false
    if (event.key === 'ArrowDown') {
        set(prev => prev ? { ...prev, index: (prev.index + 1) % prev.matches.length } : prev)
        return true
    }
    if (event.key === 'ArrowUp') {
        set(prev => prev ? { ...prev, index: (prev.index - 1 + prev.matches.length) % prev.matches.length } : prev)
        return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') { pick(state); return true }
    if (event.key === 'Escape') { set(() => null); return true }
    return false
}

export function useEditorMenus(
    tiptap: Editor | null,
    enabled: boolean,
    linkTargets: LinkTarget[],
    keyRef: MutableRefObject<(e: KeyboardEvent) => boolean>,
): React.ReactNode {
    const [suggest, setSuggest] = useState<SuggestState | null>(null)
    const suggestRef = useRef<SuggestState | null>(null)
    suggestRef.current = suggest
    const [slash, setSlash] = useState<SlashState | null>(null)
    const slashRef = useRef<SlashState | null>(null)
    slashRef.current = slash

    useEffect(() => {
        if (!enabled) { setSuggest(null); setSlash(null) }
    }, [enabled])

    // [[xxx]] autocomplete trigger
    useEffect(() => {
        if (!tiptap || !enabled) return
        const handler = () => {
            const { state } = tiptap
            const { from } = state.selection
            const textBefore = state.doc.textBetween(Math.max(0, from - 120), from, '\n')
            const match = textBefore.match(/\[\[([^\]]*)$/)
            if (!match) { setSuggest(null); return }
            const query = match[1]
            const matches = filterLinkTargets(linkTargets, query)
            if (matches.length === 0) { setSuggest(null); return }
            const coords = tiptap.view.coordsAtPos(from)
            setSuggest(prev => ({
                query,
                from: from - match[0].length,
                coords: { x: coords.left, y: coords.bottom + 4 },
                index: prev?.query === query ? prev.index : 0,
                matches,
            }))
        }
        tiptap.on('update', handler)
        tiptap.on('selectionUpdate', handler)
        return () => {
            tiptap.off('update', handler)
            tiptap.off('selectionUpdate', handler)
        }
    }, [tiptap, enabled, linkTargets])

    // `/` 選單觸發（matchSlashQuery 內已讓 `[[` 補全優先，兩者不會同時開）
    useEffect(() => {
        if (!tiptap || !enabled) return
        const handler = () => {
            const { state } = tiptap
            const { from } = state.selection
            const textBefore = state.doc.textBetween(Math.max(0, from - 120), from, '\n')
            const hit = matchSlashQuery(textBefore)
            if (!hit) { setSlash(null); return }
            const matches = filterCommands(SLASH_COMMANDS, hit.query)
            if (matches.length === 0) { setSlash(null); return }
            const coords = tiptap.view.coordsAtPos(from)
            setSlash(prev => ({
                query: hit.query,
                from: from - hit.length,
                coords: { x: coords.left, y: coords.bottom + 4 },
                index: prev?.query === hit.query ? prev.index : 0,
                matches,
            }))
        }
        tiptap.on('update', handler)
        tiptap.on('selectionUpdate', handler)
        return () => {
            tiptap.off('update', handler)
            tiptap.off('selectionUpdate', handler)
        }
    }, [tiptap, enabled])

    const runSlash = useCallback((cmd: SlashCommand) => {
        if (!tiptap || !slashRef.current) return
        const { from: curFrom } = tiptap.state.selection
        // apply 內部會先 deleteRange 掉使用者打的 `/query` 再套用命令
        cmd.apply(tiptap, { from: slashRef.current.from, to: curFrom })
        setSlash(null)
    }, [tiptap])

    const insertCompletion = useCallback((name: string) => {
        if (!tiptap || !suggestRef.current) return
        const { from: curFrom } = tiptap.state.selection
        tiptap.chain().focus()
            .deleteRange({ from: suggestRef.current.from, to: curFrom })
            .insertContent(`[[${name}]]`)
            .run()
        setSuggest(null)
    }, [tiptap])

    // 每次 render 更新，讓 useTiptap 的一次性 handleKeyDown 讀到最新 state/callback。
    // 兩者不會同時開（matchSlashQuery 讓 `[[` 優先），順序只是保險
    keyRef.current = (event: KeyboardEvent) =>
        menuKey(event, slashRef.current, setSlash, s => runSlash(s.matches[s.index]))
        || menuKey(event, suggestRef.current, setSuggest, s => insertCompletion(s.matches[s.index].name))

    return (
        <>
            {/* [[xxx]] autocomplete dropdown — position:fixed to escape card clipping */}
            {suggest && (
                <SuggestPopup coords={suggest.coords} footer="↑↓ 選擇  Tab/Enter 確認  Esc 關閉">
                    {groupLinkTargets(suggest.matches).map(({ group, items }) => (
                        <div key={group}>
                            <div style={{
                                padding: '5px 12px 2px', fontSize: 10, fontWeight: 700,
                                letterSpacing: '0.5px', color: T.textMuted,
                            }}>{group}</div>
                            {items.map(t => {
                                // index 是對 suggest.matches 的全域序號，分組顯示時要換算回去
                                const i = suggest.matches.indexOf(t)
                                const active = i === suggest.index
                                return (
                                    <div
                                        key={t.kind + ':' + t.name}
                                        onPointerDown={() => insertCompletion(t.name)}
                                        style={{
                                            padding: '6px 12px',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            background: active ? (T.accentBg) : 'transparent',
                                            color: active ? '#60a5fa' : (T.textPrimary),
                                            borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        <span style={{ flexShrink: 0, opacity: 0.7 }}>{t.kind === 'board' ? '🗂️' : '📝'}</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </SuggestPopup>
            )}

            {/* `/` 選單 */}
            {slash && (
                <SuggestPopup coords={slash.coords} footer="↑↓ 選擇  Tab/Enter 確認  Esc 關閉">
                    {groupSlashCommands(slash.matches).map(({ group, items }) => (
                        <div key={group}>
                            <div style={{
                                padding: '5px 12px 2px', fontSize: 10, fontWeight: 700,
                                letterSpacing: '0.5px', color: T.textMuted,
                            }}>{group}</div>
                            {items.map(cmd => {
                                // index 是對 slash.matches 的全域序號，分組顯示時要換算回去
                                const i = slash.matches.indexOf(cmd)
                                const active = i === slash.index
                                return (
                                    <div
                                        key={cmd.id}
                                        onPointerDown={() => runSlash(cmd)}
                                        style={{
                                            padding: '6px 12px',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 9,
                                            background: active ? (T.accentBg) : 'transparent',
                                            color: active ? '#60a5fa' : (T.textPrimary),
                                            borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                                        }}
                                    >
                                        {/* 顏色項用該色本身當圖示色（Icon 吃 currentColor）；其餘一律次級灰。 */}
                                        <span style={{
                                            width: 20, flexShrink: 0,
                                            display: 'flex', justifyContent: 'center',
                                            color: cmd.id.startsWith('color-')
                                                ? cmd.id.slice(6)
                                                : (T.textSecondary),
                                        }}><Icon name={cmd.icon} /></span>
                                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {cmd.title}
                                        </span>
                                        {cmd.hint && (
                                            <span style={{
                                                flexShrink: 0, fontSize: 10, fontFamily: 'monospace',
                                                color: T.textMuted,
                                            }}>{cmd.hint}</span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </SuggestPopup>
            )}
        </>
    )
}
