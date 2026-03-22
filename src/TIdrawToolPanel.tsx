import { useState, useRef, useEffect } from "react"
import { useEditor } from "tldraw"

export interface CardCreators {
    createTextCard: () => void
    createImageCard: (imgBase64: string) => void
    createTodoCard: () => void
    createLinkCard: () => void
    createBoardCard: () => void
    createColumnCard: () => void
    openImageInput: () => void
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
}: {
    icon: string
    label: string
    cardType: 'text' | 'todo' | 'link' | 'image' | 'board' | 'column'
    onClick: () => void
    onDragStart?: () => void
    onDragEnd?: () => void
}) {
    const [hovered, setHovered] = useState(false)
    const [dragging, setDragging] = useState(false)

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
                    background: dragging ? '#e8f0fe' : hovered ? '#f5f5f5' : 'transparent',
                    cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: '#444', transition: 'background 0.15s',
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
                    padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap',
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
    icon, label, onClick, isActive,
}: {
    icon: string
    label: string
    onClick: () => void
    isActive?: boolean
}) {
    const [hovered, setHovered] = useState(false)

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    width: 40, height: 40, borderRadius: 10, border: 'none',
                    background: isActive ? '#e8f0fe' : hovered ? '#f5f5f5' : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: isActive ? '#1971c2' : '#444',
                    transition: 'background 0.15s, color 0.15s', padding: 0,
                    boxShadow: isActive ? '0 0 0 2px #c7d7fd' : 'none',
                }}
            >
                {icon}
            </button>
            {hovered && (
                <div style={{
                    position: 'absolute', left: 48, top: '50%',
                    transform: 'translateY(-50%)',
                    background: '#1a1a1a', color: 'white', fontSize: 12,
                    padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap',
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
function AlignSubmenu({ onAlign }: { onAlign: (dir: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void }) {
    const [hovered, setHovered] = useState(false)
    const [open, setOpen] = useState(false)

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
                    background: open ? '#e8f0fe' : hovered ? '#f5f5f5' : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: open ? '#1971c2' : '#444',
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
                    background: 'white', borderRadius: 10,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    border: '1px solid #eee', padding: 6,
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
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
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
}: CardCreators) {
    const editor = useEditor()
    const currentTool = editor.getCurrentToolId()
    const setTool = (tool: string) => editor.setCurrentTool(tool)
    const draggingCardType = useRef<string | null>(null)

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

        const defaultProps: Record<string, any> = {
            text: { type: 'text', text: '', image: null, blobUrl: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color: 'none', w: 240, h: 160 },
            todo: { type: 'todo', text: '', image: null, blobUrl: null, todos: [{ id: `todo_${Date.now()}`, text: '新任務', checked: false }], url: null, linkEmbedUrl: null, state: 'idle', color: 'none', w: 260, h: 200 },
            link: { type: 'link', text: '', image: null, blobUrl: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color: 'none', w: 260, h: 120 },
            image: { type: 'image', text: '', image: null, blobUrl: null, todos: [], url: '', linkEmbedUrl: null, state: 'idle', color: 'none', w: 300, h: 200 },
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
            const shape = s as any
            const w = shape.props?.w ?? 0
            const h = shape.props?.h ?? 0
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
                    position: 'absolute', top: 58, left: 12,
                    display: 'flex', flexDirection: 'column', gap: 4,
                    background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)',
                    borderRadius: 14, padding: '8px 6px',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
                    pointerEvents: 'auto', zIndex: 9999,
                }}
                // 讓側邊欄本身也能接收 drop（放到側邊欄外面的畫布才觸發）
                onDragOver={(e) => e.preventDefault()}
            >
                {/* 卡片建立區（可拖曳） */}
                <DraggableCardButton icon="📝" label="文字卡片（拖曳或點擊）" cardType="text"
                    onClick={createTextCard}
                    onDragStart={() => {  draggingCardType.current = 'text' }}
                    onDragEnd={() => {}} />
                <DraggableCardButton icon="🖼️" label="圖片卡片（拖曳或點擊）" cardType="image"
                    onClick={openImageInput}
                    onDragStart={() => {  draggingCardType.current = 'image' }}
                    onDragEnd={() => {}} />
                <DraggableCardButton icon="✅" label="待辦卡片（拖曳或點擊）" cardType="todo"
                    onClick={createTodoCard}
                    onDragStart={() => {  draggingCardType.current = 'todo' }}
                    onDragEnd={() => {}} />
                <DraggableCardButton icon="🔗" label="連結卡片（拖曳或點擊）" cardType="link"
                    onClick={createLinkCard}
                    onDragStart={() => {  draggingCardType.current = 'link' }}
                    onDragEnd={() => {}} />
                <DraggableCardButton icon="📋" label="子白板（拖曳或點擊）" cardType="board"
                    onClick={createBoardCard}
                    onDragStart={() => { draggingCardType.current = 'board' }}
                    onDragEnd={() => {}} />
                <DraggableCardButton icon="▤" label="欄位分組（拖曳或點擊）" cardType="column"
                    onClick={createColumnCard}
                    onDragStart={() => { draggingCardType.current = 'column' }}
                    onDragEnd={() => {}} />

                <div style={{ height: 1, background: '#eee', margin: '4px 0' }} />

                {/* 繪圖工具區 */}
                <SidebarButton icon="🖱️" label="選擇工具" onClick={() => setTool('select')} isActive={currentTool === 'select'} />
                <SidebarButton icon="✏️" label="筆刷工具" onClick={() => setTool('draw')} isActive={currentTool === 'draw'} />
                <SidebarButton icon="⬛" label="矩形工具" onClick={() => setTool('rectangle')} isActive={currentTool === 'rectangle'} />
                <SidebarButton icon="➡️" label="箭頭工具" onClick={() => setTool('arrow')} isActive={currentTool === 'arrow'} />

                <div style={{ height: 1, background: '#eee', margin: '4px 0' }} />

                <AlignSubmenu onAlign={alignSelected} />
            </div>
        </>
    )
}