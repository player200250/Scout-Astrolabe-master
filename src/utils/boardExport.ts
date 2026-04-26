import type { TLEditorSnapshot } from 'tldraw'

interface WhiteboardData { snapshot: TLEditorSnapshot | null }

export const exportJSON = (snapshot: TLEditorSnapshot, name: string) => {
    const dataStr = JSON.stringify({ snapshot }, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.json`
    a.click()
    URL.revokeObjectURL(url)
}

export const importJSON = (file: File, onLoad: (data: WhiteboardData) => void) => {
    const reader = new FileReader()
    reader.onload = e => {
        try { onLoad(JSON.parse(e.target!.result as string)) }
        catch { alert('匯入失敗，檔案格式錯誤') }
    }
    reader.readAsText(file)
}
