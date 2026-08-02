// src/platform/imageStore.ts
//
// image 卡的圖片儲存薄接縫（roadmap-mobile S0(a) 的 src/platform/ 首個落地）。
// 桌面（Electron）走 window.electronAPI + 自訂 astro-img:// protocol，把圖片存成
// 實體檔、snapshot 只留 storedName，避免 base64 膨脹記憶體/IndexedDB/備份（TD-IMG）。
// 未來 PWA 沒有 electronAPI 時，saveImage 回 null，呼叫端 fallback 存舊 base64。
// 只做薄封裝，不是完整平台抽象層。

import type { TLCardProps } from '../components/card-shape/type/CardShape'
import { deleteStoredFile } from './fileStore'

/** 解析壓縮後的 data URL，取出位元組與副檔名。無法解析回 null。 */
function dataUrlToBytes(dataUrl: string): { bytes: ArrayBuffer; ext: string } | null {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)
    if (!match) return null
    const mime = match[1] || 'image/png'
    const isBase64 = !!match[2]
    const data = match[3]
    const subtype = (mime.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '')
    const ext = '.' + (subtype || 'png')
    let binary: string
    try {
        binary = isBase64 ? atob(data) : decodeURIComponent(data)
    } catch {
        return null
    }
    const arr = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
    return { bytes: arr.buffer, ext }
}

/** 目前平台是否支援把圖片存成實體檔（＝有 Electron saveImage IPC）。圖片遷移/備份據此決定是否啟動。 */
export function canSaveImage(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.saveImage
}

/**
 * 把壓縮後的圖片 data URL 存成實體檔，回傳 storedName（uuid+ext）。
 * 桌面走 electronAPI.saveImage；無 electronAPI（未來 PWA）或失敗回 null，
 * 呼叫端據此 fallback 為舊的「存 base64」行為。
 */
export async function saveImage(dataUrl: string): Promise<string | null> {
    const api = window.electronAPI
    if (!api?.saveImage) return null
    const parsed = dataUrlToBytes(dataUrl)
    if (!parsed) return null
    try {
        const { storedName } = await api.saveImage(parsed.bytes, parsed.ext)
        return storedName || null
    } catch (err) {
        console.error('imageStore.saveImage 失敗:', err)
        return null
    }
}

/**
 * image 卡的渲染來源：有 storedName 用 astro-img:// protocol（Chromium 直接讀檔、
 * 不進 JS heap）；否則 fallback 舊的 base64（props.image）。僅供 image 卡使用——
 * link 卡的 props.image 是遠端 og:image URL，不要走這裡。
 */
export function getImageSrc(props: Pick<TLCardProps, 'storedName' | 'image'>): string {
    if (props.storedName) return `astro-img://${props.storedName}`
    return props.image ?? ''
}

/** 刪除 image 卡對應的實體檔。與 file 卡共用同一實體檔儲存，委派 fileStore（單一真相來源）。 */
export function deleteImage(storedName: string): void {
    deleteStoredFile(storedName)
}

// ── 圖片同步（Supabase Storage）需要的三個接縫 ───────────────────────────────
// 上面四個函式服務的是「本機怎麼存圖」；下面三個服務的是「本機的圖怎麼跟雲端對上」。
// 三個在沒有 electronAPI 的平台（PWA）一律回 false/null＝呼叫端自然跳過整條同步路徑。

/** 目前平台是否支援圖片同步所需的讀寫（舊版 preload 沒有這三個 IPC，故要逐一確認）。 */
export function canSyncImages(): boolean {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    return !!(api?.hasStoredFile && api.readStoredFile && api.writeStoredFile)
}

/** 這張圖在本機存在嗎。無 API 時回 false（＝「本機沒有」，但呼叫端會先擋 canSyncImages）。 */
export async function hasImage(storedName: string): Promise<boolean> {
    try {
        return (await window.electronAPI?.hasStoredFile?.(storedName)) ?? false
    } catch {
        return false
    }
}

/** 讀出圖片位元組供上傳；不存在或無 API 回 null。 */
export async function readImageBytes(storedName: string): Promise<ArrayBuffer | null> {
    try {
        return (await window.electronAPI?.readStoredFile?.(storedName)) ?? null
    } catch (err) {
        console.error('imageStore.readImageBytes 失敗:', err)
        return null
    }
}

/**
 * 把雲端下載回來的圖片寫進本機，**沿用原本的 storedName**。
 * ⚠️ 不能改用 saveImage：它會產生新的 uuid 名字，snapshot 裡的參照就對不上了。
 */
export async function writeImageBytes(storedName: string, bytes: ArrayBuffer): Promise<boolean> {
    try {
        return (await window.electronAPI?.writeStoredFile?.(storedName, bytes)) ?? false
    } catch (err) {
        console.error('imageStore.writeImageBytes 失敗:', err)
        return false
    }
}
