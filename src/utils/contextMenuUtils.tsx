// src/utils/contextMenuUtils.tsx
// useContextMenu hook（從 ContextMenu.tsx 拆出，避免 component 與 hook/util 混在同一檔案）

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import { STICKY_COLORS, STICKY_COLOR_LIST } from '../components/card-shape/type/CardShape'
import type { CardColor, TLCardShape, StickyColor, CardStatusType, PriorityType } from '../components/card-shape/type/CardShape'
import { db } from '../db'
import type { TemplateRecord } from '../db'
import { saveCardToTrash, getCardPreview } from './trashUtils'
import { sanitizeCardProps } from './snapshot'
import type { SnapshotShapeProps } from './snapshot'
import { ContextMenuUI, SaveTemplateModal, BatchAddTagModal } from '../ContextMenu'
import type { MenuItem } from '../ContextMenu'

// ── Alignment helpers ───────────────────────────────────────────────────────

type AlignDirection = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'
type DistributeAxis = 'x' | 'y'

function alignShapes(editor: Editor, ids: TLShapeId[], direction: AlignDirection) {
    const shapes: TLCardShape[] = []
    for (const id of ids) {
        const s = editor.getShape(id)
        if (s?.type === 'card') shapes.push(s as unknown as TLCardShape)
    }
    if (shapes.length < 2) return

    editor.batch(() => {
        const updates: { id: TLShapeId; type: 'card'; x?: number; y?: number }[] = []
        switch (direction) {
            case 'left': {
                const ref = Math.min(...shapes.map(s => s.x))
                shapes.forEach(s => updates.push({ id: s.id, type: 'card', x: ref }))
                break
            }
            case 'right': {
                const ref = Math.max(...shapes.map(s => s.x + s.props.w))
                shapes.forEach(s => updates.push({ id: s.id, type: 'card', x: ref - s.props.w }))
                break
            }
            case 'top': {
                const ref = Math.min(...shapes.map(s => s.y))
                shapes.forEach(s => updates.push({ id: s.id, type: 'card', y: ref }))
                break
            }
            case 'bottom': {
                const ref = Math.max(...shapes.map(s => s.y + s.props.h))
                shapes.forEach(s => updates.push({ id: s.id, type: 'card', y: ref - s.props.h }))
                break
            }
            case 'centerX': {
                const minX = Math.min(...shapes.map(s => s.x))
                const maxX = Math.max(...shapes.map(s => s.x + s.props.w))
                const cx = (minX + maxX) / 2
                shapes.forEach(s => updates.push({ id: s.id, type: 'card', x: cx - s.props.w / 2 }))
                break
            }
            case 'centerY': {
                const minY = Math.min(...shapes.map(s => s.y))
                const maxY = Math.max(...shapes.map(s => s.y + s.props.h))
                const cy = (minY + maxY) / 2
                shapes.forEach(s => updates.push({ id: s.id, type: 'card', y: cy - s.props.h / 2 }))
                break
            }
        }
        editor.updateShapes(updates)
    })
}

function distributeShapes(editor: Editor, ids: TLShapeId[], axis: DistributeAxis) {
    const shapes: TLCardShape[] = []
    for (const id of ids) {
        const s = editor.getShape(id)
        if (s?.type === 'card') shapes.push(s as unknown as TLCardShape)
    }
    if (shapes.length < 3) return

    editor.batch(() => {
        if (axis === 'x') {
            const sorted = [...shapes].sort((a, b) => a.x - b.x)
            const last = sorted[sorted.length - 1]
            const span = last.x + last.props.w - sorted[0].x
            const totalW = sorted.reduce((sum, s) => sum + s.props.w, 0)
            const gap = (span - totalW) / (sorted.length - 1)
            let cursor = sorted[0].x
            editor.updateShapes(sorted.map(s => {
                const x = cursor
                cursor += s.props.w + gap
                return { id: s.id, type: 'card' as const, x }
            }))
        } else {
            const sorted = [...shapes].sort((a, b) => a.y - b.y)
            const last = sorted[sorted.length - 1]
            const span = last.y + last.props.h - sorted[0].y
            const totalH = sorted.reduce((sum, s) => sum + s.props.h, 0)
            const gap = (span - totalH) / (sorted.length - 1)
            let cursor = sorted[0].y
            editor.updateShapes(sorted.map(s => {
                const y = cursor
                cursor += s.props.h + gap
                return { id: s.id, type: 'card' as const, y }
            }))
        }
    })
}

// ── Batch card-prop helpers ─────────────────────────────────────────────────

function setBatchStatus(editor: Editor, ids: TLShapeId[], cardStatus: CardStatusType) {
    editor.batch(() => {
        editor.updateShapes(ids.map(id => ({ id, type: 'card' as const, props: { cardStatus } })))
    })
}

function setBatchPriority(editor: Editor, ids: TLShapeId[], priority: PriorityType) {
    editor.batch(() => {
        editor.updateShapes(ids.map(id => ({ id, type: 'card' as const, props: { priority } })))
    })
}

