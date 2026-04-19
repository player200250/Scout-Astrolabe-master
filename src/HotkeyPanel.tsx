// src/HotkeyPanel.tsx
import { isMac } from './Usehotkeys'

const MOD = isMac ? '⌘' : 'Ctrl'

interface HotkeyPanelProps {
    onClose: () => void
}

interface HotkeyItem {
    keys: string[]
    label: string
}

interface HotkeySection {
    title: string
    items: HotkeyItem[]
}

const sections: HotkeySection[] = [
    {
        title: '通用',
        items: [
            { keys: [MOD, 'Z'], label: '復原' },
            { keys: [MOD, 'Shift', 'Z'], label: '重做' },
            { keys: [MOD, 'A'], label: '全選' },
            { keys: [MOD, 'C'], label: '複製' },
            { keys: [MOD, 'V'], label: '貼上' },
            { keys: [MOD, 'D'], label: '複製選取卡片' },
            { keys: ['Del'], label: '刪除選取' },
            { keys: ['Esc'], label: '取消選取 / 回到選取工具' },
        ],
    },
    {
        title: '新增卡片',
        items: [
            { keys: ['N'], label: '新增文字卡片' },
            { keys: ['T'], label: '新增待辦清單' },
            { keys: ['L'], label: '新增連結卡片' },
            { keys: ['I'], label: '新增圖片卡片' },
        ],
    },
    {
        title: '工具',
        items: [
            { keys: ['V'], label: '選取工具' },
            { keys: ['H'], label: '手掌工具（平移）' },
            { keys: ['A'], label: '箭頭工具' },
            { keys: ['E'], label: '橡皮擦' },
            { keys: ['P'], label: '畫筆工具' },
        ],
    },
    {
        title: '檢視',
        items: [
            { keys: [MOD, '+'], label: '放大' },
            { keys: [MOD, '-'], label: '縮小' },
            { keys: [MOD, '0'], label: '重置縮放 (100%)' },
            { keys: [MOD, 'Shift', 'F'], label: '縮放至全部內容' },
        ],
    },
    {
        title: '移動（選取後）',
        items: [
            { keys: ['↑ ↓ ← →'], label: '微移 1px' },
            { keys: ['Shift', '↑ ↓ ← →'], label: '微移 10px' },
        ],
    },
    {
        title: '面板',
        items: [
            { keys: [MOD, 'F'], label: '搜尋卡片' },
            { keys: ['?'], label: '開啟快捷鍵面板' },
            { keys: [MOD, '/'], label: '開啟快捷鍵面板' },
        ],
    },
]

function KeyBadge({ k }: { k: string }) {
    return (
        <kbd style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px 7px',
            borderRadius: 5,
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderBottom: '2px solid #9ca3af',
            fontSize: 11,
            fontFamily: 'system-ui, -apple-system, monospace',
            color: '#374151',
            fontWeight: 500,
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
        }}>
            {k}
        </kbd>
    )
}

export function HotkeyPanel({ onClose }: HotkeyPanelProps) {
    return (
        <>
            {/* 背景遮罩 */}
            <div
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 99998 }}
            />

            {/* 面板 */}
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 560,
                maxWidth: '92vw',
                maxHeight: '80vh',
                background: '#fff',
                borderRadius: 14,
                boxShadow: '0 12px 48px rgba(0,0,0,0.2)',
                zIndex: 99999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderBottom: '1px solid #f0f0f0',
                    flexShrink: 0,
                }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>⌨️ 快捷鍵</span>
                    <button
                        onClick={onClose}
                        style={{
                            border: 'none', background: '#f3f4f6', borderRadius: 8,
                            width: 28, height: 28, cursor: 'pointer', fontSize: 14,
                            color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >×</button>
                </div>

                {/* 內容 */}
                <div style={{ overflowY: 'auto', padding: '12px 20px 20px' }}>
                    {sections.map(section => (
                        <div key={section.title} style={{ marginBottom: 20 }}>
                            <div style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#9ca3af',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                marginBottom: 8,
                            }}>
                                {section.title}
                            </div>
                            {section.items.map((item, idx) => (
                                <div key={idx} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '6px 0',
                                    borderBottom: idx < section.items.length - 1 ? '1px solid #f9fafb' : 'none',
                                }}>
                                    <span style={{ fontSize: 13, color: '#374151' }}>{item.label}</span>
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        {item.keys.map((k, ki) => (
                                            <span key={ki} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                {ki > 0 && <span style={{ fontSize: 10, color: '#9ca3af' }}>+</span>}
                                                <KeyBadge k={k} />
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '10px 20px',
                    borderTop: '1px solid #f0f0f0',
                    fontSize: 11,
                    color: '#bbb',
                    textAlign: 'center',
                    flexShrink: 0,
                }}>
                    按 <KeyBadge k="?" /> 或 <KeyBadge k={`${MOD} /`} /> 隨時開啟此面板
                </div>
            </div>
        </>
    )
}