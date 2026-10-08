export function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getTodayStr(): string {
    return toDateStr(new Date())
}

/** ISO 週次（週一開始、含 1 月 4 日的那週是第 1 週）。Dashboard 與 Scout Desktop 共用 */
export function getISOWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export function getWeekLaterStr(): string {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return toDateStr(d)
}

export function formatDueDate(dueDate: string, todayStr: string): string {
    if (dueDate === todayStr) return '今天'
    const [y, m, d] = dueDate.split('-').map(Number)
    if (y === new Date().getFullYear()) return `${m}/${d}`
    return `${y}/${m}/${d}`
}

export function formatRelativeDate(ts: number): string {
    const diffMs = Date.now() - ts
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr  = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)
    if (diffMin < 1)  return '剛剛'
    if (diffMin < 60) return `${diffMin} 分鐘前`
    if (diffHr < 24)  return `${diffHr} 小時前`
    if (diffDay < 7)  return `${diffDay} 天前`
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()}`
}
