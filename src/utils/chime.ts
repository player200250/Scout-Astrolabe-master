// src/utils/chime.ts — 番茄鐘到點的「叮—咚」（Web Audio 現場合成，不帶音檔）
//
// 視窗被蓋住、人不在螢幕前時，toast 和系統通知都可能錯過；聲音是唯一不用看的提醒。

export const SOUND_STORAGE_KEY = 'pomodoro-sound'

/** 預設開；只有明確存成 'off' 才關。讀不到 localStorage 也當開。 */
export function isSoundOn(): boolean {
    try { return localStorage.getItem(SOUND_STORAGE_KEY) !== 'off' } catch { return true }
}

export function setSoundOn(on: boolean): void {
    try { localStorage.setItem(SOUND_STORAGE_KEY, on ? 'on' : 'off') } catch { /* 存不了就只這次有效 */ }
}

type AudioCtor = typeof AudioContext
let ctx: AudioContext | null = null

/** 兩個音（E6 → C6），各 0.3 秒、指數衰減，總長約 0.6 秒。不支援就安靜跳過。 */
export function playChime(): void {
    try {
        const Ctor = (globalThis as { AudioContext?: AudioCtor }).AudioContext
        if (!Ctor) return
        ctx ??= new Ctor()
        void ctx.resume?.()
        const t0 = ctx.currentTime
        ;[[1318.5, 0], [1046.5, 0.3]].forEach(([freq, offset]) => {
            const osc = ctx!.createOscillator()
            const gain = ctx!.createGain()
            osc.type = 'sine'
            osc.frequency.value = freq
            gain.gain.setValueAtTime(0.0001, t0 + offset)
            gain.gain.exponentialRampToValueAtTime(0.25, t0 + offset + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.3)
            osc.connect(gain).connect(ctx!.destination)
            osc.start(t0 + offset)
            osc.stop(t0 + offset + 0.32)
        })
    } catch { /* 沒有音訊裝置等：不影響計時 */ }
}
