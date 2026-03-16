// BoardContent.tsx
import { useState } from 'react'
import type { TLCardShape } from '../type/CardShape'

interface BoardContentProps {
    shape: TLCardShape
    boardName?: string
    boardThumbnail?: string | null

}

export function BoardContent({ shape: _shape, boardName, boardThumbnail }: BoardContentProps) {
    const [hovered, setHovered] = useState(false)


    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                width: '100%', height: '100%',
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden', position: 'relative',
                pointerEvents: 'none',
            }}
        >
            {/* 縮圖區 */}
            <div style={{
                flex: 1, overflow: 'hidden', position: 'relative',
                background: boardThumbnail ? 'transparent' : '#f5f7fa',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {boardThumbnail ? (
                    <img
                        src={boardThumbnail}
                        draggable={false}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                    />
                ) : (
                    <div style={{ textAlign: 'center', color: '#bbb' }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                        <div style={{ fontSize: 12 }}>空白板</div>
                    </div>
                )}

                {/* hover 時顯示「雙擊進入」提示 */}
                {hovered && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        pointerEvents: 'none',
                    }}>
                        <div style={{
                            color: 'white', fontSize: 13, fontWeight: 600,
                            background: 'rgba(0,0,0,0.5)', padding: '6px 14px',
                            borderRadius: 8,
                        }}>
                            雙擊進入
                        </div>
                    </div>
                )}
            </div>

            {/* 底部白板名稱 */}
            <div style={{
                padding: '8px 12px', fontSize: 13, fontWeight: 600,
                color: '#333', borderTop: '1px solid #eee',
                background: 'white', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 6,
            }}>
                <span>📋</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {boardName || '未命名白板'}
                </span>
            </div>
        </div>
    )
}