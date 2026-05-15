import { useIsDarkMode } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'

interface FileIconConfig {
    icon: string
    color: string
    bg: string
}

function getFileIconConfig(ext: string): FileIconConfig {
    const e = ext.toLowerCase()
    if (e === '.pdf') return { icon: 'PDF', color: '#dc2626', bg: '#fef2f2' }
    if (e === '.doc' || e === '.docx') return { icon: 'DOC', color: '#2563eb', bg: '#eff6ff' }
    if (e === '.xls' || e === '.xlsx') return { icon: 'XLS', color: '#16a34a', bg: '#f0fdf4' }
    if (e === '.ppt' || e === '.pptx') return { icon: 'PPT', color: '#ea580c', bg: '#fff7ed' }
    if (e === '.jpg' || e === '.jpeg' || e === '.png' || e === '.gif') return { icon: '🖼', color: '#7c3aed', bg: '#faf5ff' }
    if (e === '.mp4' || e === '.mov' || e === '.avi') return { icon: '🎬', color: '#1e40af', bg: '#eff6ff' }
    if (e === '.mp3' || e === '.wav') return { icon: '🎵', color: '#db2777', bg: '#fdf2f8' }
    if (e === '.zip' || e === '.rar') return { icon: '📦', color: '#ca8a04', bg: '#fefce8' }
    return { icon: '📄', color: '#64748b', bg: '#f8fafc' }
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

    const cardBg = isDark ? '#1e293b' : '#ffffff'
    const textPrim = isDark ? '#e2e8f0' : '#1e293b'
    const textMuted = isDark ? '#94a3b8' : '#64748b'

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
                {cfg.icon.length <= 3 ? (
                    <span style={{
                        fontSize: 14, fontWeight: 800, color: cfg.color,
                        letterSpacing: '-0.5px',
                    }}>{cfg.icon}</span>
                ) : (
                    <span style={{ fontSize: 28 }}>{cfg.icon}</span>
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
                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
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
