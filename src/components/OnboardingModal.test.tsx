// @vitest-environment jsdom
// src/components/OnboardingModal.test.tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { OnboardingModal } from './OnboardingModal'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

function renderOnboarding() {
    const onClose = vi.fn()
    render(<OnboardingModal onClose={onClose} isDark={false} />)
    return { onClose }
}

describe('OnboardingModal', () => {
    it('一開始停在第一步，有「跳過」、沒有「上一步」', () => {
        renderOnboarding()
        expect(screen.getByText('歡迎使用 Scout Astrolabe')).toBeTruthy()
        expect(screen.getByText('跳過')).toBeTruthy()
        expect(screen.queryByText('← 上一步')).toBeNull()
    })

    it('「下一步」前進到第二步', () => {
        renderOnboarding()
        fireEvent.click(screen.getByText('下一步 →'))
        expect(screen.getByText('白板是你的工作空間')).toBeTruthy()
        expect(screen.getByText('← 上一步')).toBeTruthy()
    })

    it('「跳過」會寫入 localStorage 完成旗標並關閉', () => {
        const { onClose } = renderOnboarding()
        fireEvent.click(screen.getByText('跳過'))
        expect(localStorage.getItem('onboarding-completed')).toBe('true')
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('走到最後一步時按鈕變「開始使用」，點擊即完成', () => {
        const { onClose } = renderOnboarding()
        // 共 4 步，按 3 次下一步到最後一步
        fireEvent.click(screen.getByText('下一步 →'))
        fireEvent.click(screen.getByText('下一步 →'))
        fireEvent.click(screen.getByText('下一步 →'))
        const startBtn = screen.getByText('開始使用 🚀')
        expect(startBtn).toBeTruthy()
        expect(screen.queryByText('跳過')).toBeNull()

        fireEvent.click(startBtn)
        expect(localStorage.getItem('onboarding-completed')).toBe('true')
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('方向鍵 → 前進、← 後退', () => {
        renderOnboarding()
        fireEvent.keyDown(window, { key: 'ArrowRight' })
        expect(screen.getByText('白板是你的工作空間')).toBeTruthy()
        fireEvent.keyDown(window, { key: 'ArrowLeft' })
        expect(screen.getByText('歡迎使用 Scout Astrolabe')).toBeTruthy()
    })
})
