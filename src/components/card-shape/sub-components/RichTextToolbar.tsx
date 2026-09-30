// src/components/card-shape/sub-components/RichTextToolbar.tsx
//
// 文字卡片與日記／週回顧編輯器共用的格式工具列（原本私有在 TextContent 裡）。
// 預設外觀是卡片頂端那條（上圓角）；嵌在別處時用 style 蓋掉外框。
// onPointerDown 擋冒泡是給 tldraw 的：不擋的話在卡片上點按鈕會被當成拖曳／取消選取。

import type { Editor } from '@tiptap/react'
import { T } from '../../../theme/tokens'
import { SLASH_COLORS } from '../../../utils/slashCommands'

/* ================================================
   工具列按鈕
================================================ */

function ToolbarButton({
    onClick,
    active,
    title,
    children,
}: {
    onClick: () => void
    active?: boolean
    title?: string
    children: React.ReactNode
}) {
    return (
        <button
            onMouseDown={(e) => {
                e.preventDefault()
                onClick()
            }}
            title={title}
            style={{
                padding: '3px 7px',
                fontSize: 13,
                fontWeight: active ? 700 : 400,
                background: active ? (T.accentBg) : 'transparent',
                color: active ? '#60a5fa' : (T.textPrimary),
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                lineHeight: 1.4,
            }}
        >
            {children}
        </button>
    )
}

/** trailing：放在最右邊的額外內容（日記編輯器用來顯示「已儲存」） */
export function RichTextToolbar({ tiptap, style, trailing }: { tiptap: Editor | null; style?: React.CSSProperties; trailing?: React.ReactNode }) {
    if (!tiptap) return null

    return (
        <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 2,
                padding: '4px 8px',
                borderBottom: `1px solid ${T.borderLight}`,
                background: T.bgApp,
                borderRadius: '12px 12px 0 0',
                flexShrink: 0,
                ...style,
            }}
        >
            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleBold().run()}
                active={tiptap.isActive('bold')}
                title="粗體"
            >
                <b>B</b>
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleItalic().run()}
                active={tiptap.isActive('italic')}
                title="斜體"
            >
                <i>I</i>
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleUnderline().run()}
                active={tiptap.isActive('underline')}
                title="底線"
            >
                <u>U</u>
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: T.borderMid, margin: '0 4px' }} />

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleHeading({ level: 1 }).run()}
                active={tiptap.isActive('heading', { level: 1 })}
                title="標題 1"
            >
                H1
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleHeading({ level: 2 }).run()}
                active={tiptap.isActive('heading', { level: 2 })}
                title="標題 2"
            >
                H2
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: T.borderMid, margin: '0 4px' }} />

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleBulletList().run()}
                active={tiptap.isActive('bulletList')}
                title="條列清單"
            >
                ≡
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleOrderedList().run()}
                active={tiptap.isActive('orderedList')}
                title="數字清單"
            >
                1≡
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: T.borderMid, margin: '0 4px' }} />

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleCodeBlock().run()}
                active={tiptap.isActive('codeBlock')}
                title="程式碼區塊（語法高亮）"
            >
                {'</>'}
            </ToolbarButton>

            <ToolbarButton
                onClick={() => tiptap.chain().focus().toggleHighlight().run()}
                active={tiptap.isActive('highlight')}
                title="螢光筆"
            >
                <mark style={{ background: '#fef08a', padding: '0 2px', borderRadius: 2 }}>H</mark>
            </ToolbarButton>

            <span style={{ width: 1, height: 16, background: T.borderMid, margin: '0 4px' }} />

            {/* 色票與 `/` 選單同一份（SLASH_COLORS）。「預設」＝清除顏色，圓點畫成當前主題的字色（RC11） */}
            {SLASH_COLORS.map(({ name, hex }) => {
                const active = hex ? tiptap.isActive('textStyle', { color: hex }) : !tiptap.getAttributes('textStyle').color
                return (
                <button
                    key={name}
                    onMouseDown={(e) => {
                        e.preventDefault()
                        const chain = tiptap.chain().focus()
                        ;(hex ? chain.setColor(hex) : chain.unsetColor()).run()
                    }}
                    title={hex ? `文字顏色：${name}` : '預設色（跟著主題）'}
                    style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: hex ?? T.textPrimary,
                        // 選中框用主題字色：原本的 #333 在深色工具列上一樣看不見
                        border: active ? `2px solid ${T.textPrimary}` : '2px solid transparent',
                        boxShadow: hex ? undefined : `inset 0 0 0 1px ${T.borderMid}`,
                        cursor: 'pointer',
                        padding: 0,
                        flexShrink: 0,
                    }}
                />
                )
            })}
            {trailing && <><div style={{ flex: 1 }} />{trailing}</>}
        </div>
    )
}
