// src/utils/commands.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildCommands, filterCommands, type CommandActions } from './commands'

// 每個 action 都是 spy，方便驗證 run() 有接對
const makeActions = (): CommandActions => ({
    goHome: vi.fn(), goToInbox: vi.fn(), openOverview: vi.fn(), newBoard: vi.fn(),
    quickCapture: vi.fn(), openInboxTriage: vi.fn(), openSearch: vi.fn(), openCardLibrary: vi.fn(), openTaskCenter: vi.fn(),
    openReviewCenter: vi.fn(), openKnowledgeGraph: vi.fn(), openPomodoro: vi.fn(), openFilter: vi.fn(),
    openTagManager: vi.fn(), openTrash: vi.fn(),
    openBackup: vi.fn(), openDataSafety: vi.fn(), toggleTheme: vi.fn(), openOnboarding: vi.fn(), openHotkey: vi.fn(),
})

describe('buildCommands', () => {
    it('產生所有命令且 id 唯一', () => {
        const cmds = buildCommands(makeActions())
        expect(cmds.length).toBeGreaterThanOrEqual(15)
        const ids = cmds.map(c => c.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('每個命令有 title/icon/group', () => {
        for (const c of buildCommands(makeActions())) {
            expect(c.title).toBeTruthy()
            expect(c.icon).toBeTruthy()
            expect(c.group).toBeTruthy()
        }
    })

    // icon 已是 IconName（型別會擋 emoji），但型別哪天被放寬成 string
    // 就會安靜地退回原樣 —— 這條在執行期再擋一次。
    it('icon 一律是 icons.tsx 的 registry key，不含 emoji', () => {
        for (const c of buildCommands(makeActions())) {
            expect(c.icon, `${c.id} 的 icon`).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/)
        }
    })

    it('run() 呼叫對應的 action', () => {
        const a = makeActions()
        const cmds = buildCommands(a)
        cmds.find(c => c.id === 'open-data-safety')!.run()
        expect(a.openDataSafety).toHaveBeenCalledTimes(1)
        cmds.find(c => c.id === 'toggle-theme')!.run()
        expect(a.toggleTheme).toHaveBeenCalledTimes(1)
    })

    it('涵蓋 D7 相關入口（任務/復盤中心）', () => {
        const ids = buildCommands(makeActions()).map(c => c.id)
        expect(ids).toContain('open-task-center')
        expect(ids).toContain('open-review-center')
    })
})

describe('filterCommands', () => {
    const cmds = buildCommands(makeActions())

    it('空 query 回傳全部', () => {
        expect(filterCommands(cmds, '')).toHaveLength(cmds.length)
        expect(filterCommands(cmds, '   ')).toHaveLength(cmds.length)
    })

    it('中文標題比對', () => {
        const r = filterCommands(cmds, '備份')
        expect(r.some(c => c.id === 'open-backup')).toBe(true)
    })

    it('英文 keywords 比對', () => {
        const r = filterCommands(cmds, 'graph')
        expect(r.some(c => c.id === 'open-knowledge-graph')).toBe(true)
    })

    it('多詞為 AND 語意', () => {
        expect(filterCommands(cmds, 'dark light')).toHaveLength(1)
        expect(filterCommands(cmds, '深色 主題')[0].id).toBe('toggle-theme')
    })

    it('無命中回空陣列', () => {
        expect(filterCommands(cmds, 'zzzznotacommand')).toHaveLength(0)
    })
})

// Scout Desktop 只有 Electron 有：PWA 不傳 toggleDesktop ⇒ 命令面板不能出現一個按了沒反應的項目
describe('toggle-desktop 命令', () => {
    it('沒傳 toggleDesktop（PWA）→ 不出現', () => {
        expect(buildCommands(makeActions()).map(c => c.id)).not.toContain('toggle-desktop')
    })

    it('有傳 → 出現在工具組，run 接到 toggleDesktop；打「desktop」或「桌面」都找得到', () => {
        const toggleDesktop = vi.fn()
        const cmds = buildCommands({ ...makeActions(), toggleDesktop })
        const cmd = cmds.find(c => c.id === 'toggle-desktop')!
        expect(cmd.group).toBe('工具')
        cmd.run()
        expect(toggleDesktop).toHaveBeenCalledOnce()
        expect(filterCommands(cmds, 'desktop').map(c => c.id)).toContain('toggle-desktop')
        expect(filterCommands(cmds, '桌面').map(c => c.id)).toContain('toggle-desktop')
    })
})