/** 為每張卡片附加標籤（去重，不覆蓋既有標籤；已有該標籤的卡片跳過） */
function addBatchTag(editor: Editor, ids: TLShapeId[], tag: string) {
    editor.batch(() => {
        const updates = ids.flatMap(id => {
            const s = editor.getShape(id)
            if (s?.type !== 'card') return []
            const existing = (s as unknown as TLCardShape).props.tags ?? []
            if (existing.includes(tag)) return []
            return [{ id, type: 'card' as const, props: { tags: [...existing, tag] } }]
        })
        if (updates.length) editor.updateShapes(updates)
    })
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

// ── useContextMenu hook ─────────────────────────────────────────────────────

export interface UseContextMenuOptions {
    editor: Editor | null
    createTextCard: (x?: number, y?: number) => void
    createTodoCard: (x?: number, y?: number) => void
    createLinkCard: (x?: number, y?: number) => void
    createHeadingCard?: (x?: number, y?: number) => void
    createStickyCard?: (color: StickyColor, x?: number, y?: number) => void
    createTableCard?: (cols: number, x?: number, y?: number) => void
    createColorCard?: (x?: number, y?: number) => void
    createFileCard?: (x?: number, y?: number) => void
    openImageInput: () => void
    // Required — always passed from WhiteboardTools
    createTextCardWithContent: (x: number, y: number, content: string, w?: number, h?: number) => void
    isInboxBoard?: boolean
    onMoveCard?: (shapeId: string) => void
    isDark?: boolean
    boardId?: string
    boardName?: string
    onCardTrashed?: () => void
    onBeforeDeleteCard?: (shapeId: string) => void
}

export function useContextMenu({
    editor,
    createTextCard,
    createTodoCard,
    createLinkCard,
    createHeadingCard,
    createStickyCard,
    createTableCard,
    createColorCard,
    createFileCard,
    openImageInput,
    createTextCardWithContent,
    isInboxBoard,
    onMoveCard,
    isDark,
    boardId,
    boardName,
    onCardTrashed,
    onBeforeDeleteCard,
}: UseContextMenuOptions) {
    const [saveTemplateState, setSaveTemplateState] = useState<{ defaultName: string; cardContent: string } | null>(null)
    const [batchTagState, setBatchTagState] = useState<{ ids: TLShapeId[] } | null>(null)

    const [menu, setMenu] = useState<{
        x: number; y: number; items: MenuItem[]
        showColorPicker?: boolean
        onColorPick?: (color: CardColor) => void
        currentColor?: CardColor
        isSticky?: boolean
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
            if ((e.target as Element)?.closest('[data-sidebar]')) return
            e.preventDefault()
            e.stopPropagation()

            const screenPoint = { x: e.clientX, y: e.clientY }
            const canvasPoint = editor.screenToPage(screenPoint)
            const hitShape = editor.getShapeAtPoint(canvasPoint)
            const isCard = hitShape?.type === 'card'

            if (isCard && hitShape) {
                const shape = hitShape as unknown as TLCardShape
                const cardType = shape.props.type
                const isLink = cardType === 'link'
                const isText = cardType === 'text'
                const isSticky = cardType === 'sticky'
                const currentColor: CardColor = shape.props.color

                const selectedIds = editor.getSelectedShapeIds()
                const isInMultiSelect = selectedIds.includes(hitShape.id) && selectedIds.length > 1
                const idsToOperate: TLShapeId[] = isInMultiSelect
                    ? [...selectedIds].filter(id => editor.getShape(id)?.type === 'card')
                    : [hitShape.id]
                const opCount = idsToOperate.length

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
                        label: opCount > 1 ? `複製 ${opCount} 張卡片` : '複製卡片',
                        action: () => {
                            editor.duplicateShapes(idsToOperate, { x: 20, y: 20 })
                        },
                    },
                ]

                if (opCount > 1) {
                    const alignSubmenu: MenuItem[] = [
                        { icon: '⬅', label: '靠左對齊',  action: () => alignShapes(editor, idsToOperate, 'left') },
                        { icon: '↔', label: '水平置中',  action: () => alignShapes(editor, idsToOperate, 'centerX') },
                        { icon: '➡', label: '靠右對齊',  action: () => alignShapes(editor, idsToOperate, 'right') },
                        { icon: '⬆', label: '靠上對齊',  action: () => alignShapes(editor, idsToOperate, 'top') },
                        { icon: '↕', label: '垂直置中',  action: () => alignShapes(editor, idsToOperate, 'centerY') },
                        { icon: '⬇', label: '靠下對齊',  action: () => alignShapes(editor, idsToOperate, 'bottom') },
                        ...(opCount >= 3 ? [
                            { icon: '↔', label: '水平均分', divider: true, action: () => distributeShapes(editor, idsToOperate, 'x') } as MenuItem,
                            { icon: '↕', label: '垂直均分', action: () => distributeShapes(editor, idsToOperate, 'y') } as MenuItem,
                        ] : []),
                    ]
                    items.push({
                        icon: '⬛',
                        label: '對齊',
                        divider: true,
                        action: () => {},
                        submenu: alignSubmenu,
                    })

                    const statusSubmenu: MenuItem[] = [
                        { icon: '📋', label: '待辦',   action: () => setBatchStatus(editor, idsToOperate, 'todo') },
                        { icon: '🔵', label: '進行中', action: () => setBatchStatus(editor, idsToOperate, 'in-progress') },
                        { icon: '✅', label: '完成',   action: () => setBatchStatus(editor, idsToOperate, 'done') },
                        { icon: '⬜', label: '清除狀態', divider: true, action: () => setBatchStatus(editor, idsToOperate, 'none') },
                    ]
                    items.push({
                        icon: '📊',
                        label: `批次設定狀態（${opCount}）`,
                        divider: true,
                        action: () => {},
                        submenu: statusSubmenu,
                    })

                    const prioritySubmenu: MenuItem[] = [
                        { icon: '🔴', label: '高', action: () => setBatchPriority(editor, idsToOperate, 'high') },
                        { icon: '🟠', label: '中', action: () => setBatchPriority(editor, idsToOperate, 'medium') },
                        { icon: '🟡', label: '低', action: () => setBatchPriority(editor, idsToOperate, 'low') },
                        { icon: '—', label: '清除優先級', divider: true, action: () => setBatchPriority(editor, idsToOperate, 'none') },
                    ]
                    items.push({
                        icon: '⚑',
                        label: `批次設定優先級（${opCount}）`,
                        action: () => {},
                        submenu: prioritySubmenu,
                    })

                    items.push({
                        icon: '🏷',
                        label: `批次附加標籤（${opCount}）`,
                        action: () => {
                            setMenu(null)
                            setBatchTagState({ ids: idsToOperate })
                        },
                    })
                }

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
                    label: opCount > 1 ? `刪除 ${opCount} 張卡片` : '刪除卡片',
                    danger: true,
                    divider: !isInboxBoard && !isLink && !isText,
                    action: () => {
                        for (const id of idsToOperate) {
                            onBeforeDeleteCard?.(id)
                            const rawShape = editor.getShape(id)
                            if (!rawShape) continue
                            const card = rawShape as unknown as TLCardShape
                            const sanitizedData = {
                                ...rawShape,
                                props: sanitizeCardProps(rawShape.props as unknown as SnapshotShapeProps),
                            }
                            saveCardToTrash(
                                id,
                                sanitizedData,
                                boardId ?? '',
                                boardName ?? '',
                                card.props.type,
                                getCardPreview(card as unknown as { props: Record<string, unknown> }),
                            ).then(() => onCardTrashed?.())
                        }
                        editor.deleteShapes(idsToOperate)
                    },
                })

                setMenu({
                    x: e.clientX, y: e.clientY, items,
                    showColorPicker: true,
                    currentColor,
                    isSticky,
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
                    templateSubmenu.push({
                        icon: t.icon,
                        label: t.name,
                        action: () => {
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

                const stickySubmenu: MenuItem[] = STICKY_COLOR_LIST.map(color => ({
                    icon: '●',
                    label: STICKY_COLORS[color].label,
                    action: () => createStickyCard?.(color, px, py),
                }))

                const tableSubmenu: MenuItem[] = [2, 3, 4].map(cols => ({
                    icon: '▦',
                    label: `${cols} 欄`,
                    action: () => createTableCard?.(cols, px, py),
                }))

                setMenu({
                    x: e.clientX, y: e.clientY,
                    items: [
                        { icon: '📝', label: '新增文字卡片', action: () => createTextCard(px, py) },
                        { icon: '✅', label: '新增待辦清單', action: () => createTodoCard(px, py) },
                        { icon: '🔗', label: '新增連結卡片', action: () => createLinkCard(px, py) },
                        { icon: '🖼️', label: '新增圖片卡片', action: () => openImageInput() },
                        { icon: 'A', label: '新增標題卡片', action: () => createHeadingCard?.(px, py) },
                        {
                            icon: '📌',
                            label: '新增便利貼',
                            action: () => createStickyCard?.('yellow', px, py),
                            submenu: stickySubmenu,
                        },
                        {
                            icon: '▦',
                            label: '新增表格',
                            action: () => createTableCard?.(3, px, py),
                            submenu: tableSubmenu,
                        },
                        { icon: '🎨', label: '新增顏色樣本', action: () => createColorCard?.(px, py) },
                        ...(createFileCard && window.electronAPI?.selectAndCopyFile ? [{ icon: '📎', label: '上傳檔案', action: () => createFileCard(px, py) }] : []),
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
    }, [editor, createTextCard, createTodoCard, createLinkCard, createHeadingCard, createStickyCard, createTableCard, createColorCard, createFileCard, openImageInput, createTextCardWithContent, isInboxBoard, onMoveCard, refreshTemplates])

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
                    isSticky={menu.isSticky}
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
            {batchTagState && editor && (
                <BatchAddTagModal
                    count={batchTagState.ids.length}
                    onConfirm={(tag) => {
                        addBatchTag(editor, batchTagState.ids, tag)
                        setBatchTagState(null)
                    }}
                    onClose={() => setBatchTagState(null)}
                    isDark={isDark ?? false}
                />
            )}
        </>
    )

    return { menuElement }
}
