// @vitest-environment jsdom
// src/components/review/JournalCardEditor.test.tsx
//
// 日記編輯器 900ms 才存檔。這裡驗「還沒到點就離開」的兩條路：關掉復盤中心（卸載）、切到別天。
// 以前兩條路都會把最後打的字丟掉。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import type { BoardRecord } from '../../db'
import { JournalCardEditor } from './JournalCardEditor'

const boards = [{ id: 'journal', name: '📔 日誌', isJournal: true }] as unknown as BoardRecord[]

/** 等 skipUpdate（掛載後 120ms）過去，再用 tiptap 打字 */
async function typeInto(container: HTMLElement, text: string) {
    await act(async () => { await new Promise(r => setTimeout(r, 150)) })
    const editor = (container.querySelector('.ProseMirror') as HTMLElement & { editor?: Editor }).editor!
    act(() => { editor.commands.insertContent(text) })
}

afterEach(() => cleanup())

describe('JournalCardEditor 沒存完就離開', () => {
    it('關掉（卸載）時立刻存', async () => {
        const save = vi.fn()
        const { container, unmount } = render(
            <JournalCardEditor boards={boards} dateKey="2026-10-12" template="" onSaveJournal={save} />,
        )
        await typeInto(container, '最後幾個字')
        expect(save).not.toHaveBeenCalled()
        unmount()
        expect(save).toHaveBeenCalledTimes(1)
        expect(save.mock.calls[0][0]).toBe('journal')
        expect(save.mock.calls[0][1]).toBe('2026-10-12')
        expect(save.mock.calls[0][2]).toContain('最後幾個字')
    })

    it('切到別天時，存回原本那天', async () => {
        const save = vi.fn()
        const { container, rerender } = render(
            <JournalCardEditor boards={boards} dateKey="2026-10-12" template="" onSaveJournal={save} />,
        )
        await typeInto(container, '今天的事')
        rerender(<JournalCardEditor boards={boards} dateKey="2026-10-13" template="" onSaveJournal={save} />)
        expect(save).toHaveBeenCalledTimes(1)
        expect(save.mock.calls[0][1]).toBe('2026-10-12')
        expect(save.mock.calls[0][2]).toContain('今天的事')
        // 舊計時器不會晚點再存一次
        await act(async () => { await new Promise(r => setTimeout(r, 1000)) })
        expect(save).toHaveBeenCalledTimes(1)
    })

    it('沒打字就離開：什麼都不存', async () => {
        const save = vi.fn()
        const { unmount } = render(
            <JournalCardEditor boards={boards} dateKey="2026-10-12" template="<p>模板</p>" onSaveJournal={save} />,
        )
        await act(async () => { await new Promise(r => setTimeout(r, 150)) })
        unmount()
        expect(save).not.toHaveBeenCalled()
    })
})

describe('JournalCardEditor 存檔狀態', () => {
    // 第 38 週那種：卡片早就存在
    const withCard = [{
        id: 'journal', name: '📔 日誌', isJournal: true,
        snapshot: { document: { store: { 'shape:w38': {
            typeName: 'shape', type: 'card', id: 'shape:w38',
            props: { type: 'journal', journalDate: '2026-W38', text: '<p>舊的回顧</p>' },
        } } } },
    }] as unknown as BoardRecord[]

    it('打開已存在的卡不顯示「已儲存」；打字後才出現「未儲存」→「已儲存」', async () => {
        const { container } = render(
            <JournalCardEditor boards={withCard} dateKey="2026-W38" template="" onSaveJournal={vi.fn()} />,
        )
        expect(container.textContent).not.toContain('已儲存')
        await typeInto(container, '補一句')
        expect(container.textContent).toContain('未儲存')
        await act(async () => { await new Promise(r => setTimeout(r, 1500)) })
        expect(container.textContent).toContain('已儲存')
    })

    // v1.8.4 報告 P3：打完字馬上翻週，舊那週補存的「已儲存」晚到，亮在沒打字的新週
    it('打完字馬上翻到別週：新週不顯示「已儲存」', async () => {
        const { container, rerender } = render(
            <JournalCardEditor boards={withCard} dateKey="2026-W38" template="" onSaveJournal={vi.fn()} />,
        )
        await typeInto(container, '補一句')
        rerender(<JournalCardEditor boards={withCard} dateKey="2026-W39" template="" onSaveJournal={vi.fn()} />)
        await act(async () => { await new Promise(r => setTimeout(r, 1500)) })
        expect(container.textContent).not.toContain('已儲存')
    })
})
