import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useIsDarkMode } from '@tldraw/editor'
import { useEditor } from 'tldraw'
import type { TLCardShape, TableRow } from '../type/CardShape'

interface TableContentProps {
    shape: TLCardShape
}

function genId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function TableContent({ shape }: TableContentProps) {
    const editor = useEditor()
    const isDark = useIsDarkMode()
    const p = shape.props
    const cols = p.tableCols ?? 3
    // 未設視為開啟（向後相容：既有表格維持首列標題樣式）
    const headerRow = p.tableHeaderRow ?? true
    const tableData = useMemo(() => p.tableData ?? [] as TableRow[], [p.tableData])

    const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null)
    const [isHoveringFooter, setIsHoveringFooter] = useState(false)
    const [hoveredRow, setHoveredRow] = useState<number | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    // Prevents onBlur from clearing editingCell when navigating cell-to-cell
    const navigatingRef = useRef(false)

    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [editingCell])

    const enterCell = useCallback((rowIdx: number, colIdx: number) => {
        navigatingRef.current = true
        editor.setEditingShape(shape.id)
        setEditingCell({ rowIdx, colIdx })
        requestAnimationFrame(() => { navigatingRef.current = false })
    }, [editor, shape.id])

    const exitEditing = useCallback(() => {
        setEditingCell(null)
        editor.setEditingShape(null)
    }, [editor])

    const handleCellBlur = useCallback(() => {
        if (navigatingRef.current) return
        exitEditing()
    }, [exitEditing])

    const updateCell = useCallback((rowIdx: number, colIdx: number, value: string) => {
        const newData = tableData.map((row, ri) => {
            if (ri !== rowIdx) return row
            return { ...row, cells: row.cells.map((cell, ci) => ci === colIdx ? { ...cell, content: value } : cell) }
        })
        editor.updateShape({ id: shape.id, type: 'card', props: { tableData: newData } })
    }, [editor, shape.id, tableData])

    const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
        if (e.key === 'Tab') {
            e.preventDefault()
            let newRow = rowIdx
            let newCol = colIdx
            if (e.shiftKey) {
                newCol--
                if (newCol < 0) { newCol = cols - 1; newRow-- }
                if (newRow < 0) { newRow = tableData.length - 1 }
            } else {
                newCol++
                if (newCol >= cols) { newCol = 0; newRow++ }
                if (newRow >= tableData.length) { newRow = 0 }
            }
            navigatingRef.current = true
            requestAnimationFrame(() => { navigatingRef.current = false })
            setEditingCell({ rowIdx: newRow, colIdx: newCol })
        } else if (e.key === 'Enter') {
            e.preventDefault()
            let newRow = rowIdx + 1
            if (newRow >= tableData.length) newRow = 0
            navigatingRef.current = true
            requestAnimationFrame(() => { navigatingRef.current = false })
            setEditingCell({ rowIdx: newRow, colIdx })
        } else if (e.key === 'Escape') {
            e.preventDefault()
            exitEditing()
        }
    }, [cols, tableData.length, exitEditing])

    const deleteRow = useCallback((rowIdx: number) => {
        if (tableData.length <= 1) return
        const newData = tableData.filter((_, ri) => ri !== rowIdx)
        const newH = 40 + (newData.length - 1) * 36 + 32
        editor.updateShape({ id: shape.id, type: 'card', props: { tableData: newData, h: newH } })
    }, [editor, shape.id, tableData])

    const addRow = useCallback(() => {
        const newRow: TableRow = {
            id: `row_${genId()}`,
            cells: Array.from({ length: cols }, () => ({ id: `cell_${genId()}`, content: '' }))
        }
        const newData = [...tableData, newRow]
        const newH = 40 + (newData.length - 1) * 36 + 32
        editor.updateShape({ id: shape.id, type: 'card', props: { tableData: newData, h: newH } })
    }, [editor, shape.id, tableData, cols])

    const borderColor = isDark ? '#334155' : '#e8e8e8'
    const headerBg = isDark ? '#334155' : '#f5f5f5'
    const oddRowBg = isDark ? '#1e293b' : '#fafafa'
    const textColor = isDark ? '#e2e8f0' : '#1a1a1a'
    const mutedColor = isDark ? '#64748b' : '#aaa'

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <tbody>
                        {tableData.map((row, rowIdx) => {
                            const isHeader = headerRow && rowIdx === 0
                            const isOdd = rowIdx % 2 === 1
                            const rowBg = isHeader ? headerBg : isOdd ? oddRowBg : (isDark ? 'transparent' : '#ffffff')

                            return (
                                <tr
                                    key={row.id}
                                    onMouseEnter={() => setHoveredRow(rowIdx)}
                                    onMouseLeave={() => setHoveredRow(null)}
                                >
                                    {row.cells.map((cell, colIdx) => {
                                        const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colIdx === colIdx
                                        return (
                                            <td
                                                key={cell.id}
                                                onPointerDown={(e) => {
                                                    if (!editor.getSelectedShapeIds().includes(shape.id)) return
                                                    e.stopPropagation()
                                                    enterCell(rowIdx, colIdx)
                                                }}
                                                style={{
                                                    background: rowBg,
                                                    border: `1px solid ${borderColor}`,
                                                    padding: 0,
                                                    position: 'relative',
                                                    height: isHeader ? 40 : 36,
                                                    cursor: 'text',
                                                }}
                                            >
                                                {isEditing ? (
                                                    <input
                                                        ref={inputRef}
                                                        value={cell.content}
                                                        onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                                                        onBlur={handleCellBlur}
                                                        onPointerDown={(e) => e.stopPropagation()}
                                                        style={{
                                                            position: 'absolute', inset: 0,
                                                            width: '100%', height: '100%',
                                                            border: 'none',
                                                            outline: `2px solid #3b82f6`,
                                                            outlineOffset: -2,
                                                            background: isDark ? '#1e3a5f' : '#eff6ff',
                                                            padding: '0 12px',
                                                            fontSize: 13,
                                                            fontWeight: isHeader ? 500 : 400,
                                                            color: textColor,
                                                            boxSizing: 'border-box',
                                                            fontFamily: 'inherit',
                                                        }}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        padding: '0 12px',
                                                        fontSize: 13,
                                                        fontWeight: isHeader ? 500 : 400,
                                                        color: textColor,
                                                        height: '100%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        userSelect: 'none',
                                                    }}>
                                                        {cell.content}
                                                    </div>
                                                )}
                                                {colIdx === cols - 1 && hoveredRow === rowIdx && tableData.length > 1 && (
                                                    <button
                                                        onPointerDown={(e) => { e.stopPropagation(); deleteRow(rowIdx) }}
                                                        style={{
                                                            position: 'absolute', right: 4,
                                                            top: '50%', transform: 'translateY(-50%)',
                                                            background: 'none', border: 'none',
                                                            cursor: 'pointer', color: '#ef4444',
                                                            padding: '0 2px', fontSize: 16, lineHeight: 1,
                                                            display: 'flex', alignItems: 'center',
                                                        }}
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Add row footer */}
            <div
                onMouseEnter={() => setIsHoveringFooter(true)}
                onMouseLeave={() => setIsHoveringFooter(false)}
                onPointerDown={(e) => {
                    if (!editor.getSelectedShapeIds().includes(shape.id)) return
                    e.stopPropagation()
                    addRow()
                }}
                onPointerUp={(e) => e.stopPropagation()}
                style={{
                    height: 32, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    borderTop: `1px solid ${borderColor}`,
                    color: isHoveringFooter ? '#3b82f6' : mutedColor,
                    fontSize: 12, fontWeight: 500,
                    background: isHoveringFooter ? (isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff') : 'transparent',
                    transition: 'color 0.15s, background 0.15s',
                    userSelect: 'none',
                }}
            >
                + 新增列
            </div>
        </div>
    )
}
