import { useState, useRef, useEffect } from "react"
import { useEditor } from "tldraw"
import type { TLCardShape } from "./components/card-shape/type/CardShape"

export interface CardCreators {
    createTextCard: () => void
    createImageCard: (imgBase64: string) => void
    createTodoCard: () => void
    createLinkCard: () => void
    createBoardCard: () => void
    createColumnCard: () => void
    openImageInput: () => void
    isDark?: boolean
}

/* ================================================
   可拖曳的卡片建立按鈕
================================================ */
function DraggableCardButton({
    icon,
    label,
    cardType,
    onClick,
    onDragStart: onDragStartCb,
    onDragEnd: onDragEndCb,
    isDark,
    btnHover,
}: {
    icon: string
    label: string
    cardType: 'text' | 'todo' | 'link' | 'image' | 'board' | 'column'
    onClick: () => void
    onDragStart?: () => void
    onDragEnd?: () => void
    isDark?: boolean
    btnHover?: string
}) {
    const [hovered, setHovered] = useState(false)
    const [dragging, setDragging] = useState(false)
    const hBg = btnHover ?? '#f5f5f5'

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                draggable
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onDragStart={(e) => {
                    setDragging(true)
                    onDragStartCb?.()
                    e.dataTransfer.setData('cardType', cardType)
                    e.dataTransfer.effectAllowed = 'copy'
                    const ghost = document.createElement('div')
                    ghost.textContent = icon
                    ghost.style.cssText = 'position:fixed;top:-100px;font-size:28px;background:white;border-radius:8px;padding:6px 10px;box-shadow:0 4px 12px rgba(0,0,0,0.15)'
                    document.body.appendChild(ghost)
                    e.dataTransfer.setDragImage(ghost, 20, 20)
                    setTimeout(() => document.body.removeChild(ghost), 0)
                }}
                onDragEnd={() => { setDragging(false); onDragEndCb?.() }}
                style={{
                    width: 40, height: 40, borderRadius: 10, border: 'none',
                    background: dragging ? (isDark ? 'rgba(37,99,235,0.25)' : '#e8f0fe') : hovered ? hBg : 'transparent',
                    cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: isDark ? '#94a3b8' : '#444', transition: 'background 0.15s',
                    padding: 0, opacity: dragging ? 0.5 : 1,
                }}
            >
                {icon}
            </button>

            {hovered && !dragging && (
                <div style={{
                    position: 'absolute', left: 48, top: '50%',
                    transform: 'translateY(-50%)',
                    background: '#1a1a1a', color: 'white', fontSize: 12,
                    padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap',
                    pointerEvents: 'none', zIndex: 99999,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}>
                    {label}
                    <div style={{
                        position: 'absolute', left: -4, top: '50%',
                        transform: 'translateY(-50%)',
                        width: 0, height: 0,
                        borderTop: '4px solid transparent',
                        borderBottom: '4px solid transparent',
                        borderRight: '4px solid #1a1a1a',
                    }} />
                </div>
            )}
        </div>
    )
}

/* ================================================
   一般工具按鈕（不可拖曳）
================================================ */
function SidebarButton({
    icon, label, onClick, isActive, isDark, btnHover, btnActive, btnColor, btnActiveColor,
}: {
    icon: string
    label: string
    onClick: () => void
    isActive?: boolean
    isDark?: boolean
    btnHover?: string
    btnActive?: string
    btnColor?: string
    btnActiveColor?: string
}) {
    const [hovered, setHovered] = useState(false)
    const hBg = btnHover ?? '#f5f5f5'
    const aBg = btnActive ?? '#e8f0fe'
    const color = btnColor ?? '#444'
    const aColor = btnActiveColor ?? '#1971c2'

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: 40, height: 40, borderRadius: 10, border: 'none',
                    background: isActive ? aBg : hovered ? hBg : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: isActive ? aColor : color,
                    transition: 'background 0.15s, color 0.15s', padding: 0,
                    boxShadow: isActive ? (isDark ? '0 0 0 2px rgba(147,197,253,0.3)' : '0 0 0 2px #c7d7fd') : 'none',
                }}
            >
                {icon}
            </button>
            {hovered && (
                <div style={{
                    position: 'absolute', left: 48, top: '50%',
                    transform: 'translateY(-50%)',
                    background: '#1a1a1a', color: 'white', fontSize: 12,
                    padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap',
                    pointerEvents: 'none', zIndex: 99999,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}>
                    {label}
                    <div style={{
                        position: 'absolute', left: -4, top: '50%',
                        transform: 'translateY(-50%)',
                        width: 0, height: 0,
                        borderTop: '4px solid transparent',
                        borderBottom: '4px solid transparent',
                        borderRight: '4px solid #1a1a1a',
                    }} />
                </div>
            )}
        </div>
    )
}

