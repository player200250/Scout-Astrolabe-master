// src/utils/dueStatus.ts — 「逾期」「今天到期」的唯一定義
//
// 以前主頁、側邊徽章、任務中心、Scout Desktop、MCP、知識圖譜、待辦卡各寫一份 `dueDate < today`。
// 現在都一致，但改規則（例如逾期要不要含今天）時漏改一處，數字就會對不上——所以收在這裡。
// 日期一律是本地時間的 'YYYY-MM-DD' 字串，字串比較＝日期比較。

type TodoLike = { checked?: boolean; dueDate?: string | null }

/** 到期日已過（不看有沒有勾）。沒到期日不算逾期。 */
export function isPastDue(dueDate: string | null | undefined, todayStr: string): boolean {
    return !!dueDate && dueDate < todayStr
}

/** 到期日是今天（不看有沒有勾）。 */
export function isDueToday(dueDate: string | null | undefined, todayStr: string): boolean {
    return !!dueDate && dueDate === todayStr
}

/** 還沒勾、而且到期日已過——各處「逾期 N 項」數的就是這個。 */
export function isOverdue(t: TodoLike, todayStr: string): boolean {
    return !t.checked && isPastDue(t.dueDate, todayStr)
}

/** 還沒勾、今天到期。 */
export function isOpenDueToday(t: TodoLike, todayStr: string): boolean {
    return !t.checked && isDueToday(t.dueDate, todayStr)
}
