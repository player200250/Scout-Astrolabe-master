// @vitest-environment jsdom
// src/components/SidebarFooter.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SidebarFooter } from './SidebarFooter'

afterEach(cleanup)

function renderFooter(over: Partial<Parameters<typeof SidebarFooter>[0]> = {}) {
    const props = {
        onOpenPanel: vi.fn(),
        isDark: false,
        onToggleTheme: vi.fn(),
        ...over,
    }
    render(<SidebarFooter {...props} />)
    return props
}

describe('SidebarFooter', () => {
    it('三個工具列按鈕分別以對應面板名稱呼叫 onOpenPanel', () => {
        const p = renderFooter()
        fireEvent.click(screen.getByTitle('篩選卡片'))
        fireEvent.click(screen.getByTitle('自動備份'))
        fireEvent.click(screen.getByTitle('快捷鍵'))
        expect(p.onOpenPanel).toHaveBeenNthCalledWith(1, 'filter')
        expect(p.onOpenPanel).toHaveBeenNthCalledWith(2, 'backup')
        expect(p.onOpenPanel).toHaveBeenNthCalledWith(3, 'hotkey')
    })

    it('亮色模式時主題鈕顯示 🌙、點擊呼叫 onToggleTheme', () => {
        const p = renderFooter({ isDark: false })
        fireEvent.click(screen.getByTitle('切換暗色模式'))
        expect(p.onToggleTheme).toHaveBeenCalledTimes(1)
    })

    it('「更多」選單預設收起，點開後才出現「使用導覽」', () => {
        const p = renderFooter()
        expect(screen.queryByText('📖 使用導覽')).toBeNull()

        fireEvent.click(screen.getByTitle('更多選項'))
        const item = screen.getByText('📖 使用導覽')
        expect(item).toBeTruthy()

        fireEvent.click(item)
        expect(p.onOpenPanel).toHaveBeenCalledWith('onboarding')
        // 點完後選單收起
        expect(screen.queryByText('📖 使用導覽')).toBeNull()
    })
})
