// @vitest-environment jsdom
// src/utils/boardExport.test.ts
//
// boardExport 兩個函式都帶瀏覽器副作用，需要 jsdom + 替身：
//   - exportJSON：產生 Blob → URL.createObjectURL → 建 <a> → click → revokeObjectURL
//   - importJSON：用 FileReader 讀檔，成功就 onLoad(解析結果)，JSON 壞掉就 alert
// 重點：用假 FileReader 同步觸發 onload，讓「壞檔走 alert」這條分支能確定性驗證。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import { exportJSON, importJSON } from './boardExport'

describe('exportJSON', () => {
    // 捕捉傳進 Blob 的內容
    const blobArgs: { parts: unknown[]; opts?: BlobPropertyBag }[] = []
    // 假 <a>：記錄 href/download，click 用 spy
    const anchor = { href: '', download: '', click: vi.fn() }

    beforeEach(() => {
        blobArgs.length = 0
        anchor.href = ''
        anchor.download = ''
        anchor.click.mockClear()

        const RealBlob = globalThis.Blob
        vi.stubGlobal('Blob', class extends RealBlob {
            constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
                super(parts, opts)
                blobArgs.push({ parts, opts })
            }
        })
        URL.createObjectURL = vi.fn(() => 'blob:fake-url')
        URL.revokeObjectURL = vi.fn()
        vi.spyOn(document, 'createElement').mockReturnValue(anchor as unknown as HTMLAnchorElement)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('把 snapshot 序列化進 Blob、設定下載檔名、觸發點擊並釋放 URL', () => {
        const snapshot = { document: { store: { 'shape:a': 1 } } } as unknown as TLEditorSnapshot

        exportJSON(snapshot, '我的白板')

        // Blob 內容是 { snapshot } 的 JSON，type 為 application/json
        expect(blobArgs).toHaveLength(1)
        const text = blobArgs[0].parts[0] as string
        expect(JSON.parse(text)).toEqual({ snapshot })
        expect(blobArgs[0].opts?.type).toBe('application/json')

        // <a> 設定正確並被點擊
        expect(anchor.href).toBe('blob:fake-url')
        expect(anchor.download).toBe('我的白板.json')
        expect(anchor.click).toHaveBeenCalledTimes(1)

        // 用完釋放 object URL
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
    })
})

describe('importJSON', () => {
    // 假 FileReader：readAsText 時同步用 injectedText 觸發 onload
    let injectedText = ''
    class FakeFileReader {
        onload: ((e: { target: { result: string } }) => void) | null = null
        readAsText() {
            this.onload?.({ target: { result: injectedText } })
        }
    }

    beforeEach(() => {
        injectedText = ''
        vi.stubGlobal('FileReader', FakeFileReader)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('合法 JSON → 以解析後的物件呼叫 onLoad', () => {
        injectedText = '{"snapshot":{"hello":1}}'
        const onLoad = vi.fn()

        importJSON({} as File, onLoad)

        expect(onLoad).toHaveBeenCalledWith({ snapshot: { hello: 1 } })
    })

    it('壞掉的 JSON → 不呼叫 onLoad，改跳 alert', () => {
        injectedText = '這不是 JSON{'
        const alertSpy = vi.fn()
        vi.stubGlobal('alert', alertSpy)
        const onLoad = vi.fn()

        importJSON({} as File, onLoad)

        expect(onLoad).not.toHaveBeenCalled()
        expect(alertSpy).toHaveBeenCalledWith('匯入失敗，檔案格式錯誤')
    })
})
