// src/utils/commands.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildCommands, filterCommands, type CommandActions } from './commands'

// 每個 action 都是 spy，方便驗證 run() 有接對
const makeActions = (): CommandActions => ({
    goHome: vi.fn(), goToInbox: vi.fn(), openOverview: vi.fn(), newBoard: vi.fn(),
    quickCapture: vi.fn(), openInboxTriage: vi.fn(), openSearch: vi.fn(), openCardLibrary: vi.fn(), openTaskCenter: vi.fn(),
    openReviewCenter: vi.fn(), openKnowledgeGraph: vi.fn(), openFilter: vi.fn(),
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
