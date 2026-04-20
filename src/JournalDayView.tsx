// src/JournalDayView.tsx
import { useState, useEffect, useRef } from 'react'
import { useEditor as useTiptap, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import type { BoardRecord } from './db'

/* ------------------------------------------------------------------ utils */
function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(d: Date): string {
    const days = ['日', '一', '二', '三', '四', '五', '六']
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日　星期${days[d.getDay()]}`
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d); r.setDate(d.getDate() + n); return r
}

function findCard(boards: BoardRecord[], ds: string) {
    for (const board of boards) {
        if (!board.isJournal || !board.snapshot) continue
        const store = (board.snapshot as any).document?.store ?? {}
        for (const shape of Object.values(store) as any[]) {
            if (shape.typeName === 'shape' && shape.type === 'card' && shape.props?.type === 'journal' && shape.props?.journalDate === ds) {
                return { boardId: board.id, shapeId: shape.id as string, text: shape.props.text as string ?? '' }
            }
        }
    }
    return null
}

function defaultTemplate(ds: string): string {
    const [y, m, d] = ds.split('-').map(Number)
    const days = ['日', '一', '二', '三', '四', '五', '六']
    const label = `${m}/${d}（${days[new Date(y, m - 1, d).getDay()]}）`
    return `<h2>${label}</h2><p><strong>今天做了什麼</strong></p><p></p><p><strong>學到什麼</strong></p><p></p><p><strong>卡住的地方</strong></p><p></p><p><strong>明天先做</strong></p><p></p>`
}

/* ------------------------------------------------------------------ JournalDayContent (embeddable) */
interface JournalDayContentProps {
    date: Date
    boards: BoardRecord[]
    onSaveJournal: (boardId: string, dateStr: string, html: string, shapeId: string | null) => void
    onDateChange: (date: Date) => void
    onClose?: () => void
}

export function JournalDayContent({ date, boards, onSaveJournal, onDateChange, onClose }: JournalDayContentProps) {
    const ds = toDateStr(date)
    const card = findCard(boards, ds)
    const journalBoardId = boards.find(b => b.isJournal)?.id ?? null

    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'pending'>('saved')
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const skipUpdate = useRef(true)

    const cardRef = useRef(card)
    const dsRef = useRef(ds)
    const journalBoardIdRef = useRef(journalBoardId)
    cardRef.current = card
    dsRef.current = ds
    journalBoardIdRef.current = journalBoardId

    const tiptap = useTiptap({
        extensions: [StarterKit, Underline, TextStyle, Color],
        content: card?.text ?? defaultTemplate(ds),
        editorProps: { attributes: { style: 'outline:none' } },
        onUpdate: ({ editor }) => {
            if (skipUpdate.current) return
            setSaveStatus('pending')
            if (saveTimer.current) clearTimeout(saveTimer.current)
            saveTimer.current = setTimeout(() => {
                setSaveStatus('saving')
                const c = cardRef.current
                onSaveJournal(c?.boardId ?? journalBoardIdRef.current ?? '', dsRef.current, editor.getHTML(), c?.shapeId ?? null)
                setTimeout(() => setSaveStatus('saved'), 400)
            }, 900)
        },
    })

    useEffect(() => {
        skipUpdate.current = true
        const c = findCard(boards, ds)
        tiptap?.commands.setContent(c?.text ?? defaultTemplate(ds), false)
        setSaveStatus('saved')
        const t = setTimeout(() => { skipUpdate.current = false }, 120)
        return () => clearTimeout(t)
    }, [ds]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        skipUpdate.current = false
        return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    }, [])

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onClose) { onClose(); return }
            if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft') { e.preventDefault(); onDateChange(addDays(date, -1)) }
            if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowRight') { e.preventDefault(); onDateChange(addDays(date, 1)) }
        }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose, onDateChange, date])

    const isToday = ds === toDateStr(new Date())
    const statusColor = saveStatus === 'pending' ? '#f59e0b' : saveStatus === 'saving' ? '#aaa' : '#22c55e'
    const statusText = saveStatus === 'pending' ? '未儲存' : saveStatus === 'saving' ? '儲存中…' : '已儲存'

    return (
        <>
            {/* Date nav header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderBottom: '1px solid #f0f0ee', flexShrink: 0 }}>
                <button onClick={() => onDateChange(addDays(date, -1))} title="前一天 (Ctrl+←)" style={navBtnStyle}>←</button>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>{formatDate(date)}</span>
                    {isToday && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: '#1a1a1a', color: 'white', borderRadius: 4, padding: '1px 5px' }}>今天</span>}
                </div>
                <button onClick={() => onDateChange(addDays(date, 1))} title="後一天 (Ctrl+→)" style={navBtnStyle}>→</button>
                {onClose && (
                    <>
                        <div style={{ width: 1, height: 16, background: '#e8e8e8' }} />
                        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #e0e0de', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✕</button>
                    </>
                )}
            </div>

            {/* Toolbar strip */}
            {tiptap && journalBoardId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '4px 20px', borderBottom: '1px solid #f5f5f5', flexShrink: 0, background: '#fafafa' }}>
                    {[
                        { cmd: () => tiptap.chain().focus().toggleBold().run(), active: tiptap.isActive('bold'), label: 'B', style: { fontWeight: 700 } },
                        { cmd: () => tiptap.chain().focus().toggleItalic().run(), active: tiptap.isActive('italic'), label: 'I', style: { fontStyle: 'italic' } },
                        { cmd: () => tiptap.chain().focus().toggleUnderline().run(), active: tiptap.isActive('underline'), label: 'U', style: { textDecoration: 'underline' } },
                        { cmd: () => tiptap.chain().focus().toggleHeading({ level: 2 }).run(), active: tiptap.isActive('heading', { level: 2 }), label: 'H2', style: { fontSize: 11 } },
                        { cmd: () => tiptap.chain().focus().toggleBulletList().run(), active: tiptap.isActive('bulletList'), label: '•≡', style: {} },
                    ].map(btn => (
                        <button
                            key={btn.label}
                            onMouseDown={e => { e.preventDefault(); btn.cmd() }}
                            style={{
                                padding: '2px 7px', fontSize: 12, border: 'none', borderRadius: 5, cursor: 'pointer',
                                background: btn.active ? '#e8f0fe' : 'transparent',
                                color: btn.active ? '#1971c2' : '#888',
                                ...btn.style,
                            }}
                        >{btn.label}</button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: statusColor }}>{statusText}</span>
                </div>
            )}

            {/* Editor / empty state */}
            {!journalBoardId ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#bbb' }}>
                    <span style={{ fontSize: 28 }}>📔</span>
                    <span style={{ fontSize: 13 }}>尚未設定 Journal 白板</span>
                    <span style={{ fontSize: 11 }}>在白板右鍵選單選「設為 Journal 白板」</span>
                </div>
            ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '32px max(40px, 8%)' }}>
                    <style>{`
                        .jdv .ProseMirror { outline: none; }
                        .jdv .ProseMirror h2 { font-size: 18px; font-weight: 700; margin: 14px 0 6px; color: #1a1a1a; }
                        .jdv .ProseMirror p { margin: 4px 0; line-height: 1.8; }
                        .jdv .ProseMirror ul { padding-left: 20px; margin: 4px 0; }
                        .jdv .ProseMirror li { margin: 2px 0; line-height: 1.7; }
                        .jdv .ProseMirror strong { font-weight: 700; }
                    `}</style>
                    <div className="jdv" style={{ maxWidth: 680, margin: '0 auto', fontSize: 15, color: '#1a1a1a' }}>
                        <EditorContent editor={tiptap} />
                    </div>
                </div>
            )}
        </>
    )
}

/* ------------------------------------------------------------------ JournalDayView (standalone full-screen) */
interface JournalDayViewProps {
    date: Date
    boards: BoardRecord[]
    onClose: () => void
    onSaveJournal: (boardId: string, dateStr: string, html: string, shapeId: string | null) => void
    onDateChange: (date: Date) => void
}

export function JournalDayView({ date, boards, onClose, onSaveJournal, onDateChange }: JournalDayViewProps) {
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'white', display: 'flex', flexDirection: 'column' }}>
            <JournalDayContent
                date={date}
                boards={boards}
                onSaveJournal={onSaveJournal}
                onDateChange={onDateChange}
                onClose={onClose}
            />
        </div>
    )
}

const navBtnStyle: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 8, border: '1px solid #e8e8e8',
    background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#666', fontWeight: 500,
}
