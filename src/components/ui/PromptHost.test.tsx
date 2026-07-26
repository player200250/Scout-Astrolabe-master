// @vitest-environment jsdom
// src/components/ui/PromptHost.test.tsx
//
// promptName() 是 window.prompt 的替代品——**Electron renderer 不支援 window.prompt**
// （alert/confirm 可用，prompt 直接沒作用），N19 存白板模板因此一度只能用預設名。
// 這裡驗那條「Promise 介面 ← 事件匯流排 ← modal」的往返，尤其是取消要 resolve(null)
// 而不是永遠 pending（那會讓呼叫端的 await 卡住）。
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import { PromptHost } from './PromptHost'
import { promptName } from '../../utils/promptName'

const open = (opts = {}) => {
    let resolved: string | null | undefined
    act(() => {
        void promptName({ title: '存為白板模板', defaultValue: '我的板 模板', ...opts })
            .then(v => { resolved = v })
    })
    return {
        input: () => screen.getByRole('textbox') as HTMLInputElement,
        result: () => resolved,
    }
}

afterEach(cleanup)

describe('PromptHost', () => {
    it('沒有待處理請求時不渲染', () => {
        const { container } = render(<PromptHost />)
        expect(container.childElementCount).toBe(0)
    })

    it('promptName 會開啟對話框並帶入預設值與標題', () => {
        render(<PromptHost />)
        const p = open()
        expect(screen.getByText('存為白板模板')).toBeTruthy()
        expect(p.input().value).toBe('我的板 模板')
    })

    it('預設值會被全選 → 直接打字即可覆寫', () => {
        render(<PromptHost />)
        const p = open()
        expect(p.input().selectionStart).toBe(0)
        expect(p.input().selectionEnd).toBe('我的板 模板'.length)
    })

    it('Enter 送出修改後的名稱', async () => {
        render(<PromptHost />)
        const p = open()
        fireEvent.change(p.input(), { target: { value: '週報骨架' } })
        fireEvent.keyDown(p.input(), { key: 'Enter' })
        await waitFor(() => expect(p.result()).toBe('週報骨架'))
    })

    it('送出時去除前後空白', async () => {
        render(<PromptHost />)
        const p = open()
        fireEvent.change(p.input(), { target: { value: '  週報骨架  ' } })
        fireEvent.keyDown(p.input(), { key: 'Enter' })
        await waitFor(() => expect(p.result()).toBe('週報骨架'))
    })

    it('Escape 取消 → resolve(null)，呼叫端的 await 不會卡住', async () => {
        render(<PromptHost />)
        const p = open()
        fireEvent.keyDown(p.input(), { key: 'Escape' })
        await waitFor(() => expect(p.result()).toBeNull())
    })

    it('按「取消」鈕 → resolve(null)', async () => {
        render(<PromptHost />)
        const p = open()
        fireEvent.click(screen.getByText('取消'))
        await waitFor(() => expect(p.result()).toBeNull())
    })

    it('空白名稱視為取消（不會存出一個沒有名字的東西）', async () => {
        render(<PromptHost />)
        const p = open()
        fireEvent.change(p.input(), { target: { value: '   ' } })
        fireEvent.keyDown(p.input(), { key: 'Enter' })
        await waitFor(() => expect(p.result()).toBeNull())
    })

    it('確定鈕文字可自訂', () => {
        render(<PromptHost />)
        open({ confirmLabel: '儲存' })
        expect(screen.getByText('儲存')).toBeTruthy()
    })

    it('送出後對話框關閉', async () => {
        render(<PromptHost />)
        const p = open()
        fireEvent.keyDown(p.input(), { key: 'Enter' })
        await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    })
})
