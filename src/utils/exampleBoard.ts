// src/utils/exampleBoard.ts
//
// 首次啟動的「範例白板」種子資料（N7）。
//
// 這裡只放「純資料」——每張範例卡的座標與 props。實際建立由
// WhiteboardTools 掛載時透過 editor.createShape() 完成（走 tldraw 正常
// 路徑，避免手工組 snapshot 的 schema 相容風險）。boardDb 在偵測到全新
// 使用者（無舊 snapshot）時，於 localStorage 立 EXAMPLE_SEED_FLAG 旗標，
// 記錄待 seed 的白板 id；WhiteboardTools 掛載該白板且畫布為空時 seed 一次
// 後清旗標，之後自動存檔會把含卡片的 snapshot 永久寫回，不再重建。

import type { CardType, TLCardProps, TodoItem } from '../components/card-shape/type/CardShape'

/** localStorage 旗標鍵：值為待 seed 範例卡的白板 id。 */
export const EXAMPLE_SEED_FLAG = 'example-seed-boardId'

export interface ExampleCard {
    x: number
    y: number
    /** createShape 用的 partial props；其餘欄位由 CardShapeUtil.getDefaultProps 補齊。 */
    props: Partial<TLCardProps> & { type: CardType }
}

const welcomeTodos: TodoItem[] = [
    { id: 'ex-todo-1', text: '雙擊這張卡片就能編輯待辦內容', checked: false, dueDate: null },
    { id: 'ex-todo-2', text: '點左側方框可以打勾', checked: true, dueDate: null },
    { id: 'ex-todo-3', text: '用 Ctrl+Space 快速把想法丟進收件匣', checked: false, dueDate: null },
]

// 四張範例卡以 2×2 網格排列、彼此不重疊，落在畫布原點附近。
export const EXAMPLE_CARDS: ExampleCard[] = [
    {
        x: 0,
        y: 0,
        props: {
            type: 'text',
            color: 'blue',
            w: 340,
            h: 240,
            text: '<h1>👋 歡迎使用 Scout Astrolabe</h1><p>這是一塊<strong>範例白板</strong>，用來示範幾種卡片。看完可以直接刪掉，開始你自己的筆記。</p><p>試試看：<strong>拖曳</strong>移動卡片、<strong>雙擊</strong>編輯內容。</p>',
        },
    },
    {
        x: 380,
        y: 0,
        props: {
            type: 'sticky',
            color: 'yellow',
            w: 240,
            h: 200,
            text: '在空白處按右鍵 🖱️\n\n可以新增文字、待辦、\n連結、圖片、便利貼、\n表格等各種卡片。',
        },
    },
    {
        x: 0,
        y: 280,
        props: {
            type: 'todo',
            color: 'green',
            w: 320,
            h: 220,
            todos: welcomeTodos,
        },
    },
    {
        x: 380,
        y: 240,
        props: {
            type: 'text',
            color: 'purple',
            w: 340,
            h: 240,
            text: '<h2>🔗 雙向連結與搜尋</h2><p>在文字卡輸入 <code>[[白板或卡片名稱]]</code> 可建立連結，卡片底部會顯示反向連結。</p><p>按 <strong>Ctrl+F</strong> 搜尋所有卡片，<strong>Ctrl+Shift+O</strong> 檢視所有白板。</p>',
        },
    },
]
