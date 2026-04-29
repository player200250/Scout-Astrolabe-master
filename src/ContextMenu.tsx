// src/ContextMenu.tsx
console.log('[ContextMenu] module loaded')
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { CARD_COLORS } from './components/card-shape/type/CardShape'
import type { CardColor } from './components/card-shape/type/CardShape'
import { db } from './db'
import type { TemplateRecord } from './db'

interface MenuItem {
    label: string
    icon: string
    action: () => void
    danger?: boolean
    divider?: boolean
    submenu?: MenuItem[]
}

interface ContextMenuProps {
    x: number
    y: number
    items: MenuItem[]
    onClose: () => void
    showColorPicker?: boolean
    onColorPick?: (color: CardColor) => void
    currentColor?: CardColor
    isDark?: boolean
}

// ── Built-in templates ──────────────────────────────────────────────────────

const BUILTIN_TEMPLATES: { icon: string; name: string; w: number; h: number; content: string }[] = [
    {
        icon: '📝',
        name: '會議記錄',
        w: 280, h: 320,
        content: '<h2>會議記錄</h2><p><strong>日期：</strong></p><p><strong>參與者：</strong></p><p><strong>討論重點</strong></p><p></p><p><strong>待辦事項</strong></p><p></p>',
    },
    {
        icon: '📚',
        name: '讀書筆記',
        w: 280, h: 380,
        content: '<h2>讀書筆記</h2><p><strong>書名：</strong></p><p><strong>重點摘要</strong></p><p></p><p><strong>我的想法</strong></p><p></p><p><strong>行動</strong></p><p></p>',
    },
    {
        icon: '🐛',
        name: '問題拆解',
        w: 280, h: 380,
        content: '<h2>問題拆解</h2><p><strong>問題描述：</strong></p><p><strong>可能原因</strong></p><p></p><p><strong>嘗試方案</strong></p><p></p><p><strong>結果</strong></p><p></p>',
    },
    {
        icon: '🎯',
        name: '目標設定',
        w: 280, h: 320,
        content: '<h2>目標設定</h2><p><strong>目標：</strong></p><p><strong>為什麼重要：</strong></p><p><strong>行動步驟</strong></p><p></p><p><strong>截止日：</strong></p>',
    },
    {
        icon: '💡',
        name: '想法捕捉',
        w: 280, h: 260,
        content: '<h2>想法捕捉</h2><p><strong>想法：</strong></p><p><strong>背景：</strong></p><p><strong>下一步：</strong></p>',
    },
]

function getDefaultTemplateName(html: string): string {
    const h2 = html.match(/<h2[^>]*>(.*?)<\/h2>/i)
    if (h2) return h2[1].replace(/<[^>]+>/g, '').trim()
    const p = html.match(/<p[^>]*>(.*?)<\/p>/i)
    if (p) {
        const text = p[1].replace(/<[^>]+>/g, '').trim()
        if (text) return text.slice(0, 20)
    }
    return '自訂模板'
}

// ── ContextMenuUI ───────────────────────────────────────────────────────────

