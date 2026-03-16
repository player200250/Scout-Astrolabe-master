// src/useHotkeys.ts
// 全域快捷鍵管理 hook

import { useEffect } from 'react'
import type { Editor } from 'tldraw'

export interface HotkeyActions {
    createTextCard: () => void
    createTodoCard: () => void
    createLinkCard: () => void
    openImageInput: () => void
    openSearch: () => void
    openHotkeyPanel: () => void
}

// 使用 userAgentData（現代瀏覽器）或 userAgent 作為備援
// Electron on Windows 一律是 false
const isMac = typeof navigator !== 'undefined' && (
    (navigator as any).userAgentData?.platform === 'macOS' ||
    (!((navigator as any).userAgentData) && /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent))
)
const mod = (e: KeyboardEvent) => isMac ? e.metaKey : e.ctrlKey

export function useHotkeys(editor: Editor | null, actions: HotkeyActions) {
    useEffect(() => {
        if (!editor) return

        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName
            const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable

            // Cmd 系列（input 也要生效）
            if (mod(e)) {
                switch (e.key) {
                    case 'z':
                        e.preventDefault()
                        if (e.shiftKey) editor.redo()
                        else editor.undo()
                        return
                    case 'y':
                        e.preventDefault()
                        editor.redo()
                        return
                    case 'a':
                        if (!isInput) {
                            e.preventDefault()
                            editor.selectAll()
                        }
                        return
                    case 'f':
                        e.preventDefault()
                        actions.openSearch()
                        return
                    case '/':
                        e.preventDefault()
                        actions.openHotkeyPanel()
                        return
                    case '=':
                    case '+':
                        e.preventDefault()
                        editor.zoomIn(editor.getViewportScreenCenter(), { animation: { duration: 150 } })
                        return
                    case '-':
                        e.preventDefault()
                        editor.zoomOut(editor.getViewportScreenCenter(), { animation: { duration: 150 } })
                        return
                    case '0':
                        e.preventDefault()
                        editor.resetZoom(editor.getViewportScreenCenter(), { animation: { duration: 200 } })
                        return
                    case 'd':
                        if (!isInput) {
                            e.preventDefault()
                            editor.duplicateShapes(editor.getSelectedShapeIds())
                        }
                        return
                    case 'Backspace':
                    case 'Delete':
                        if (!isInput) {
                            e.preventDefault()
                            editor.deleteShapes(editor.getSelectedShapeIds())
                        }
                        return
                }
                // Cmd+Shift 系列
                if (e.shiftKey) {
                    switch (e.key) {
                        case 'F':
                        case 'f':
                            e.preventDefault()
                            if (editor.getSelectedShapeIds().length > 0) {
                                editor.zoomToSelection({ animation: { duration: 300 } })
                            } else {
                                editor.zoomToFit({ animation: { duration: 300 } })
                            }
                            return
                    }
                }
                return
            }

            // 以下快捷鍵在 input 內不觸發
            if (isInput) return

            switch (e.key) {
                // 工具切換
                case 'v':
                case 'V':
                    editor.setCurrentTool('select')
                    return
                case 'h':
                case 'H':
                    editor.setCurrentTool('hand')
                    return
                case 'a':
                case 'A':
                    editor.setCurrentTool('arrow')
                    return
                case 'e':
                case 'E':
                    editor.setCurrentTool('eraser')
                    return
                case 'p':
                case 'P':
                    editor.setCurrentTool('draw')
                    return

                // 新增卡片
                case 'n':
                case 'N':
                    actions.createTextCard()
                    return
                case 't':
                case 'T':
                    actions.createTodoCard()
                    return
                case 'l':
                case 'L':
                    actions.createLinkCard()
                    return
                case 'i':
                case 'I':
                    actions.openImageInput()
                    return

                // 刪除
                case 'Delete':
                case 'Backspace':
                    editor.deleteShapes(editor.getSelectedShapeIds())
                    return

                // Escape
                case 'Escape':
                    editor.setCurrentTool('select')
                    editor.deselect(...editor.getSelectedShapeIds())
                    return

                // 快捷鍵面板
                case '?':
                    actions.openHotkeyPanel()
                    return

                // 方向鍵移動選取的 shape
                case 'ArrowLeft':
                    e.preventDefault()
                    editor.nudgeShapes(editor.getSelectedShapeIds(), { x: e.shiftKey ? -10 : -1, y: 0 })
                    return
                case 'ArrowRight':
                    e.preventDefault()
                    editor.nudgeShapes(editor.getSelectedShapeIds(), { x: e.shiftKey ? 10 : 1, y: 0 })
                    return
                case 'ArrowUp':
                    e.preventDefault()
                    editor.nudgeShapes(editor.getSelectedShapeIds(), { x: 0, y: e.shiftKey ? -10 : -1 })
                    return
                case 'ArrowDown':
                    e.preventDefault()
                    editor.nudgeShapes(editor.getSelectedShapeIds(), { x: 0, y: e.shiftKey ? 10 : 1 })
                    return
            }
        }

        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [editor, actions])
}

export { isMac }