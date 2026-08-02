import { useIsDarkMode } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import { T } from '../../../theme/tokens'
import { Icon } from '../../ui/icons'
import type { IconName } from '../../ui/icons'

/**
 * 檔型標示分兩種，刻意不統一：
 * - `badge`：Office 類的 PDF／DOC／XLS／PPT 三字母文字牌。這是比任何圖示都準確的
 *   標示（使用者本來就這樣稱呼它們），沒有理由換成看起來都差不多的文件圖示。
 * - `icon`：沒有公認縮寫的類型（圖片／影片／音訊／壓縮檔／其他）走線性圖示。
 *   原本這半邊是 emoji（🖼🎬🎵📦📄），與另外半邊的文字牌混在同一個位置＝
 *   同一格有時是字、有時是彩色貼圖。
 * `color`／`bg` 是檔型識別色，比照 cardMeta 的 TYPE_COLOR，屬於刻意保留的顏色。
 */
type FileIconConfig =
    | { kind: 'badge'; label: string; color: string; bg: string }
    | { kind: 'icon'; name: IconName; color: string; bg: string }

function getFileIconConfig(ext: string): FileIconConfig {
    const e = ext.toLowerCase()
    if (e === '.pdf') return { kind: 'badge', label: 'PDF', color: '#dc2626', bg: '#fef2f2' }
    if (e === '.doc' || e === '.docx') return { kind: 'badge', label: 'DOC', color: '#2563eb', bg: '#eff6ff' }
    if (e === '.xls' || e === '.xlsx') return { kind: 'badge', label: 'XLS', color: '#16a34a', bg: '#f0fdf4' }
    if (e === '.ppt' || e === '.pptx') return { kind: 'badge', label: 'PPT', color: '#ea580c', bg: '#fff7ed' }
    if (e === '.jpg' || e === '.jpeg' || e === '.png' || e === '.gif') return { kind: 'icon', name: 'fileImage', color: '#7c3aed', bg: '#faf5ff' }
    if (e === '.mp4' || e === '.mov' || e === '.avi') return { kind: 'icon', name: 'fileVideo', color: '#1e40af', bg: '#eff6ff' }
    if (e === '.mp3' || e === '.wav') return { kind: 'icon', name: 'fileAudio', color: '#db2777', bg: '#fdf2f8' }
    if (e === '.zip' || e === '.rar') return { kind: 'icon', name: 'fileArchive', color: '#ca8a04', bg: '#fefce8' }
    return { kind: 'icon', name: 'fileGeneric', color: '#64748b', bg: '#f8fafc' }
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileContent({ shape }: { shape: TLCardShape }) {
    const isDark = useIsDarkMode()
    const p = shape.props
    const ext = p.fileExt ?? ''
    const cfg = getFileIconConfig(ext)
    const fileName = p.originalName ?? '未知檔案'
    const fileSize = p.fileSize != null ? formatSize(p.fileSize) : ''

    const cardBg = T.bgPanel
    const textPrim = T.textPrimary
    const textMuted = T.textSecondary

    return (
        <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: cardBg,
            borderRadius: 12,
            padding: '12px 10px',
            boxSizing: 'border-box',
            gap: 8,
            userSelect: 'none',
        }}>
            {/* File type icon */}
            <div style={{
                width: 60, height: 60, borderRadius: 12,
                background: isDark ? `${cfg.bg}22` : cfg.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                {cfg.kind === 'badge' ? (
                    <span style={{
                        fontSize: 14, fontWeight: 800, color: cfg.color,
                        letterSpacing: '-0.5px',
                    }}>{cfg.label}</span>
                ) : (
                    // 圖示尺寸刻意超出 icons.tsx 的兩級階（sm/md）—— 這裡不是 chrome 圖示，
                    // 是卡片的主視覺，佔的是 60×60 的方塊。用 transform 放大而非傳 size，
                    // 才不會在 registry 開第三級尺寸。
                    <span style={{ color: cfg.color, display: 'flex', transform: 'scale(1.75)' }}>
                        <Icon name={cfg.name} size="md" />
                    </span>
                )}
            </div>

            {/* File name */}
            <div style={{
                fontSize: 12, fontWeight: 600,
                color: textPrim,
                textAlign: 'center',
                lineHeight: 1.4,
                maxWidth: '100%',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as const,
                wordBreak: 'break-all',
            }}>
                {fileName}
            </div>

            {/* File size */}
            {fileSize && (
                <div style={{
                    fontSize: 10, color: textMuted,
                    background: T.bgHoverSoft,
                    padding: '2px 8px', borderRadius: 5,
                }}>
                    {fileSize}
                </div>
            )}

            {/* Double-click hint */}
            <div style={{
                fontSize: 10, color: textMuted,
                marginTop: 2,
                textAlign: 'center',
            }}>
                雙擊開啟
            </div>
        </div>
    )
}
