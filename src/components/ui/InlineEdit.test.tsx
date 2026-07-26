// @vitest-environment jsdom
// src/components/ui/InlineEdit.test.tsx
//
// InlineEdit 是把 BoardTabBar／BoardOverview／TagManager 三份重複的改名輸入框收斂成的 primitive（TD9）。
// 這裡驗的是「大家原本各自寫、寫法還略有出入」的那些行為：Enter 送出、Escape 取消、
// 失焦送出（可關閉）、以及**擋住事件冒泡**——最後這點在真實 App 裡最容易出事，
// 因為這些輸入框長在 tldraw 畫布／側邊欄裡，不擋的話按鍵會被上層的全域快捷鍵吃掉。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { InlineEdit } from './InlineEdit'

function setup(over: Partial<React.ComponentProps<typeof InlineEdit>> = {}) {
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    render(<InlineEdit value="原本的名字" onCommit={onCommit} onCancel={onCancel} {...over} />)
    return { onCommit, onCancel, input: screen.getByRole('textbox') as HTMLInputElement }
}

afterEach(cleanup)

describe('InlineEdit', () => {
    it('進場帶入初始值並自動聚焦', () => {
        const { input } = setup()
        expect(input.value).toBe('原本的名字')
        expect(document.activeElement).toBe(input)
    })

    it('Enter 送出目前輸入值', () => {
        const { onCommit, input } = setup()
        fireEvent.change(input, { target: { value: '新名字' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(onCommit).toHaveBeenCalledWith('新名字')
    })

    it('Escape 取消，不送出', () => {
        const { onCommit, onCancel, input } = setup()
        fireEvent.change(input, { target: { value: '改到一半' } })
        fireEvent.keyDown(input, { key: 'Escape' })
        expect(onCancel).toHaveBeenCalled()
        expect(onCommit).not.toHaveBeenCalled()
    })

    it('預設失焦即送出', () => {
        const { onCommit, input } = setup()
        fireEvent.change(input, { target: { value: '換個名字' } })
        fireEvent.blur(input)
        expect(onCommit).toHaveBeenCalledWith('換個名字')
    })

    it('commitOnBlur={false} 時失焦不送出（給有驗證的欄位用，否則錯誤訊息還沒看到就被關掉）', () => {
        const { onCommit, input } = setup({ commitOnBlur: false })
        fireEvent.change(input, { target: { value: '換個名字' } })
        fireEvent.blur(input)
        expect(onCommit).not.toHaveBeenCalled()
    })

    it('按鍵不冒泡到上層（否則會被 tldraw／側邊欄的全域快捷鍵攔走）', () => {
        const outerKeyDown = vi.fn()
        const onCommit = vi.fn()
        render(
            <div onKeyDown={outerKeyDown}>
                <InlineEdit value="x" onCommit={onCommit} onCancel={vi.fn()} />
            </div>
        )
        const input = screen.getByRole('textbox')
        fireEvent.keyDown(input, { key: 'Escape' })
        fireEvent.keyDown(input, { key: 'a' })
        expect(outerKeyDown).not.toHaveBeenCalled()
    })

    it('onChange 會回報目前值（給旁邊另有送出鈕的情境，如 TagManager）', () => {
        const onChange = vi.fn()
        const { input } = setup({ onChange })
        fireEvent.change(input, { target: { value: 'ab' } })
        expect(onChange).toHaveBeenCalledWith('ab')
    })

    it('selectOnFocus 預設關閉＝維持既有行為（游標在尾端，不全選）', () => {
        const { input } = setup()
        expect(input.selectionStart).toBe(input.value.length)
    })
})
