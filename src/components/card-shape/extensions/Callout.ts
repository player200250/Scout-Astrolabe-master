// src/components/card-shape/extensions/Callout.ts
//
// 提示框（Callout）——文字卡「純文字增強・進階批」第一項（見 ADR 0008）。
//
// 刻意做成最單純的「靜態 block」：
//   renderHTML 只吐 <div class="callout">…</div>，圖示（💡）與底色全交給 index.css 的
//   ::before / rgba 背景。這一點是關鍵——唯讀卡片走的是 dangerouslySetInnerHTML（見
//   TextContent.tsx，不是 TipTap 實例），所以 callout 必須「純 CSS 就能長對」，不能依賴 node view。
//
// 結構比照 StarterKit 的 blockquote：content 'block+'、defining、toggleWrap 進出。
// 不存圖示屬性（固定 💡）＝避免為了讓使用者換 icon 而引入 node view 的複雜度（避免過度優化）。

import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        callout: {
            /** 把選取的區塊包成 callout；已在 callout 內則解除（同 blockquote 的 toggle 行為）*/
            toggleCallout: () => ReturnType
        }
    }
}

export const Callout = Node.create({
    name: 'callout',
    group: 'block',
    content: 'block+',
    defining: true,

    parseHTML() {
        return [{ tag: 'div.callout' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'callout' }), 0]
    },

    addCommands() {
        return {
            toggleCallout: () => ({ commands }) => commands.toggleWrap(this.name),
        }
    },
})