function ContextMenuUI({ x, y, items, onClose, showColorPicker, onColorPick, currentColor, isDark }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null)
    const itemRefs = useRef<(HTMLDivElement | null)[]>([])
    const [pos, setPos] = useState({ x, y })
    const [activeSubIdx, setActiveSubIdx] = useState<number | null>(null)
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const bg = isDark ? '#1e293b' : '#fff'
    const textColor = isDark ? '#e2e8f0' : '#1a1a1a'
    const dividerColor = isDark ? '#334155' : '#f0f0f0'
    const hoverBg = isDark ? '#2d3748' : '#f5f5f5'
    const mutedColor = isDark ? '#64748b' : '#999'

    const cancelClose = () => {
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null }
    }
    const scheduleClose = () => {
        cancelClose()
        closeTimerRef.current = setTimeout(() => setActiveSubIdx(null), 180)
    }

    useEffect(() => {
        if (!ref.current) return
        const { width, height } = ref.current.getBoundingClientRect()
        const newX = x + width > window.innerWidth ? x - width : x
        const newY = y + height > window.innerHeight ? y - height : y
        setPos({ x: newX, y: newY })
    }, [x, y])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose()
        }
        const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        setTimeout(() => window.addEventListener('mousedown', handler), 0)
        window.addEventListener('keydown', escHandler)
        return () => {
            window.removeEventListener('mousedown', handler)
            window.removeEventListener('keydown', escHandler)
        }
    }, [onClose])

    useEffect(() => () => { cancelClose() }, [])

    const menuBoxStyle = {
        background: bg, borderRadius: 10,
        boxShadow: isDark
            ? '0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)'
            : '0 4px 24px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
        zIndex: 99999, minWidth: 180, padding: '4px 0',
        userSelect: 'none' as const, pointerEvents: 'auto' as const,
    }

    const renderSubmenu = () => {
        if (activeSubIdx === null) return null
        const parentItem = items[activeSubIdx]
        if (!parentItem?.submenu?.length) return null

        const parentEl = itemRefs.current[activeSubIdx]
        if (!parentEl) return null
        const rect = parentEl.getBoundingClientRect()

        const estimatedHeight = parentItem.submenu.length * 34 + 24
        let subLeft = rect.right + 4
        if (subLeft + 220 > window.innerWidth) subLeft = rect.left - 224
        let subTop = rect.top
        if (subTop + estimatedHeight > window.innerHeight) {
            subTop = Math.max(8, window.innerHeight - estimatedHeight - 8)
        }

        return (
            <div
                style={{ position: 'fixed', top: subTop, left: subLeft, ...menuBoxStyle, zIndex: 100000 }}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
            >
                {parentItem.submenu.map((sub, si) => (
                    <div key={si}>
                        {sub.divider && si > 0 && (
                            <div style={{ height: 1, background: dividerColor, margin: '4px 0' }} />
                        )}
                        <div
                            onMouseDown={(e) => { e.stopPropagation(); sub.action(); onClose() }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '7px 14px', cursor: 'pointer', fontSize: 13,
                                color: sub.danger ? '#ff4d4f' : textColor,
                                borderRadius: 6, margin: '0 4px', transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => {
                                cancelClose()
                                e.currentTarget.style.background = sub.danger
                                    ? (isDark ? 'rgba(255,77,79,0.15)' : '#fff1f0')
                                    : hoverBg
                            }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                            <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{sub.icon}</span>
                            <span>{sub.label}</span>
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <>
            <div ref={ref} style={{ position: 'fixed', top: pos.y, left: pos.x, ...menuBoxStyle }}>
                {showColorPicker && onColorPick && (
                    <>
                        <div style={{ padding: '8px 14px 4px', fontSize: 11, color: mutedColor, fontWeight: 600, letterSpacing: '0.5px' }}>
                            卡片顏色
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 14px 8px' }}>
                            {(Object.entries(CARD_COLORS) as [CardColor, typeof CARD_COLORS[CardColor]][]).map(([key, val]) => (
                                <div
                                    key={key}
                                    title={val.label}
                                    onClick={() => { onColorPick(key); onClose() }}
                                    style={{
                                        width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                                        backgroundColor: key === 'none' ? (isDark ? '#334155' : '#f0f0f0') : val.accent,
                                        border: currentColor === key ? `2px solid ${textColor}` : '2px solid transparent',
                                        boxSizing: 'border-box', transition: 'transform 0.1s',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                                >
                                    {key === 'none' && <span style={{ fontSize: 10, color: mutedColor }}>✕</span>}
                                </div>
                            ))}
                        </div>
                        <div style={{ height: 1, background: dividerColor, margin: '0 0 4px' }} />
                    </>
                )}

                {items.map((item, idx) => (
                    <div key={idx}>
                        {item.divider && idx > 0 && (
                            <div style={{ height: 1, background: dividerColor, margin: '4px 0' }} />
                        )}
                        <div
                            ref={el => { itemRefs.current[idx] = el }}
                            onClick={() => {
                                if (item.submenu) return
                                item.action()
                                onClose()
                            }}
                            onMouseEnter={e => {
                                cancelClose()
                                setActiveSubIdx(item.submenu ? idx : null)
                                e.currentTarget.style.background = item.danger
                                    ? (isDark ? 'rgba(255,77,79,0.15)' : '#fff1f0')
                                    : hoverBg
                            }}
                            onMouseLeave={e => {
                                if (item.submenu) scheduleClose()
                                e.currentTarget.style.background = 'transparent'
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '7px 14px', cursor: 'pointer', fontSize: 13,
                                color: item.danger ? '#ff4d4f' : textColor,
                                borderRadius: 6, margin: '0 4px', transition: 'background 0.1s',
                            }}
                        >
                            <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                            <span style={{ flex: 1 }}>{item.label}</span>
                            {item.submenu && <span style={{ opacity: 0.45, fontSize: 12 }}>›</span>}
                        </div>
                    </div>
                ))}
            </div>
            {renderSubmenu()}
        </>
    )
}

// ── SaveTemplateModal ───────────────────────────────────────────────────────

interface SaveTemplateModalProps {
    defaultName: string
    cardContent: string
    onConfirm: (name: string, content: string) => void
    onClose: () => void
    isDark: boolean
}

function SaveTemplateModal({ defaultName, cardContent, onConfirm, onClose, isDark }: SaveTemplateModalProps) {
    const [name, setName] = useState(defaultName)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const handleConfirm = () => { if (name.trim()) onConfirm(name.trim(), cardContent) }

    const bg = isDark ? '#1e293b' : '#fff'
    const text = isDark ? '#e2e8f0' : '#1a1a1a'
    const border = isDark ? '1px solid #475569' : '1px solid #e0e0e0'

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}
            onMouseDown={onClose}
        >
            <div
                style={{ background: bg, borderRadius: 14, padding: '22px 26px', minWidth: 320, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', pointerEvents: 'auto' }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div style={{ fontWeight: 600, fontSize: 15, color: text, marginBottom: 14 }}>⭐ 存為模板</div>
                <input
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onClose() }}
                    placeholder="模板名稱"
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '9px 13px', borderRadius: 9, fontSize: 14,
                        border, background: isDark ? '#0f172a' : '#f9f9f9',
                        color: text, outline: 'none',
                    }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '7px 18px', borderRadius: 8, border, background: 'transparent', color: text, cursor: 'pointer', fontSize: 13 }}
                    >取消</button>
                    <button
                        onClick={handleConfirm}
                        style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >確認</button>
                </div>
            </div>
        </div>
    )
}

// ── useContextMenu hook ─────────────────────────────────────────────────────

interface UseContextMenuOptions {
    editor: Editor | null
    createTextCard: (x?: number, y?: number) => void
    createTodoCard: (x?: number, y?: number) => void
    createLinkCard: (x?: number, y?: number) => void
    openImageInput: () => void
    // Required — always passed from WhiteboardTools
    createTextCardWithContent: (x: number, y: number, content: string, w?: number, h?: number) => void
    isInboxBoard?: boolean
    onMoveCard?: (shapeId: string) => void
    isDark?: boolean
}

export function useContextMenu({
    editor,
    createTextCard,
    createTodoCard,
    createLinkCard,
    openImageInput,
    createTextCardWithContent,
    isInboxBoard,
    onMoveCard,
    isDark,
}: UseContextMenuOptions) {
    const [saveTemplateState, setSaveTemplateState] = useState<{ defaultName: string; cardContent: string } | null>(null)

    const [menu, setMenu] = useState<{
        x: number; y: number; items: MenuItem[]
        showColorPicker?: boolean
        onColorPick?: (color: CardColor) => void
        currentColor?: CardColor
    } | null>(null)

    // Ref keeps latest templates visible to the event handler closure without re-registering the listener
    const customTemplatesRef = useRef<TemplateRecord[]>([])

    const refreshTemplates = useCallback(async () => {
        try {
            const rows: TemplateRecord[] = await db.table('templates').orderBy('createdAt').reverse().toArray()
            customTemplatesRef.current = rows
        } catch {
            customTemplatesRef.current = []
        }
    }, [])

    useEffect(() => { refreshTemplates() }, [refreshTemplates])

    const handleSaveTemplate = useCallback(async (name: string, content: string) => {
        setSaveTemplateState(null)
        try {
            await db.table('templates').put({
                id: `tmpl_${Date.now()}`,
                name,
                content,
                createdAt: Date.now(),
            } satisfies TemplateRecord)
            await refreshTemplates()
        } catch (err) {
            console.error('[Template] 儲存失敗', err)
        }
    }, [refreshTemplates])

    useEffect(() => {
        if (!editor) return

        const handleContextMenu = (e: MouseEvent) => {
            console.log('[ContextMenu] handleContextMenu triggered', e.clientX, e.clientY)
            e.preventDefault()
            e.stopPropagation()

            const screenPoint = { x: e.clientX, y: e.clientY }
            const canvasPoint = editor.screenToPage(screenPoint)
            const hitShape = editor.getShapeAtPoint(canvasPoint)
            const isCard = hitShape?.type === 'card'

            if (isCard && hitShape) {
                const shape = hitShape as any
                const cardType: string = shape.props?.type ?? ''
                const isLink = cardType === 'link'
                const isText = cardType === 'text'
                const currentColor: CardColor = shape.props?.color ?? 'none'

                console.log('[ContextMenu] buildMenuItems called', {
                    hasCreateTextCardWithContent: !!createTextCardWithContent,
                    isText,
                    selectedShape: shape.props?.type,
                })

                const items: MenuItem[] = [
                    {
                        icon: '🔍',
                        label: '縮放至此卡片',
                        action: () => {
                            editor.select(hitShape.id)
                            editor.zoomToSelection({ animation: { duration: 300 } })
                        },
                    },
                    {
                        icon: '📋',
                        label: '複製卡片',
                        action: () => {
                            editor.select(hitShape.id)
                            editor.duplicateShapes([hitShape.id], { x: 20, y: 20 })
                        },
                    },
                ]

                if (isLink) {
                    items.push({
                        icon: '✏️',
                        label: '編輯連結',
                        divider: true,
                        action: () => {
                            editor.updateShape({
                                id: hitShape.id, type: 'card',
                                props: { state: 'editing', linkEmbedUrl: null },
                            })
                        },
                    })
                }

                // 存為模板：僅限純文字卡片
                if (isText) {
                    const cardContent: string = shape.props?.text ?? ''
                    items.push({
                        icon: '⭐',
                        label: '存為模板',
                        divider: true,
                        action: () => {
                            setMenu(null)
                            setSaveTemplateState({ defaultName: getDefaultTemplateName(cardContent), cardContent })
                        },
                    })
                }

                if (isInboxBoard && onMoveCard) {
                    items.push({
                        icon: '📦',
                        label: '移到白板...',
                        divider: true,
                        action: () => onMoveCard(hitShape.id),
                    })
                }

                items.push({
                    icon: '🗑️',
                    label: '刪除卡片',
                    danger: true,
                    divider: !isInboxBoard && !isLink && !isText,
                    action: () => { editor.deleteShapes([hitShape.id]) },
                })

                setMenu({
                    x: e.clientX, y: e.clientY, items,
                    showColorPicker: true,
                    currentColor,
                    onColorPick: (color: CardColor) => {
                        editor.updateShape({ id: hitShape.id, type: 'card', props: { color } })
                    },
                })
            } else {
                // 白板空白處右鍵
                const px = canvasPoint.x
                const py = canvasPoint.y
                const customs = customTemplatesRef.current

                // 建立內建模板 submenu items
                const templateSubmenu: MenuItem[] = [
                    {
                        icon: '✨',
                        label: '空白文字卡片',
                        action: () => createTextCard(px, py),
                    },
                ]

                for (const t of BUILTIN_TEMPLATES) {
                    const tmplContent = t.content
                    const tmplW = t.w
                    const tmplH = t.h
                    console.log('[Template] pushing template', t.name)
                    templateSubmenu.push({
                        icon: t.icon,
                        label: t.name,
                        action: () => {
                            console.log('[Template] action triggered', {
                                px, py,
                                contentLength: tmplContent.length,
                                hasCreateFn: !!createTextCardWithContent,
                            })
                            createTextCardWithContent(px, py, tmplContent, tmplW, tmplH)
                        },
                    })
                }

                // 自訂模板
                if (customs.length > 0) {
                    customs.forEach((t, i) => {
                        const tmplContent = t.content
                        templateSubmenu.push({
                            icon: '⭐',
                            label: t.name,
                            divider: i === 0,
                            action: () => createTextCardWithContent(px, py, tmplContent),
                        })
                    })

                    // 刪除自訂模板
                    customs.forEach((t, i) => {
                        const tmplId = t.id
                        const tmplName = t.name
                        templateSubmenu.push({
                            icon: '🗑️',
                            label: `刪除「${tmplName}」`,
                            divider: i === 0,
                            danger: true,
                            action: async () => {
                                try {
                                    await db.table('templates').delete(tmplId)
                                    await refreshTemplates()
                                } catch (err) {
                                    console.error('[Template] 刪除失敗', err)
                                }
                            },
                        })
                    })
                }

                setMenu({
                    x: e.clientX, y: e.clientY,
                    items: [
                        { icon: '📝', label: '新增文字卡片', action: () => createTextCard(px, py) },
                        { icon: '✅', label: '新增待辦清單', action: () => createTodoCard(px, py) },
                        { icon: '🔗', label: '新增連結卡片', action: () => createLinkCard(px, py) },
                        { icon: '🖼️', label: '新增圖片卡片', action: () => openImageInput() },
                        {
                            icon: '📋',
                            label: '從模板新增',
                            divider: true,
                            action: () => {},
                            submenu: templateSubmenu,
                        },
                    ],
                })
            }
        }

        window.addEventListener('contextmenu', handleContextMenu, { capture: true })
        return () => window.removeEventListener('contextmenu', handleContextMenu, { capture: true })
    }, [editor, createTextCard, createTodoCard, createLinkCard, openImageInput, createTextCardWithContent, isInboxBoard, onMoveCard, refreshTemplates])

    const closeMenu = () => setMenu(null)

    const menuElement = (
        <>
            {menu && (
                <ContextMenuUI
                    x={menu.x} y={menu.y} items={menu.items}
                    onClose={closeMenu}
                    showColorPicker={menu.showColorPicker}
                    onColorPick={menu.onColorPick}
                    currentColor={menu.currentColor}
                    isDark={isDark}
                />
            )}
            {saveTemplateState && (
                <SaveTemplateModal
                    defaultName={saveTemplateState.defaultName}
                    cardContent={saveTemplateState.cardContent}
                    onConfirm={handleSaveTemplate}
                    onClose={() => setSaveTemplateState(null)}
                    isDark={isDark ?? false}
                />
            )}
        </>
    )

    return { menuElement }
}
