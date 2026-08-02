// src/mobile/MobileBrowse.tsx
// S2「手機讀全部白板」的兩個畫面：白板清單 → 單塊板的卡片。**唯讀**。
//
// 拆成獨立檔案是因為 MobileApp 原本只有速記與設定兩個畫面，把瀏覽塞進去
// 會讓那個檔變成「什麼都有」。這裡只吃 props、不碰網路也不碰儲存，
// 資料由 MobileApp 抓好傳進來。
//
// ⚠️ 手機端**沒有圖片與檔案**：image/file 卡的實體檔在桌機的 userData，
// 手機既沒有檔案系統也沒有 electronAPI。所以這兩種卡只顯示檔名並明說打不開，
// 不要做成看起來可以點的樣子（那是承諾了做不到的事）。
import { useState } from 'react'
import type { MobileBoard } from './mobileSyncCore'
import { summarizeCards, type MobileCard, type MobileCardType } from './mobileCards'

type Msg = { text: string; kind: 'ok' | 'err' } | null

const TYPE_LABEL: Record<MobileCardType, string> = {
    text: '文字', todo: '待辦', link: '連結', journal: '日誌', heading: '標題',
    sticky: '便利貼', table: '表格', color: '顏色', file: '檔案', image: '圖片',
    board: '子板', unknown: '其他',
}

const formatAgo = (at: number): string => {
    const min = Math.floor((Date.now() - at) / 60000)
    if (min < 1) return '剛剛'
    if (min < 60) return `${min} 分鐘前`
    const hr = Math.floor(min / 60)
    return hr < 24 ? `${hr} 小時前` : `${Math.floor(hr / 24)} 天前`
}

// ── 白板清單 ────────────────────────────────────────────────────────────

export function BoardListScreen({
    boards, busy, error, onBack, onReload, onOpen, message,
}: {
    boards: MobileBoard[] | null
    busy: boolean
    error: string | null
    onBack: () => void
    onReload: () => void
    onOpen: (b: MobileBoard) => void
    message: Msg
}) {
    return (
        <div className="screen">
            <header className="bar">
                <button className="ghost" onClick={onBack}>返回</button>
                <span className="title grow">白板</span>
                <button className="ghost" onClick={onReload} disabled={busy}>{busy ? '讀取中…' : '重新整理'}</button>
            </header>

            <div className="pad scroll">
                {error && <div className="notice err">{error}</div>}

                {boards === null && !error && (
                    <p className="muted small">{busy ? '讀取中…' : '按「重新整理」載入白板。'}</p>
                )}

                {boards !== null && boards.length === 0 && (
                    <p className="muted small">雲端還沒有任何白板。桌機同步過之後才會出現。</p>
                )}

                {boards?.map(b => (
                    <button key={b.id} className="row-btn" onClick={() => onOpen(b)}>
                        <span className="row-title">{b.name}</span>
                        <span className="row-sub muted small">{formatAgo(b.updatedAt)}</span>
                    </button>
                ))}
            </div>

            {message && <div className={`toast ${message.kind}`}>{message.text}</div>}
        </div>
    )
}

// ── 單塊板的卡片 ────────────────────────────────────────────────────────

export interface CardEditHandlers {
    /** 勾／取消勾一個待辦項目 */
    onToggleTodo: (shapeId: string, todoId: string, checked: boolean) => void
    /** 改文字卡內容 */
    onSaveText: (shapeId: string, text: string) => void
    /** 有沒有正在存 */
    saving: boolean
}

export function BoardCardsScreen({
    board, cards, busy, error, onBack, onReload, message, edit,
}: {
    board: MobileBoard
    cards: MobileCard[] | null
    busy: boolean
    error: string | null
    onBack: () => void
    onReload: () => void
    message: Msg
    edit: CardEditHandlers
}) {
    return (
        <div className="screen">
            <header className="bar">
                <button className="ghost" onClick={onBack}>返回</button>
                <span className="title grow ellipsis">{board.name}</span>
                <button className="ghost" onClick={onReload} disabled={busy}>{busy ? '讀取中…' : '重新整理'}</button>
            </header>

            <div className="pad scroll">
                {error && <div className="notice err">{error}</div>}
                {cards === null && !error && <p className="muted small">讀取中…</p>}

                {cards !== null && (
                    <p className="muted small">{summarizeCards(cards)}</p>
                )}

                {cards?.map(c => <CardView key={c.id} card={c} edit={edit} />)}
            </div>

            {message && <div className={`toast ${message.kind}`}>{message.text}</div>}
        </div>
    )
}

function CardView({ card, edit }: { card: MobileCard; edit: CardEditHandlers }) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')

    const startEdit = () => {
        // 編輯用的是「標題＋內文」還原成的純文字——手機上不做 HTML 編輯
        setDraft([card.title, card.body].filter(Boolean).join('\n'))
        setEditing(true)
    }

    return (
        <div className="card-item">
            <div className="row">
                <span className="chip small">{TYPE_LABEL[card.type]}</span>
                {card.tags.map(t => <span key={t} className="chip small tag">#{t}</span>)}
            </div>

            {editing ? (
                <>
                    <textarea
                        className="note edit"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        autoFocus
                    />
                    <div className="row gap">
                        <button className="ghost small" onClick={() => setEditing(false)}>取消</button>
                        <button
                            className="primary small"
                            disabled={edit.saving}
                            onClick={() => { edit.onSaveText(card.id, draft); setEditing(false) }}
                        >{edit.saving ? '存檔中…' : '儲存'}</button>
                    </div>
                </>
            ) : (
                <>
                    {card.title && <div className="card-title">{card.title}</div>}
                    {card.body && <div className="card-body small">{card.body}</div>}
                    {/* 只有文字類的卡能在手機上編輯。表格、顏色樣本那些的結構
                        沒辦法用一個 textarea 表達，硬給編輯入口只會讓人把資料改壞。 */}
                    {(card.type === 'text' || card.type === 'journal' || card.type === 'sticky' || card.type === 'heading') && (
                        <button className="ghost small edit-btn" onClick={startEdit}>編輯</button>
                    )}
                </>
            )}

            {card.todos.length > 0 && (
                <ul className="todo-list">
                    {card.todos.map(t => (
                        <li key={t.id} className={t.checked ? 'done' : ''}>
                            {/* 整列都可以按——手機上只給 14px 的方框當點擊區太小了 */}
                            <button
                                className="todo-row"
                                disabled={edit.saving}
                                onClick={() => edit.onToggleTodo(card.id, t.id, !t.checked)}
                            >
                                <span className="box">{t.checked ? '☑' : '☐'}</span>
                                <span className="grow">{t.text}</span>
                                {t.dueDate && <span className="muted small">{t.dueDate}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {card.type === 'link' && card.url && (
                <a className="small" href={card.url} target="_blank" rel="noreferrer">{card.url}</a>
            )}

            {/* 手機拿不到實體檔——說清楚而不是給一個按了沒反應的東西 */}
            {(card.type === 'file' || card.type === 'image') && (
                <div className="muted small">
                    {card.fileName ?? '（未命名）'}　·　{card.type === 'image' ? '圖片' : '檔案'}只能在桌機開啟
                </div>
            )}
        </div>
    )
}
