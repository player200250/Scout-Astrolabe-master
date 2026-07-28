// @vitest-environment jsdom
// src/components/ui/EmptyState.test.tsx
//
// EmptyState 是 ux-audit A4（空狀態冷淡）的收斂處。這裡驗的是那份 audit 真正要的行為：
// 空狀態除了「沒有 X」之外**要給下一步**，而且「沒有真入口就不要長出一顆按鈕」——
// 假按鈕比沒按鈕更糟（TaskCenter／CardLibrary 這些面板本身就沒有建卡入口）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EmptyState } from './EmptyState'

afterEach(cleanup)

describe('EmptyState', () => {
    it('顯示現況與下一步提示', () => {
        render(<EmptyState title="今日沒有待辦" hint="設了到期日就會出現在這裡。" />)
        expect(screen.getByText('今日沒有待辦')).toBeTruthy()
        expect(screen.getByText('設了到期日就會出現在這裡。')).toBeTruthy()
    })

    it('只有 title 時不會渲染 hint 或按鈕', () => {
        render(<EmptyState title="沒有已刪除的卡片" />)
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('給了 actionLabel＋onAction 才有按鈕，點擊會呼叫', () => {
        const onAction = vi.fn()
        render(<EmptyState title="還沒有白板" actionLabel="＋ 新增白板" onAction={onAction} />)
        fireEvent.click(screen.getByRole('button', { name: '＋ 新增白板' }))
        expect(onAction).toHaveBeenCalledTimes(1)
    })

    it('只給 actionLabel 但沒有 onAction 時不渲染按鈕（不做假入口）', () => {
        render(<EmptyState title="沒有符合條件的卡片" actionLabel="清除篩選" />)
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('compact 模式不渲染大圖示', () => {
        render(<EmptyState compact icon="📔" title="今天還沒寫日記" />)
        expect(screen.queryByText('📔')).toBeNull()
    })

    it('非 compact 模式才顯示圖示', () => {
        render(<EmptyState icon="📔" title="今天還沒寫日記" />)
        expect(screen.getByText('📔')).toBeTruthy()
    })
})
