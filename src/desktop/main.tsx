// src/desktop/main.tsx — Scout Desktop 視窗的入口（desktop.html）
//
// ⚠️ 這個資料夾不准 import dexie／tldraw／db.ts（eslint.config.js 有擋）：
// Desktop 不碰資料，而且一碰就會把整包編輯器拉進這個小視窗的 bundle。
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../theme/tokens.css'
import './desktop.css'
import { DesktopApp } from './DesktopApp'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <DesktopApp />
    </StrictMode>,
)
