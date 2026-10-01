// src/components/knowledge-graph/QuestPanel.tsx
//
// 點主線／支線節點時，固定在畫布左側的進度面板（2026-10-01）。
// **只看不改**（使用者選的）：要勾選就按「跳到這張卡」。圖譜開著時另寫資料，
// 有被白板自動存檔蓋掉的風險（見記憶 gotcha_seed_cards_autosave）。
// 失敗項（❌ 失敗｜）另外計數，不灌進完成率——算法在 utils/knowledgeGraph.ts 的 questProgress。

import { questProgress, questTitle, type GraphNode } from '../../utils/knowledgeGraph'
import { getTodayStr } from '../../utils/date'
import { SURFACE_OVERLAY, INK, QUEST_COLOR, QUEST_TEXT, OVERDUE } from './palette'

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

export function QuestPanel({ node, onClose, onJump }: {
    node: GraphNode
    onClose: () => void
    onJump: () => void
}) {
    const quest = node.quest ?? 'side'
    const { done, failed, total, items } = questProgress(node.todos, getTodayStr())
    const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%')

    return (
        <div
            // 擋掉冒泡：點面板不該被當成點到畫布空白處
            onPointerDown={e => e.stopPropagation()}
            style={{
                position: 'absolute', top: 16, left: 16, zIndex: 2,
                width: 300,
                // 底部讓出圖例（bottom 20 + 約 34 高）
                maxHeight: 'calc(100% - 90px)',
                display: 'flex', flexDirection: 'column',
                background: SURFACE_OVERLAY, border: `1px solid ${INK.hairline}`, borderRadius: 10,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
        >
            {/* 標題 */}
            <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${INK.hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: QUEST_TEXT[quest] }}>
                            {quest === 'main' ? '主線' : '支線'}｜{questTitle(node.name)}
                        </div>
                        <div style={{ fontSize: 11, color: INK.faint, marginTop: 2 }}>{node.boardName}</div>
                    </div>
                    <button onClick={onClose} title="關閉（Esc）" style={{
                        background: 'none', border: 'none', color: INK.normal, cursor: 'pointer',
                        fontSize: 16, lineHeight: 1, padding: 2,
                    }}>✕</button>
                </div>

                {/* 進度條：完成（主色）＋失敗（紅，接在後面） */}
                <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: INK.hairline, marginTop: 10 }}>
                    <div style={{ width: pct(done), background: QUEST_COLOR[quest] }} />
                    <div style={{ width: pct(failed), background: OVERDUE, opacity: 0.6 }} />
                </div>
                <div style={{ fontSize: 12, color: INK.normal, marginTop: 6 }}>
                    完成 {done}{failed > 0 && <> · <span style={{ color: OVERDUE }}>失敗 {failed}</span></>} / 共 {total}
                </div>
            </div>

            {/* 項目清單 */}
            <div style={{ overflowY: 'auto', padding: '6px 0', flex: 1, minHeight: 0 }}>
                {items.length === 0 && (
                    <div style={{ padding: '8px 14px', fontSize: 12, color: INK.faint }}>這張卡沒有待辦項目</div>
                )}
                {items.map(it => {
                    const closed = it.status !== 'open'
                    return (
                        <div key={it.key} style={{
                            display: 'flex', gap: 8, padding: '5px 14px', fontSize: 12.5, lineHeight: 1.45,
                            background: it.isNext ? 'rgba(255,255,255,0.06)' : 'transparent',
                            borderLeft: `2px solid ${it.isNext ? QUEST_COLOR[quest] : 'transparent'}`,
                        }}>
                            <span style={{
                                width: 14, flexShrink: 0, textAlign: 'center',
                                color: it.isNext ? QUEST_COLOR[quest] : it.status === 'failed' ? OVERDUE : INK.faint,
                            }}>
                                {it.isNext ? '▶' : it.status === 'done' ? '✓' : it.status === 'failed' ? '✕' : '○'}
                            </span>
                            {/* 沒日期也佔位，文字欄才對齊 */}
                            <span style={{
                                flexShrink: 0, width: 38, fontVariantNumeric: 'tabular-nums',
                                color: it.overdue ? OVERDUE : closed ? INK.faint : INK.normal,
                            }}>{it.dueDate ? md(it.dueDate) : ''}</span>
                            <span style={{
                                flex: 1, minWidth: 0, wordBreak: 'break-word',
                                color: closed ? INK.faint : INK.strong,
                                textDecoration: it.status === 'done' ? 'line-through' : 'none',
                            }}>{it.text}</span>
                        </div>
                    )
                })}
            </div>

            <div style={{ padding: '10px 14px', borderTop: `1px solid ${INK.hairline}` }}>
                <button onClick={onJump} style={{
                    width: '100%', padding: '7px 0', borderRadius: 6, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.06)', border: `1px solid ${INK.hairline}`,
                    color: INK.strong, fontSize: 12.5,
                }}>跳到這張卡 →</button>
            </div>
        </div>
    )
}
