import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useEditor } from 'tldraw'
import { useIsDarkMode } from '@tldraw/editor'
import type { TLCardShape, ColorSwatch } from '../type/CardShape'
import { getContrastColor } from '../../../utils/colorSwatchUtils'

function genId() {
    return `sw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function isValidHex(s: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(s)
}

function computeH(count: number) {
    return 100 + Math.max(0, count - 1) * 36 + 40
}

type PickerState = { mode: 'add' } | { mode: 'edit'; swatchId: string }

interface ColorSwatchContentProps {
    shape: TLCardShape
}

export function ColorSwatchContent({ shape }: ColorSwatchContentProps) {
    const editor = useEditor()
    const isDark = useIsDarkMode()
    const swatches = useMemo(() => (shape.props.swatches ?? []) as ColorSwatch[], [shape.props.swatches])
    const mainSwatch = swatches[0]
    const extraSwatches = swatches.slice(1)

    const [pickerState, setPickerState] = useState<PickerState | null>(null)
    const [pickerHex, setPickerHex] = useState('#3B82F6')
    const [pickerName, setPickerName] = useState('')
    const [footerHovered, setFooterHovered] = useState(false)
    const [hoveredSwatchId, setHoveredSwatchId] = useState<string | null>(null)
    const hexInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (pickerState) hexInputRef.current?.select()
    }, [pickerState])

    // Close picker when shape is deselected
    useEffect(() => {
        if (!pickerState) return
        const cleanup = editor.store.listen(() => {
            if (!editor.getSelectedShapeIds().includes(shape.id)) {
                setPickerState(null)
            }
        }, { scope: 'session' })
        return cleanup
    }, [editor, shape.id, pickerState])

    const openAdd = useCallback(() => {
        setPickerHex('#3B82F6')
        setPickerName('')
        setPickerState({ mode: 'add' })
    }, [])

    const openEdit = useCallback((swatch: ColorSwatch) => {
        setPickerHex(swatch.hex)
        setPickerName(swatch.name)
        setPickerState({ mode: 'edit', swatchId: swatch.id })
    }, [])

    const closePicker = useCallback(() => setPickerState(null), [])

    const confirmPicker = useCallback(() => {
        const hex = pickerHex.trim().toUpperCase()
        if (!isValidHex(hex)) return

        if (pickerState?.mode === 'add') {
            if (swatches.length >= 8) return
            const newSwatches = [...swatches, { id: genId(), hex, name: pickerName.trim() }]
            editor.updateShape({
                id: shape.id, type: 'card',
                props: { swatches: newSwatches, h: computeH(newSwatches.length) },
            })
        } else if (pickerState?.mode === 'edit') {
            const newSwatches = swatches.map(s =>
                s.id === pickerState.swatchId ? { ...s, hex, name: pickerName.trim() } : s
            )
            editor.updateShape({ id: shape.id, type: 'card', props: { swatches: newSwatches } })
        }
        closePicker()
    }, [pickerState, pickerHex, pickerName, swatches, shape.id, editor, closePicker])

    const deleteSwatch = useCallback((swatchId: string) => {
        if (swatches.length <= 1) return
        const newSwatches = swatches.filter(s => s.id !== swatchId)
        editor.updateShape({
            id: shape.id, type: 'card',
            props: { swatches: newSwatches, h: computeH(newSwatches.length) },
        })
    }, [swatches, shape.id, editor])

    const isShapeSelected = () => editor.getSelectedShapeIds().includes(shape.id)

    if (!mainSwatch) return null

    const mainHex = mainSwatch.hex
    const mainTextColor = getContrastColor(mainHex)
    const border = isDark ? '#334155' : '#f0f0f0'
    const textColor = isDark ? '#e2e8f0' : '#1a1a1a'
    const mutedColor = isDark ? '#64748b' : '#9ca3af'
    const pickerBg = isDark ? '#1e293b' : '#ffffff'
    const pickerBorder = isDark ? '#475569' : '#e0e0e0'
    const inputBg = isDark ? '#0f172a' : '#f8f8f8'

    return (
        <div
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
        >
            {/* Main swatch block */}
            <div
                style={{
                    height: 100, flexShrink: 0,
                    backgroundColor: mainHex,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', userSelect: 'none',
                }}
                onPointerDown={(e) => {
                    if (!isShapeSelected()) return
                    e.stopPropagation()
                    openEdit(mainSwatch)
                }}
                onPointerUp={(e) => e.stopPropagation()}
            >
                <div style={{ fontSize: 15, fontWeight: 700, color: mainTextColor, letterSpacing: '0.06em', fontFamily: 'monospace' }}>
                    {mainHex}
                </div>
                {mainSwatch.name && (
                    <div style={{ fontSize: 11, color: mainTextColor, opacity: 0.75, marginTop: 4 }}>
                        {mainSwatch.name}
                    </div>
                )}
            </div>

            {/* Extra swatches */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {extraSwatches.map(swatch => (
                    <div
                        key={swatch.id}
                        style={{
                            height: 36, display: 'flex', alignItems: 'center',
                            borderTop: `1px solid ${border}`,
                            cursor: 'pointer', userSelect: 'none',
                        }}
                        onMouseEnter={() => setHoveredSwatchId(swatch.id)}
                        onMouseLeave={() => setHoveredSwatchId(null)}
                        onPointerDown={(e) => {
                            if (!isShapeSelected()) return
                            e.stopPropagation()
                            openEdit(swatch)
                        }}
                        onPointerUp={(e) => e.stopPropagation()}
                    >
                        <div style={{ width: 40, height: '100%', flexShrink: 0, backgroundColor: swatch.hex }} />
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', overflow: 'hidden' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 12, color: textColor, fontWeight: 600, flexShrink: 0 }}>
                                {swatch.hex}
                            </span>
                            {swatch.name && (
                                <span style={{ fontSize: 12, color: mutedColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {swatch.name}
                                </span>
                            )}
                        </div>
                        {hoveredSwatchId === swatch.id && swatches.length > 1 && (
                            <button
                                onPointerDown={(e) => { e.stopPropagation(); deleteSwatch(swatch.id) }}
                                onPointerUp={(e) => e.stopPropagation()}
                                style={{
                                    width: 24, height: 24, borderRadius: 4, border: 'none',
                                    background: 'none', cursor: 'pointer',
                                    color: '#ef4444', fontSize: 17, lineHeight: 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, marginRight: 6,
                                }}
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer: add button */}
            {swatches.length < 8 && !pickerState && (
                <div
                    onMouseEnter={() => setFooterHovered(true)}
                    onMouseLeave={() => setFooterHovered(false)}
                    onPointerDown={(e) => {
                        if (!isShapeSelected()) return
                        e.stopPropagation()
                        openAdd()
                    }}
                    onPointerUp={(e) => e.stopPropagation()}
                    style={{
                        height: 40, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderTop: `1px solid ${border}`,
                        color: footerHovered ? '#3b82f6' : mutedColor,
                        fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        background: footerHovered ? (isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff') : 'transparent',
                        transition: 'color 0.15s, background 0.15s',
                        userSelect: 'none',
                    }}
                >
                    + 新增顏色
                </div>
            )}

            {/* Picker panel overlay */}
            {pickerState && (
                <div
                    style={{
                        position: 'absolute', left: 0, right: 0, bottom: 0,
                        background: pickerBg,
                        borderTop: `1px solid ${pickerBorder}`,
                        padding: '10px 12px 12px',
                        boxSizing: 'border-box',
                        zIndex: 10,
                        boxShadow: isDark ? '0 -4px 12px rgba(0,0,0,0.3)' : '0 -4px 12px rgba(0,0,0,0.08)',
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <input
                            type="color"
                            value={isValidHex(pickerHex) ? pickerHex.toLowerCase() : '#3b82f6'}
                            onChange={(e) => setPickerHex(e.target.value.toUpperCase())}
                            style={{
                                width: 36, height: 32, borderRadius: 6,
                                border: `1px solid ${pickerBorder}`,
                                cursor: 'pointer', padding: 2, flexShrink: 0,
                                boxSizing: 'border-box',
                            }}
                        />
                        <input
                            ref={hexInputRef}
                            value={pickerHex}
                            onChange={(e) => setPickerHex(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmPicker()
                                if (e.key === 'Escape') closePicker()
                            }}
                            placeholder="#000000"
                            style={{
                                flex: 1, height: 32, borderRadius: 6,
                                border: `1px solid ${isValidHex(pickerHex) ? pickerBorder : '#ef4444'}`,
                                background: inputBg, color: textColor,
                                padding: '0 8px', fontSize: 13,
                                outline: 'none', fontFamily: 'monospace',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>
                    <input
                        value={pickerName}
                        onChange={(e) => setPickerName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmPicker()
                            if (e.key === 'Escape') closePicker()
                        }}
                        placeholder="顏色名稱（選填）"
                        style={{
                            width: '100%', height: 30, borderRadius: 6, marginBottom: 10,
                            border: `1px solid ${pickerBorder}`,
                            background: inputBg, color: textColor,
                            padding: '0 8px', fontSize: 12,
                            outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                            onClick={closePicker}
                            style={{
                                padding: '5px 14px', borderRadius: 7, fontSize: 12,
                                border: `1px solid ${pickerBorder}`,
                                background: 'transparent', color: textColor, cursor: 'pointer',
                            }}
                        >取消</button>
                        <button
                            onClick={confirmPicker}
                            disabled={!isValidHex(pickerHex)}
                            style={{
                                padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                                border: 'none',
                                background: isValidHex(pickerHex) ? '#3b82f6' : (isDark ? '#334155' : '#e5e7eb'),
                                color: isValidHex(pickerHex) ? '#fff' : (isDark ? '#475569' : '#9ca3af'),
                                cursor: isValidHex(pickerHex) ? 'pointer' : 'not-allowed',
                            }}
                        >確認</button>
                    </div>
                </div>
            )}
        </div>
    )
}
