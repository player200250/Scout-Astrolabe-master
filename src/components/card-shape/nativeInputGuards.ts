// src/components/card-shape/nativeInputGuards.ts
// 卡片裡的原生表單元件要「逃出」tldraw 畫布事件時用的小工具（React 的 stopPropagation 太晚的情況）。

// 日期欄位的日曆打不開（2026-10-05 使用者回報）：tldraw 在畫布上掛了**原生** pointerdown 監聽
// （雙指縮放的 PinchEngine 等），它處理完這個事件，Chromium 就不會在接下來的 click 打開日曆。
// React 的 onPointerDown stopPropagation 擋不住——React 是在根節點才處理，原生監聽早已跑完。
// 只好在 input 本身掛原生監聽擋下來。實測（隔離的 Electron 殼＋開發伺服器）：
// 畫布外的 date input 打得開、畫布內的打不開；只擋 pointerdown 就打得開，擋 mousedown／click 都沒用。
// 同一張卡裡的 <select> 與色票卡的 <input type="color"> 實測都正常，不受影響。
const stopNativePointerDown = (e: Event) => e.stopPropagation()
export const blockCanvasPointerDown = (el: HTMLInputElement | null) => {
    // 同一個函式重複 addEventListener 不會重複註冊；元素卸載時監聽跟著消失
    el?.addEventListener('pointerdown', stopNativePointerDown)
}
