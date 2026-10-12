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
