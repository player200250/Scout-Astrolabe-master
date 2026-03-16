// src/components/DocumentEditor.tsx
import { useState, useEffect, useRef } from 'react'
import type { Editor } from 'tldraw'
import type { TLCardShape } from './card-shape/type/CardShape'

interface DocumentEditorProps {
    isOpen: boolean
    shape: TLCardShape
    editor: Editor
    onClose: () => void
}

/**
 * 文件編輯器 - 類似 Notion/Milanote 的全螢幕編輯器
 */
export function DocumentEditor({ isOpen, shape, editor, onClose }: DocumentEditorProps) {
    const [title, setTitle] = useState(shape.props.documentTitle || '未命名文件')
    const [content, setContent] = useState(shape.props.text || '')
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    
    // 計算字數
    const wordCount = content.length
    
    // 自動聚焦
    useEffect(() => {
        if (isOpen && textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [isOpen])
    
    // ESC 關閉
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleSave()
            }
        }
        
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown)
            return () => document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen, title, content])
    
    /**
     * 儲存文件
     */
    const handleSave = () => {
        // 判斷是否需要轉為文件模式
        const shouldBeDocument = content.length > 200
        
        editor.updateShape({
            id: shape.id,
            type: 'card',
            props: {
                text: content,
                documentTitle: title,
                isDocument: shouldBeDocument,
                wordCount: content.length,
            }
        })
        
        onClose()
    }
    
    if (!isOpen) return null
    
    return (
        <>
            {/* 遮罩層 */}
            <div
                onClick={handleSave}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 999998,
                    backdropFilter: 'blur(4px)',
                }}
            />
            
            {/* 編輯器視窗 */}
            <div
                style={{
                    position: 'fixed',
                    top: '5%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '90%',
                    maxWidth: 800,
                    height: '90%',
                    background: 'white',
                    borderRadius: 12,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                    zIndex: 999999,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* 頂部工具列 */}
                <div
                    style={{
                        padding: '16px 24px',
                        borderBottom: '1px solid #eee',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexShrink: 0,
                    }}
                >
                    {/* 文件圖示 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 24 }}>📄</span>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="未命名文件"
                            style={{
                                border: 'none',
                                outline: 'none',
                                fontSize: 18,
                                fontWeight: 600,
                                padding: '4px 8px',
                                borderRadius: 4,
                                width: 300,
                            }}
                            onFocus={(e) => {
                                e.target.style.background = '#f5f5f5'
                            }}
                            onBlur={(e) => {
                                e.target.style.background = 'transparent'
                            }}
                        />
                    </div>
                    
                    {/* 右側按鈕 */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {/* 字數統計 */}
                        <span style={{ fontSize: 13, color: '#999' }}>
                            {wordCount} 字
                        </span>
                        
                        {/* 完成按鈕 */}
                        <button
                            onClick={handleSave}
                            style={{
                                background: '#2f80ed',
                                color: 'white',
                                border: 'none',
                                borderRadius: 6,
                                padding: '8px 16px',
                                cursor: 'pointer',
                                fontSize: 14,
                                fontWeight: 500,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#1e5bb8'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#2f80ed'
                            }}
                        >
                            完成
                        </button>
                        
                        {/* 關閉按鈕 */}
                        <button
                            onClick={handleSave}
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                border: 'none',
                                background: '#f5f5f5',
                                cursor: 'pointer',
                                fontSize: 20,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#e0e0e0'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#f5f5f5'
                            }}
                        >
                            ×
                        </button>
                    </div>
                </div>
                
                {/* 編輯區域 */}
                <div
                    style={{
                        flex: 1,
                        overflow: 'auto',
                        padding: '32px 48px',
                    }}
                >
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="開始撰寫..."
                        style={{
                            width: '100%',
                            minHeight: '100%',
                            border: 'none',
                            outline: 'none',
                            resize: 'none',
                            fontFamily: 'system-ui, sans-serif',
                            fontSize: 16,
                            lineHeight: 1.6,
                            color: '#333',
                        }}
                    />
                </div>
                
                {/* 底部提示 */}
                <div
                    style={{
                        padding: '12px 24px',
                        background: '#f9f9f9',
                        borderTop: '1px solid #eee',
                        fontSize: 12,
                        color: '#999',
                        textAlign: 'center',
                    }}
                >
                    按 ESC 或點擊外部儲存並關閉
                </div>
            </div>
        </>
    )
}