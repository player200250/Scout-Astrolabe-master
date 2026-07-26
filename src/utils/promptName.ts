// src/utils/promptName.ts
// 「請使用者輸入一個名稱」的發送端（TD9）。渲染端是 components/ui/PromptHost.tsx。
//
// **Electron renderer 不支援 window.prompt**（alert/confirm 可用，prompt 直接沒作用）——
// N19 存白板模板就是因此只能用預設名「<板名> 模板」不問使用者。這個 helper 補上那個洞。
//
// 用法：
//   const name = await promptName({ title: '存為白板模板', defaultValue: `${board.name} 模板` })
//   if (name === null) return   // 使用者取消
import { emitAppEvent } from './appEvents'

export interface PromptNameOptions {
    title: string
    defaultValue?: string
    placeholder?: string
    confirmLabel?: string
}

/** 開啟命名對話框。回傳輸入的名稱；使用者取消則回傳 null（空字串也視為取消）。 */
export function promptName(opts: PromptNameOptions): Promise<string | null> {
    return new Promise(resolve => {
        emitAppEvent('ui-prompt', {
            title: opts.title,
            defaultValue: opts.defaultValue ?? '',
            placeholder: opts.placeholder,
            confirmLabel: opts.confirmLabel,
            resolve,
        })
    })
}
