import { useState, useEffect, useCallback } from 'react'

const STEPS = [
    {
        icon: '🌟',
        title: '歡迎使用 Scout Astrolabe',
        desc: '這是你的個人視覺化白板，\n把想法、筆記、任務全部放在這裡。\n完全離線，資料只存在你的電腦。\n\n花 30 秒了解四個核心概念。',
    },
    {
        icon: '📋',
        title: '白板是你的工作空間',
        desc: '每個白板是一個主題的容器。\n可以建立「工作」、「讀書筆記」、「個人計畫」等白板，\n側邊欄可以快速切換。\n不確定放哪裡？先放收件匣。',
    },
    {
        icon: '📝',
        title: '右鍵建立卡片',
        desc: '在白板空白處按右鍵，\n可以建立文字、待辦清單、連結、圖片卡片。\n雙擊卡片可以編輯內容。',
    },
    {
        icon: '🔍',
        title: '搜尋與快速整理',
        desc: 'Ctrl+F 搜尋所有白板的卡片內容。\nCtrl+Space 快速把想法丟進收件匣，之後再整理。\nCtrl+Shift+O 一次看所有白板。',
        callToAction: '試試在白板上按右鍵建立第一張卡片！',
    },
]

interface OnboardingModalProps {
    onClose: () => void
    isDark: boolean
}

export function OnboardingModal({ onClose, isDark }: OnboardingModalProps) {
    const [step, setStep] = useState(0)

    const handleComplete = useCallback(() => {
        try { localStorage.setItem('onboarding-completed', 'true') } catch { }
        onClose()
    }, [onClose])

    const handleNext = useCallback(() => {
        if (step < STEPS.length - 1) setStep(s => s + 1)
        else handleComplete()
    }, [step, handleComplete])

    const handlePrev = useCallback(() => {
        if (step > 0) setStep(s => s - 1)
    }, [step])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); handleNext() }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev() }
            else if (e.key === 'Escape') handleComplete()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleNext, handlePrev, handleComplete])

    const current = STEPS[step]
    const isLast = step === STEPS.length - 1

    const cardBg = isDark ? '#1e293b' : '#ffffff'
    const textColor = isDark ? '#f1f5f9' : '#1e293b'
    const mutedColor = isDark ? '#94a3b8' : '#64748b'
    const borderColor = isDark ? '#334155' : '#e2e8f0'
    const prevBtnBg = isDark ? 'transparent' : 'transparent'

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 100000,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={e => { if (e.target === e.currentTarget) handleComplete() }}
        >
            <div style={{
                width: 520, background: cardBg, borderRadius: 16,
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                padding: '32px 36px 28px',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* Step indicator */}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 32 }}>
                    {STEPS.map((_, i) => (
                        <div
                            key={i}
                            onClick={() => setStep(i)}
                            style={{
                                width: i === step ? 22 : 8, height: 8,
                                borderRadius: 4,
                                background: i === step ? '#2563eb' : (isDark ? '#334155' : '#e2e8f0'),
                                transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                                cursor: 'pointer',
                            }}
                        />
                    ))}
                </div>

                {/* Icon + content */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ fontSize: 56, marginBottom: 18, lineHeight: 1 }}>{current.icon}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: textColor, marginBottom: 14, lineHeight: 1.3 }}>
                        {current.title}
                    </div>
                    <div style={{ fontSize: 14, color: mutedColor, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                        {current.desc}
                    </div>
                    {current.callToAction && (
                        <div style={{
                            marginTop: 16, fontSize: 13, fontWeight: 600,
                            color: '#2563eb', textAlign: 'center',
                        }}>
                            {current.callToAction}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderTop: `1px solid ${borderColor}`, paddingTop: 20,
                }}>
                    {isLast ? (
                        <div style={{ fontSize: 0 }} />
                    ) : (
                        <button
                            onClick={handleComplete}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 13, color: mutedColor, padding: '6px 4px',
                                borderRadius: 6,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = textColor)}
                            onMouseLeave={e => (e.currentTarget.style.color = mutedColor)}
                        >
                            跳過
                        </button>
                    )}

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {step > 0 && (
                            <button
                                onClick={handlePrev}
                                style={{
                                    padding: '8px 16px', borderRadius: 8,
                                    border: `1px solid ${borderColor}`,
                                    background: prevBtnBg, cursor: 'pointer',
                                    fontSize: 13, color: mutedColor,
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc')}
                                onMouseLeave={e => (e.currentTarget.style.background = prevBtnBg)}
                            >
                                ← 上一步
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            style={{
                                padding: '8px 22px', borderRadius: 8, border: 'none',
                                background: '#2563eb', color: 'white', cursor: 'pointer',
                                fontSize: 13, fontWeight: 600,
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#1d4ed8')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#2563eb')}
                        >
                            {isLast ? '開始使用 🚀' : '下一步 →'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
