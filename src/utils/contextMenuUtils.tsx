// src/utils/contextMenuUtils.tsx
// useContextMenu hook（從 ContextMenu.tsx 拆出，避免 component 與 hook/util 混在同一檔案）

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import { STICKY_COLORS, STICKY_COLOR_LIST } from '../components/card-shape/type/CardShape'
import type { CardColor, TLCardShape, StickyColor } from '../components/card-shape/type/CardShape'
import { db } from '../db'
import type { TemplateRecord } from '../db'
import { saveCardToTrash, getCardPreview } from './trashUtils'
import { sanitizeCardProps } from './snapshot'
import type { SnapshotShapeProps } from './snapshot'
import { ContextMenuUI, SaveTemplateModal } from '../ContextMenu'
import type { MenuItem } from '../ContextMenu'

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
                    action: () => {
                        onBeforeDeleteCard?.(hitShape.id)
                        const rawShape = editor.getShape(hitShape.id)
                        const sanitizedData = rawShape ? {
                            ...rawShape,
                            props: sanitizeCardProps(rawShape.props as unknown as SnapshotShapeProps),
                        } : rawShape
                        saveCardToTrash(
                            hitShape.id,
                            sanitizedData,
                            boardId ?? '',
                            boardName ?? '',
                            shape.props.type,
                            getCardPreview(shape as unknown as { props: Record<string, unknown> }),
                        ).then(() => onCardTrashed?.())
                        editor.deleteShapes([hitShape.id])
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
        </>
    )

    return { menuElement }
}
