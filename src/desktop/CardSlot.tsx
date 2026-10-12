// src/desktop/CardSlot.tsx — 一格卡片的外框；排列模式時蓋上一層控制面板
//
// 排列模式：拖曳到另一張卡上＝交換；箭頭按鈕或方向鍵＝跟那個方向的鄰居交換；
// 卡片本身變淡、點不到（免得排列時誤開白板）。拖曳對眼睛不好的人比較吃力，箭頭按鈕是主要操作。

import { useState, type ReactNode } from 'react'
import type { DesktopCardId, MoveDirection } from '../utils/desktopLayout'
import { DESKTOP_CARD_NAMES } from './cardNames'

const ARROWS: { dir: MoveDirection; label: string; key: string }[] = [
    { dir: 'up', label: '↑', key: 'ArrowUp' },
    { dir: 'left', label: '←', key: 'ArrowLeft' },
    { dir: 'right', label: '→', key: 'ArrowRight' },
    { dir: 'down', label: '↓', key: 'ArrowDown' },
]

const DRAG_TYPE = 'application/x-scout-desktop-card'

interface Props {
    id: DesktopCardId
    editing: boolean
    spanRow: boolean
    canMove: (dir: MoveDirection) => boolean
    canHide: boolean
    onMove: (dir: MoveDirection) => void
    onSwap: (other: DesktopCardId) => void
    onHide: () => void
    children: ReactNode
}

export function CardSlot({ id, editing, spanRow, canMove, canHide, onMove, onSwap, onHide, children }: Props) {
    const [dropTarget, setDropTarget] = useState(false)
    const name = DESKTOP_CARD_NAMES[id]
    const style = spanRow ? { gridColumn: '1 / -1' } : undefined

    if (!editing) return <div className="dt-slot" style={style}>{children}</div>

    return (
        <div
            className={dropTarget ? 'dt-slot dt-slot-editing dt-slot-drop' : 'dt-slot dt-slot-editing'}
            style={style}
            tabIndex={0}
            aria-label={`${name}，方向鍵移動位置`}
            draggable
            onDragStart={e => { e.dataTransfer.setData(DRAG_TYPE, id); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={e => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setDropTarget(true) } }}
            onDragLeave={() => setDropTarget(false)}
            onDrop={e => {
                e.preventDefault()
                setDropTarget(false)
                const other = e.dataTransfer.getData(DRAG_TYPE) as DesktopCardId
                if (other && other !== id) onSwap(other)
            }}
            onKeyDown={e => {
                if (e.target !== e.currentTarget) return
                const arrow = ARROWS.find(a => a.key === e.key)
                if (arrow) { e.preventDefault(); onMove(arrow.dir) }
            }}
        >
            <div className="dt-slot-content" aria-hidden="true">{children}</div>
            <div className="dt-slot-panel">
                <div className="dt-slot-name">{name}</div>
                <div className="dt-arrows">
                    {ARROWS.map(a => (
                        <button
                            key={a.dir}
                            className={`dt-arrow dt-arrow-${a.dir}`}
                            disabled={!canMove(a.dir)}
                            onClick={() => onMove(a.dir)}
                            aria-label={`往${{ up: '上', down: '下', left: '左', right: '右' }[a.dir]}移`}
                            tabIndex={-1}
                        >{a.label}</button>
                    ))}
                </div>
                {canHide
                    ? <button className="dt-button" onClick={onHide}>隱藏</button>
                    : <span className="dt-hint">一定顯示</span>}
            </div>
        </div>
    )
}
