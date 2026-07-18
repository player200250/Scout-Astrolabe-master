// src/components/card-shape/extensions/MathBlock.ts
//
// 數學式區塊（LaTeX）——文字卡「純文字增強・進階批」第三項（見 ADR 0008）。
//
// 這一項與 Callout／Toggle 不同：唯讀畫面是 dangerouslySetInnerHTML 的靜態注入、不跑 JS，
// 所以 katex 的渲染結果**必須存進 HTML**。做法：
//   - renderHTML（getHTML 序列化與唯讀注入共用）→ 直接把 katex.render 的結果放進 <div>，
//     同時保留 data-latex 原始碼；唯讀時 katex CSS（全域 import）就能把它畫對，零額外程式碼。
//   - addNodeView（僅編輯模式）→ 一個原始碼輸入框 + 即時預覽；atom node 本身不可編輯，
//     故用 input 元件承接編輯，改動即 setNodeMarkup 回寫 latex 屬性。
//   - parseHTML → 只讀 data-latex 原始碼重建 node，捨棄舊的 katex markup（換版本也能重繪）。
//
// 範圍：先只做 block（$$…$$）。行內數學（$…$）的 atom 內嵌編輯較複雜，留待日後需要再加。

import { Node, mergeAttributes } from '@tiptap/core'
import katex from 'katex'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        mathBlock: {
            /** 插入一個數學式區塊（可帶初始 latex）*/
            setMathBlock: (latex?: string) => ReturnType
        }
    }
}

/** 把 latex 渲染進指定元素；失敗時退回顯示原始碼，永不拋錯中斷編輯器 */
function renderMath(target: HTMLElement, latex: string) {
    try {
        katex.render(latex || '', target, { throwOnError: false, displayMode: true })
    } catch {
        target.textContent = latex
    }
}

export const MathBlock = Node.create({
    name: 'mathBlock',
    group: 'block',
    atom: true,          // 整塊當一個不可分割單位（原始碼由 nodeView 的 input 編輯）
    selectable: true,

    addAttributes() {
        return {
            latex: {
                default: '',
                parseHTML: (el) => el.getAttribute('data-latex') ?? '',
                // renderHTML 我們自己組 DOM，這裡不重複輸出屬性
                renderHTML: () => ({}),
            },
        }
    },

    parseHTML() {
        return [{ tag: 'div.math-block' }]
    },

    // getHTML 序列化與唯讀注入共用：吐出「已渲染的 katex + data-latex 原始碼」
    renderHTML({ node, HTMLAttributes }) {
        const div = document.createElement('div')
        Object.entries(mergeAttributes(HTMLAttributes, { class: 'math-block' })).forEach(([k, v]) => {
            if (v != null) div.setAttribute(k, String(v))
        })
        div.setAttribute('data-latex', (node.attrs.latex as string) ?? '')
        renderMath(div, (node.attrs.latex as string) ?? '')
        return div
    },

    // 編輯模式：原始碼輸入框 + 即時預覽
    addNodeView() {
        return ({ node, editor, getPos }) => {
            const dom = document.createElement('div')
            dom.className = 'math-block-editor'
            // 關鍵：wrapper 設 contentEditable=false，PM 才會把整塊當 leaf、不搶走內部 input 的焦點，
            // 否則使用者一打字，PM 立刻把焦點拉回 contenteditable，字全跑進編輯器（實測）。
            dom.contentEditable = 'false'

            const input = document.createElement('input')
            input.className = 'math-src-input'
            input.placeholder = 'LaTeX，例如 E = mc^2 或 \\frac{a}{b}'
            input.value = (node.attrs.latex as string) ?? ''

            const preview = document.createElement('div')
            preview.className = 'math-preview'
            renderMath(preview, input.value)

            input.addEventListener('input', () => {
                renderMath(preview, input.value)
                if (typeof getPos === 'function') {
                    const pos = getPos()
                    if (pos == null) return
                    const tr = editor.view.state.tr.setNodeMarkup(pos, undefined, { latex: input.value })
                    editor.view.dispatch(tr)
                }
            })
            // 不讓 tldraw / ProseMirror 搶走輸入框的指標與鍵盤事件
            input.addEventListener('mousedown', (e) => e.stopPropagation())
            input.addEventListener('pointerdown', (e) => e.stopPropagation())
            // keydown 也要擋，否則 Enter/方向鍵/Backspace 會被 PM keymap 當成編輯器操作
            input.addEventListener('keydown', (e) => e.stopPropagation())

            dom.appendChild(input)
            dom.appendChild(preview)

            return {
                dom,
                // 關鍵：提供 update 讓 PM「原地更新」而非「銷毀重建」。沒有它，每次 setNodeMarkup
                // 都會重建 nodeView → input 失焦 → 使用者只打得進第一個字（實測）。
                update: (updatedNode) => {
                    if (updatedNode.type.name !== this.name) return false
                    // 不覆蓋使用者正在編輯的 input；僅在未聚焦時（如 undo/外部改動）同步
                    if (document.activeElement !== input) {
                        const v = (updatedNode.attrs.latex as string) ?? ''
                        if (input.value !== v) input.value = v
                        renderMath(preview, v)
                    }
                    return true
                },
                // atom 沒有可編輯內容；input 的事件全部由它自己處理，不回報給 PM
                ignoreMutation: () => true,
                stopEvent: () => true,
            }
        }
    },

    addCommands() {
        return {
            setMathBlock: (latex = '') => ({ commands }) =>
                commands.insertContent({ type: this.name, attrs: { latex } }),
        }
    },
})