/* ================================================
   對齊子選單
================================================ */
function AlignSubmenu({ onAlign, isDark, alignMenuBg, alignMenuBorder, btnHover }: {
    onAlign: (dir: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void
    isDark?: boolean
    alignMenuBg?: string
    alignMenuBorder?: string
    btnHover?: string
}) {
    const [hovered, setHovered] = useState(false)
    const [open, setOpen] = useState(false)
    const hBg = btnHover ?? '#f5f5f5'
    const menuBg = alignMenuBg ?? 'white'
    const menuBorder = alignMenuBorder ?? '#eee'

    const alignButtons = [
        { dir: 'left' as const, icon: '⇤', label: '靠左對齊' },
        { dir: 'center' as const, icon: '⬛', label: '水平置中' },
        { dir: 'right' as const, icon: '⇥', label: '靠右對齊' },
        { dir: 'top' as const, icon: '⇡', label: '靠上對齊' },
        { dir: 'middle' as const, icon: '⬜', label: '垂直置中' },
        { dir: 'bottom' as const, icon: '⇣', label: '靠下對齊' },
    ]

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen(o => !o)}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: 40, height: 40, borderRadius: 10, border: 'none',
                    background: open ? (isDark ? 'rgba(37,99,235,0.25)' : '#e8f0fe') : hovered ? hBg : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: open ? (isDark ? '#93c5fd' : '#1971c2') : (isDark ? '#94a3b8' : '#444'),
                    transition: 'background 0.15s', padding: 0,
                }}
            >⚏</button>

            {hovered && !open && (
                <div style={{
                    position: 'absolute', left: 48, top: '50%',
                    transform: 'translateY(-50%)',
                    background: '#1a1a1a', color: 'white', fontSize: 12,
                    padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                    pointerEvents: 'none', zIndex: 99999,
                }}>
                    對齊工具
                    <div style={{
                        position: 'absolute', left: -4, top: '50%',
                        transform: 'translateY(-50%)',
                        width: 0, height: 0,
                        borderTop: '4px solid transparent',
                        borderBottom: '4px solid transparent',
                        borderRight: '4px solid #1a1a1a',
                    }} />
                </div>
            )}

            {open && (
                <div style={{
                    position: 'absolute', left: 48, top: 0,
                    background: menuBg, borderRadius: 10,
                    boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.12)',
                    border: `1px solid ${menuBorder}`, padding: 6,
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 4, zIndex: 99999,
                }}>
                    {alignButtons.map(btn => (
                        <button
                            key={btn.dir}
                            onClick={() => { onAlign(btn.dir); setOpen(false) }}
                            title={btn.label}
                            style={{
                                width: 32, height: 32, borderRadius: 6, border: 'none',
                                background: 'transparent', cursor: 'pointer', fontSize: 16,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: isDark ? '#e2e8f0' : 'inherit',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = hBg)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >{btn.icon}</button>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ================================================
   主組件
================================================ */
export default function TldrawToolPanel({
    createTextCard,
    createTodoCard,
    createLinkCard,
    createBoardCard,
    createColumnCard,
    openImageInput,
    isDark,
}: CardCreators) {
    const editor = useEditor()
    const currentTool = editor.getCurrentToolId()
    const setTool = (tool: string) => editor.setCurrentTool(tool)
    const draggingCardType = useRef<string | null>(null)

    const panelBg = isDark ? 'rgba(30,41,59,0.97)' : 'rgba(255,255,255,0.96)'
    const panelBorder = isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
    const dividerColor = isDark ? '#334155' : '#eee'
    const btnHover = isDark ? '#2d3748' : '#f5f5f5'
    const btnActive = isDark ? 'rgba(37,99,235,0.25)' : '#e8f0fe'
    const btnColor = isDark ? '#94a3b8' : '#444'
    const btnActiveColor = isDark ? '#93c5fd' : '#1971c2'
    const alignMenuBg = isDark ? '#1e293b' : 'white'
    const alignMenuBorder = isDark ? '#334155' : '#eee'

    // 用 dragend 取代 drop，避免 tldraw 攔截 drop 事件
    useEffect(() => {
        const handleDragEnd = (e: DragEvent) => {
            if (!draggingCardType.current) return
            // dragend 的座標就是放手的位置
            handleCardDrop(draggingCardType.current, e.clientX, e.clientY)
            draggingCardType.current = null
        }
        document.addEventListener('dragend', handleDragEnd)
        return () => {
            document.removeEventListener('dragend', handleDragEnd)
        }
    }, [editor])

    // 處理拖曳放下
    const handleCardDrop = (cardType: string, clientX: number, clientY: number) => {
        const screenPoint = { x: clientX, y: clientY }
        const pagePoint = editor.screenToPage(screenPoint)

        const defaultProps: Record<string, Record<string, unknown>> = {
            text: { type: 'text', text: '', image: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color: 'none', w: 240, h: 160 },
            todo: { type: 'todo', text: '', image: null, todos: [{ id: `todo_${Date.now()}`, text: '新任務', checked: false }], url: null, linkEmbedUrl: null, state: 'idle', color: 'none', w: 260, h: 200 },
            link: { type: 'link', text: '', image: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color: 'none', w: 260, h: 120 },
            image: { type: 'image', text: '', image: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color: 'none', w: 300, h: 200 },
        }

        if (cardType === 'image') {
            openImageInput()
            return
        }

        if (cardType === 'board') {
            createBoardCard()
            return
        }

        if (cardType === 'column') {
            // 直接在放手位置建立 frame
            const pagePoint = editor.screenToPage({ x: clientX, y: clientY })
            editor.createShape({
                type: 'frame',
                x: pagePoint.x - 160,
                y: pagePoint.y - 240,
                props: { w: 320, h: 480, name: '欄位' }
            })
            return
        }

        editor.createShape({
            type: 'card',
            x: pagePoint.x - 120,
            y: pagePoint.y - 80,
            props: defaultProps[cardType],
        })
    }

    const alignSelected = (direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        const shapes = editor.getSelectedShapes()
        if (shapes.length < 2) return

        const xs = shapes.map(s => s.x)
        const ys = shapes.map(s => s.y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const avgX = xs.reduce((a, b) => a + b, 0) / xs.length
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        const avgY = ys.reduce((a, b) => a + b, 0) / ys.length

        const updates = shapes.map(s => {
            const cardProps = s.type === 'card' ? (s as unknown as TLCardShape).props : null
            const w = cardProps?.w ?? 0
            const h = cardProps?.h ?? 0
            let x = s.x, y = s.y
            if (direction === 'left') x = minX
            else if (direction === 'right') x = maxX - w
            else if (direction === 'center') x = avgX - w / 2
            else if (direction === 'top') y = minY
            else if (direction === 'bottom') y = maxY - h
            else if (direction === 'middle') y = avgY - h / 2
            return { id: s.id, type: s.type, x, y }
        })
        editor.updateShapes(updates)
    }

    return (
        <>
            {/* 側邊工具列 */}
            <div
                style={{
                    position: 'absolute', top: 12, left: 12,
                    display: 'flex', flexDirection: 'column', gap: 4,
                    background: panelBg, backdropFilter: 'blur(8px)',
                    borderRadius: 14, padding: '8px 6px',
                    boxShadow: isDark
                        ? '0 4px 24px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)'
                        : '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
                    border: panelBorder,
                    pointerEvents: 'auto', zIndex: 9999,
                }}
                onDragOver={(e) => e.preventDefault()}
            >
                {/* 卡片建立區（可拖曳） */}
                <DraggableCardButton icon="📝" label="文字卡片（拖曳或點擊）" cardType="text"
                    onClick={createTextCard} isDark={isDark} btnHover={btnHover}
                    onDragStart={() => {  draggingCardType.current = 'text' }}
                    onDragEnd={() => {}} />
                <DraggableCardButton icon="🖼️" label="圖片卡片（拖曳或點擊）" cardType="image"
                    onClick={openImageInput} isDark={isDark} btnHover={btnHover}
                    onDragStart={() => {  draggingCardType.current = 'image' }}
                    onDragEnd={() => {}} />
                <DraggableCardButton icon="✅" label="待辦卡片（拖曳或點擊）" cardType="todo"
                    onClick={createTodoCard} isDark={isDark} btnHover={btnHover}
                    onDragStart={() => {  draggingCardType.current = 'todo' }}
                    onDragEnd={() => {}} />
                <DraggableCardButton icon="🔗" label="連結卡片（拖曳或點擊）" cardType="link"
                    onClick={createLinkCard} isDark={isDark} btnHover={btnHover}
                    onDragStart={() => {  draggingCardType.current = 'link' }}
                    onDragEnd={() => {}} />
                <DraggableCardButton icon="📋" label="子白板（拖曳或點擊）" cardType="board"
                    onClick={createBoardCard} isDark={isDark} btnHover={btnHover}
                    onDragStart={() => { draggingCardType.current = 'board' }}
                    onDragEnd={() => {}} />
                <DraggableCardButton icon="▤" label="欄位分組（拖曳或點擊）" cardType="column"
                    onClick={createColumnCard} isDark={isDark} btnHover={btnHover}
                    onDragStart={() => { draggingCardType.current = 'column' }}
                    onDragEnd={() => {}} />

                <div style={{ height: 1, background: dividerColor, margin: '4px 0' }} />

                {/* 繪圖工具區 */}
                <SidebarButton icon="🖱️" label="選擇工具" onClick={() => setTool('select')} isActive={currentTool === 'select'} isDark={isDark} btnHover={btnHover} btnActive={btnActive} btnColor={btnColor} btnActiveColor={btnActiveColor} />
                <SidebarButton icon="✏️" label="筆刷工具" onClick={() => setTool('draw')} isActive={currentTool === 'draw'} isDark={isDark} btnHover={btnHover} btnActive={btnActive} btnColor={btnColor} btnActiveColor={btnActiveColor} />
                <SidebarButton icon="⬛" label="矩形工具" onClick={() => setTool('rectangle')} isActive={currentTool === 'rectangle'} isDark={isDark} btnHover={btnHover} btnActive={btnActive} btnColor={btnColor} btnActiveColor={btnActiveColor} />
                <SidebarButton icon="➡️" label="箭頭工具" onClick={() => setTool('arrow')} isActive={currentTool === 'arrow'} isDark={isDark} btnHover={btnHover} btnActive={btnActive} btnColor={btnColor} btnActiveColor={btnActiveColor} />

                <div style={{ height: 1, background: dividerColor, margin: '4px 0' }} />

                <AlignSubmenu onAlign={alignSelected} isDark={isDark} alignMenuBg={alignMenuBg} alignMenuBorder={alignMenuBorder} btnHover={btnHover} />
            </div>
        </>
    )
}