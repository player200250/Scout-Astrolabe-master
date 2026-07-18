// src/components/card-shape/extensions/Toggle.ts
//
// 摺疊區塊（Toggle）——文字卡「純文字增強・進階批」第二項（見 ADR 0008）。
//
// 關鍵設計：用原生 <details>/<summary>。理由同 Callout——唯讀卡片是 dangerouslySetInnerHTML
// 的靜態注入，沒有 TipTap 在跑；而原生 <details> 的展開/收合是瀏覽器行為，**唯讀模式零 JS
// 就能點擊摺疊**，不必像 [[卡片連結]] 那樣自己寫 capture listener。
//
// 三個 node（比照 TipTap Pro 的 Details 結構，但自製、不付費）：
//   toggleBlock   → <details open>（永遠帶 open：編輯時內容才可見可編輯；唯讀時預設展開，可點收合）
//   toggleSummary → <summary>（標題，inline*）
//   toggleContent → <div class="details-content">（內文，block+）
//
// 唯一需要自己接的鍵盤行為：在 summary 按 Enter 要跳到內文，而不是嘗試切出第二個 summary
// （schema 只允許一個），否則會卡住。用 TextSelection.near 定位＝容忍 off-by-one。

import { Node, mergeAttributes } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        toggleBlock: {
            /** 插入一個空的摺疊區塊（標題空、內文一個空段落）*/
            setToggle: () => ReturnType
        }
    }
}

export const ToggleSummary = Node.create({
    name: 'toggleSummary',
    // 高 priority＝keymap plugin 排在 StarterKit 前面，確保 summary 內的 Enter 由我們先攔
    priority: 1000,
    content: 'inline*',
    defining: true,
    selectable: false,

    parseHTML() {
        return [{ tag: 'summary' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['summary', mergeAttributes(HTMLAttributes), 0]
    },

    addKeyboardShortcuts() {
        return {
            // 在標題按 Enter → 游標移到內文第一段（不讓 PM 嘗試切出第二個 summary）
            Enter: () => this.editor.commands.command(({ state, tr, dispatch }) => {
                const { $from } = state.selection
                if ($from.parent.type.name !== this.name) return false
                // summary 的父是 toggleBlock，內容序為 [summary, toggleContent]
                const toggleDepth = $from.depth - 1
                const togglePos = $from.before(toggleDepth)
                const toggleNode = state.doc.nodeAt(togglePos)
                if (!toggleNode) return false
                let contentInside = -1
                let offset = togglePos + 1 // 跨過 toggleBlock 開標籤
                toggleNode.forEach((child) => {
                    if (contentInside === -1 && child.type.name === 'toggleContent') {
                        contentInside = offset + 1 // 跨過 toggleContent 開標籤，落進其內
                    }
                    offset += child.nodeSize
                })
                if (contentInside === -1) return false
                if (dispatch) {
                    const sel = TextSelection.near(tr.doc.resolve(contentInside))
                    tr.setSelection(sel).scrollIntoView()
                    dispatch(tr)
                }
                return true
            }),
        }
    },
})

export const ToggleContent = Node.create({
    name: 'toggleContent',
    content: 'block+',
    defining: true,

    parseHTML() {
        return [{ tag: 'div.details-content' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'details-content' }), 0]
    },
})

export const ToggleBlock = Node.create({
    name: 'toggleBlock',
    group: 'block',
    content: 'toggleSummary toggleContent',
    defining: true,

    parseHTML() {
        return [{ tag: 'details' }]
    },

    renderHTML({ HTMLAttributes }) {
        // 永遠 open：編輯時內容需可見可編輯；唯讀時當作預設展開（使用者可點 summary 收合）
        return ['details', mergeAttributes(HTMLAttributes, { class: 'toggle-block', open: 'open' }), 0]
    },

    addCommands() {
        return {
            setToggle: () => ({ commands }) => commands.insertContent({
                type: this.name,
                content: [
                    { type: 'toggleSummary' },
                    { type: 'toggleContent', content: [{ type: 'paragraph' }] },
                ],
            }),
        }
    },
})
