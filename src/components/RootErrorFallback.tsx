// src/components/RootErrorFallback.tsx
// 根節點 ErrorBoundary 的 fallback。獨立成檔以符合 react-refresh
// （元件不要混在無 export 的入口檔 main.tsx）。
export function RootErrorFallback(error: Error) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100vh', padding: 32, gap: 16, textAlign: 'center',
        }}>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>應用程式發生錯誤</div>
            <div style={{
                fontSize: 12, color: '#94a3b8', background: '#f8fafc',
                borderRadius: 8, padding: '10px 16px', maxWidth: 480,
                fontFamily: 'monospace', wordBreak: 'break-all',
            }}>
                {error.message}
            </div>
            <button
                onClick={() => window.location.reload()}
                style={{
                    padding: '8px 22px', borderRadius: 8, border: 'none',
                    background: '#3b82f6', color: 'white', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                }}
            >
                重新載入
            </button>
        </div>
    )
}
