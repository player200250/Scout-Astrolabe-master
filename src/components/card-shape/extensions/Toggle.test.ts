// @vitest-environment jsdom
//
// Toggle 的 open 屬性 round-trip 測試 = 驗「收合旗標持久化」的核心。
// 走的是 App 編輯模式存檔的同一段 TipTap 程式碼：parseHTML 讀 <details open> → node.open →
// getHTML（renderHTML）寫回。若收合（無 open）經編輯往返後被還原成 open，就是使用者回報的
// 「編輯狀態與唯讀不一致」。這裡把該路徑獨立驗證（比 CDP 實機穩，且是回歸防線）。
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ToggleBlock, ToggleSummary, ToggleContent } from './Toggle'

function roundtrip(html: string): string {
    const editor = new Editor({
        extensions: [
            StarterKit.configure({ codeBlock: false }),
            ToggleBlock, ToggleSummary, ToggleContent,
        ],
        content: html,
    })
    const out = editor.getHTML()
    editor.destroy()
    return out
}

const COLLAPSED = '<details class="toggle-block"><summary>標題</summary><div class="details-content"><p>內文</p></div></details>'
const EXPANDED = '<details class="toggle-block" open="open"><summary>標題</summary><div class="details-content"><p>內文</p></div></details>'

describe('Toggle open 屬性 round-trip（收合旗標持久化）', () => {
    it('收合（無 open）→ 編輯往返後仍收合（不會被還原成展開）', () => {
        const out = roundtrip(COLLAPSED)
        expect(out).toContain('class="toggle-block"')
        expect(out).not.toContain('open') // 關鍵：收合旗標保留，不因編輯過就變展開
        expect(out).toContain('標題')
        expect(out).toContain('內文')
    })

    it('展開（有 open）→ 編輯往返後仍展開', () => {
        const out = roundtrip(EXPANDED)
        expect(out).toContain('open')
        expect(out).toContain('標題')
        expect(out).toContain('內文')
    })

    it('展開 → 收合 → 再往返，狀態各自穩定（不互相污染）', () => {
        // 展開往返兩次仍展開
        expect(roundtrip(roundtrip(EXPANDED))).toContain('open')
        // 收合往返兩次仍收合
        expect(roundtrip(roundtrip(COLLAPSED))).not.toContain('open')
    })
})
