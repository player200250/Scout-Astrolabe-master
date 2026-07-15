// @vitest-environment jsdom
// src/components/card-shape/sub-components/BacklinksPanel.test.tsx
//
// Tier B 元件：依賴 BacklinksContext（用 Provider 注入假值）。
// 另外它用了 tldraw 的 useIsDarkMode，與 emitAppEvent：
//   - useIsDarkMode 需要 tldraw 環境 → 用 vi.mock 換成固定回傳 false
//   - emitAppEvent 走 window.dispatchEvent → 用 onAppEvent 註冊監聽捕捉
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// tldraw 的 dark mode hook 需要 editor 環境，這裡換掉
vi.mock('@tldraw/editor', () => ({ useIsDarkMode: () => false }))

import { BacklinksPanel } from './BacklinksPanel'
import { BacklinksContext, type BacklinksContextValue, type BacklinkEntry } from '../../../hooks/useBacklinks'
import { onAppEvent } from '../../../utils/appEvents'

afterEach(cleanup)

// 用 Provider 包住 panel，注入自訂的 forwardLinks / backlinks / currentBoardName
function renderPanel(
    ctx: Partial<BacklinksContextValue>,
    props: { shapeId?: string; htmlContent?: string } = {},
) {
    const value: BacklinksContextValue = {
        forwardLinks: new Map(),
        backlinks: new Map(),
        boardNames: [],
        cardIndex: new Map(),
        ...ctx,
    }
    return render(
        <BacklinksContext.Provider value={value}>
            <BacklinksPanel shapeId={props.shapeId ?? 'shape:a'} htmlContent={props.htmlContent ?? '<h1>主題卡</h1>'} />
        </BacklinksContext.Provider>,
    )
}

const entry = (over: Partial<BacklinkEntry> & { boardId: string; shapeId: string }): BacklinkEntry =>
    ({ boardName: '某白板', preview: '預覽', x: 0, y: 0, ...over } as BacklinkEntry)

describe('BacklinksPanel', () => {
    it('沒有任何連結或引用時不渲染（回 null）', () => {
        const { container } = renderPanel({})
        expect(container.firstChild).toBeNull()
    })

    it('顯示前向連結與被引用的數量摘要', () => {
        renderPanel({
            forwardLinks: new Map([['shape:a', ['目標A', '目標B']]]),
            backlinks: new Map([['主題卡', [entry({ boardId: 'b1', shapeId: 'shape:x' })]]]),
        })
        expect(screen.getByText('→ 2 個連結')).toBeTruthy()
        expect(screen.getByText('← 1 個引用')).toBeTruthy()
    })

    it('點摘要列展開後，列出連結名稱與引用預覽', () => {
        renderPanel({
            forwardLinks: new Map([['shape:a', ['目標A']]]),
            backlinks: new Map([['主題卡', [entry({ boardId: 'b1', shapeId: 'shape:x', preview: '引用我的卡', boardName: '白板一' })]]]),
        })
        // 展開前看不到明細
        expect(screen.queryByText('→ 連結到')).toBeNull()

        fireEvent.pointerDown(screen.getByText('→ 1 個連結'))

        expect(screen.getByText('→ 連結到')).toBeTruthy()
        expect(screen.getByText('目標A')).toBeTruthy()
        expect(screen.getByText('← 被引用')).toBeTruthy()
        expect(screen.getByText('引用我的卡')).toBeTruthy()
        expect(screen.getByText('白板一')).toBeTruthy()
    })

    it('點前向連結 → 發出 jump-to-card（帶 targetName）', () => {
        const calls: unknown[] = []
        const off = onAppEvent('jump-to-card', d => calls.push(d))
        renderPanel({ forwardLinks: new Map([['shape:a', ['目標A']]]) })

        fireEvent.pointerDown(screen.getByText('→ 1 個連結')) // 展開
        fireEvent.pointerDown(screen.getByText('目標A'))

        expect(calls).toEqual([{ targetName: '目標A' }])
        off()
    })

    it('點被引用項目 → 發出 jump-to-card（帶 boardId/shapeId/x/y）', () => {
        const calls: unknown[] = []
        const off = onAppEvent('jump-to-card', d => calls.push(d))
        renderPanel({
            backlinks: new Map([['主題卡', [entry({ boardId: 'b1', shapeId: 'shape:x', x: 10, y: 20, preview: '引用我的卡' })]]]),
        })

        fireEvent.pointerDown(screen.getByText('← 1 個引用')) // 展開
        fireEvent.pointerDown(screen.getByText('引用我的卡'))

        expect(calls).toEqual([{ boardId: 'b1', shapeId: 'shape:x', x: 10, y: 20 }])
        off()
    })

    it('合併卡片名與白板名兩種來源的引用，並去重', () => {
        // 同一筆 entry 同時出現在 cardName('主題卡') 與 currentBoardName('白板X') 的引用清單
        const shared = entry({ boardId: 'b1', shapeId: 'shape:x', preview: '重複引用' })
        renderPanel(
            {
                currentBoardName: '白板X',
                backlinks: new Map([
                    ['主題卡', [shared]],
                    ['白板x', [shared]], // key 已小寫
                ]),
            },
            { htmlContent: '<h1>主題卡</h1>' },
        )
        // 去重後仍只算 1 個引用
        expect(screen.getByText('← 1 個引用')).toBeTruthy()
    })
})
