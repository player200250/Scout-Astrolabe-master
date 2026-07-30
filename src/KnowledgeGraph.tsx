// src/KnowledgeGraph.tsx
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import _ForceGraph2D from 'react-force-graph-2d'
import type { NodeObject, LinkObject } from 'react-force-graph-2d'
// react-force-graph-2d's FCwithRef wraps NodeType in NodeObject<> at every layer,
// producing NodeObject<NodeObject<NodeObject<T>>>[] — bypass with a local cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = _ForceGraph2D as any
import type { BoardRecord } from './db'
import { useBacklinks } from './hooks/useBacklinks'
import { buildGraph, shouldShowNodeLabel, type GraphNode, type GraphLink } from './utils/knowledgeGraph'
import { FullscreenPanel } from './components/ui/FullscreenPanel'
import { T } from './theme/tokens'

/* ------------------------------------------------------------------ 畫布配色
 * A3 的決定：**面板外框跟隨主題（交給 FullscreenPanel），畫布本身維持深色**。
 * 兩個理由：
 *   1. 力導向圖的節點與連線在深色底上對比最好，且節點色是 `hsl(…, 60%)` 算出來的，
 *      那組亮度是為深色背景挑的，換淺色底要整組重挑（成本與收益不成比例）。
 *   2. canvas 讀不到 CSS 變數，token 在繪製這層本來就用不上——硬要跟隨主題
 *      得把色值當參數傳進 paintNode，還要記得補 useCallback 的 deps。
 * 界線就是 header 那條底線：**線以上用 token，線以下（畫布與浮在畫布上的東西）用這裡的常數。**
 */
const SURFACE = '#0f172a'
/** legend／tooltip 的底——浮在畫布上，所以不跟主題走 */
const SURFACE_OVERLAY = 'rgba(15,23,42,0.92)'
const INK = {
    strong: 'rgba(255,255,255,0.9)',
    normal: 'rgba(255,255,255,0.6)',
    faint: 'rgba(255,255,255,0.45)',
    hairline: 'rgba(255,255,255,0.12)',
}
const LINK_COLOR = { parent: 'rgba(148,163,184,0.28)', wikilink: 'rgba(96,165,250,0.52)' }
const LEGEND_COLOR = { card: '#60a5fa', board: '#818cf8', wikilink: 'rgba(96,165,250,0.85)', parent: 'rgba(148,163,184,0.6)' }

/* ------------------------------------------------------------------ types */
// react-force-graph-2d augments nodes/links with simulation data at runtime
type GraphNodeObject = NodeObject<GraphNode>
type GraphLinkObject = LinkObject<GraphNode, GraphLink>

/* ------------------------------------------------------------------ component */
interface KnowledgeGraphProps {
    boards: BoardRecord[]
    onClose: () => void
    onJumpToCard: (boardId: string, shapeId: string) => void
    onSwitchBoard: (boardId: string) => void
}

export function KnowledgeGraph({ boards, onClose, onJumpToCard, onSwitchBoard }: KnowledgeGraphProps) {
    const [connectedOnly, setConnectedOnly] = useState(false)
    // 畫布尺寸量的是**容器**、不是視窗：進 FullscreenPanel 後畫布上方多了一條 54px header，
    // 沿用 window.innerHeight 會讓底部被裁掉。用 ResizeObserver 也免得把 header 高度寫死在這裡。
    const [dims, setDims] = useState({ w: 0, h: 0 })
    const surfaceRef = useRef<HTMLDivElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose])

    useEffect(() => {
        const el = surfaceRef.current
        if (!el) return
        const measure = () => {
            const r = el.getBoundingClientRect()
            setDims(prev => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }))
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // mousemove：直接操作 DOM，不觸發 React re-render
    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (!tooltipRef.current) return
            const el = tooltipRef.current
            if (el.style.display === 'none') return
            el.style.left = `${e.clientX + 15}px`
            el.style.top  = `${e.clientY - 14}px`
        }
        window.addEventListener('mousemove', h)
        return () => window.removeEventListener('mousemove', h)
    }, [])

    // 複用 useBacklinks 的增量快取（forwardLinks）：wikilink 解析與全 App 一致，
    // 且圖譜開啟期間存檔只增量重掃有異動的白板，不再整包重算。
    const { forwardLinks } = useBacklinks(boards)
    const { nodes: allNodes, links: allLinks } = useMemo(() => buildGraph(boards, forwardLinks), [boards, forwardLinks])

    const { nodes, links } = useMemo(() => {
        if (!connectedOnly) return { nodes: allNodes, links: allLinks }
        const connected = new Set<string>()
        allLinks.forEach((l: GraphLinkObject) => {
            const src = l.source
            const tgt = l.target
            connected.add(typeof src === 'object' && src !== null ? (src as GraphNodeObject).id as string : src as string)
            connected.add(typeof tgt === 'object' && tgt !== null ? (tgt as GraphNodeObject).id as string : tgt as string)
        })
        return { nodes: allNodes.filter(n => connected.has(n.id)), links: allLinks }
    }, [allNodes, allLinks, connectedOnly])

    // 固定 graphData 參照：只有 nodes/links 真正改變才更新，防止 simulation 被 re-render 重啟
    const graphData = useMemo(() => ({ nodes, links }), [nodes, links])

    // 力導向圖的預設縮放是固定的，跟實際佈局範圍無關——56 個節點會縮成畫面中央
    // 一小坨、標籤全疊在一起，周圍整片空白。simulation 收斂後把視野套到節點範圍。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(null)
    const hasFitRef = useRef(false)

    // 換資料（例如切「只顯示有連結的節點」）就允許再自動框一次
    useEffect(() => { hasFitRef.current = false }, [graphData])

    // onEngineStop 每次 simulation 停下來都會觸發（拖節點也會重啟再停），
    // 只做第一次——否則使用者自己縮放/平移之後會被硬拉回去。
    const handleEngineStop = useCallback(() => {
        if (hasFitRef.current) return
        hasFitRef.current = true
        fgRef.current?.zoomToFit(400, 60)
    }, [])

    const handleNodeClick = useCallback((node: GraphNodeObject) => {
        onClose()
        if (node.type === 'board') onSwitchBoard(node.id)
        else onJumpToCard(node.boardId, node.id)
    }, [onClose, onJumpToCard, onSwitchBoard])

    const handleNodeHover = useCallback((node: GraphNodeObject | null, prevNode: GraphNodeObject | null) => {
        // 取消前一個節點的固定
        if (prevNode) { prevNode.fx = undefined; prevNode.fy = undefined }
        if (!node) {
            if (tooltipRef.current) tooltipRef.current.style.display = 'none'
            return
        }
        // 固定當前節點位置，防止 simulation 繼續把它推走
        node.fx = node.x
        node.fy = node.y
        // 直接寫 DOM，不 setState
        if (tooltipRef.current) {
            const el = tooltipRef.current
            const nameEl = el.querySelector('.tt-name')
            const subEl = el.querySelector('.tt-sub')
            if (nameEl) nameEl.textContent = node.name
            if (subEl) subEl.textContent = node.type === 'board' ? '📋 白板' : `📄 ${node.boardName}`
            el.style.display = 'block'
        }
    }, [])

    const paintNode = useCallback((node: GraphNodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const r = Math.sqrt(Math.max(node.val, 1)) * 3.2
        ctx.beginPath()
        if (node.type === 'board') {
            ctx.save(); ctx.translate(node.x ?? 0, node.y ?? 0); ctx.rotate(Math.PI / 4)
            const s = r * 0.88; ctx.rect(-s, -s, s * 2, s * 2); ctx.restore()
        } else {
            ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI)
        }
        ctx.fillStyle = node.color; ctx.fill()
        if (node.type === 'board') { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke() }
        // 註：這些色值是常數、不隨主題變（見檔頭「畫布配色」），所以 paintNode 的 deps 維持空陣列是安全的。
        if (shouldShowNodeLabel(node.type, node.val, globalScale)) {
            const lbl = node.name.slice(0, 20)
            // 字級除以 globalScale：canvas 畫的是「圖座標」，不除的話放大檢視時
            // 標籤會跟著被放大成巨大文字並互相蓋住（自動 fit 之後尤其明顯）。
            // 除完等於「螢幕上恆為 9–10px」，縮放只改變節點疏密、不改變字的大小。
            ctx.font = `${(node.type === 'board' ? 10 : 9) / globalScale}px system-ui`
            ctx.fillStyle = node.type === 'board' ? INK.strong : INK.normal
            ctx.textAlign = 'center'; ctx.textBaseline = 'top'
            ctx.fillText(lbl, node.x ?? 0, (node.y ?? 0) + r + 3 / globalScale)
        }
    }, [])

    return (
        <FullscreenPanel
            title="🕸️ 知識圖譜"
            badge={`${nodes.length} 節點 · ${links.length} 連結`}
            onClose={onClose}
            padded={false}
            headerActions={
                // 這顆在 header 裡（線以上）＝跟隨主題，用 token
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', flexShrink: 0 }}>
                    <div
                        onClick={() => setConnectedOnly(v => !v)}
                        style={{
                            width: 34, height: 19, borderRadius: 10, position: 'relative', cursor: 'pointer',
                            background: connectedOnly ? T.accent : T.bgMuted,
                            border: `1px solid ${T.borderLight}`,
                            transition: 'background 0.2s', flexShrink: 0,
                        }}
                    >
                        <div style={{ position: 'absolute', top: 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'left 0.2s', left: connectedOnly ? 17 : 2 }} />
                    </div>
                    <span style={{ fontSize: 12, color: T.textSecondary, userSelect: 'none' }}>只顯示有連結的節點</span>
                </label>
            }
        >
            {/* 畫布表面：深色，與 header 以那條底線分界（見檔頭「畫布配色」） */}
            <div ref={surfaceRef} style={{ position: 'relative', width: '100%', height: '100%', background: SURFACE, overflow: 'hidden' }}>
                {/* 量到尺寸才掛圖：0×0 掛上去會讓 onEngineStop 的 zoomToFit 以錯的視野收斂 */}
                {dims.w > 0 && dims.h > 0 && (
                    <ForceGraph2D
                        ref={fgRef}
                        graphData={graphData}
                        width={dims.w} height={dims.h}
                        backgroundColor={SURFACE}
                        nodeCanvasObject={paintNode}
                        nodeCanvasObjectMode={() => 'replace'}
                        nodeLabel={() => ''}
                        onNodeHover={handleNodeHover}
                        onNodeClick={handleNodeClick}
                        linkColor={(l: GraphLinkObject) => l.type === 'parent' ? LINK_COLOR.parent : LINK_COLOR.wikilink}
                        linkWidth={(l: GraphLinkObject) => l.type === 'parent' ? 1 : 1.5}
                        linkDirectionalArrowLength={(l: GraphLinkObject) => l.type === 'wikilink' ? 5 : 0}
                        linkDirectionalArrowRelPos={1}
                        nodeRelSize={1}
                        cooldownTicks={150}
                        d3AlphaDecay={0.02}
                        d3VelocityDecay={0.28}
                        onEngineStop={handleEngineStop}
                    />
                )}

                {/* Legend */}
                <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 1, display: 'flex', gap: 16, alignItems: 'center', background: SURFACE_OVERLAY, borderRadius: 8, padding: '7px 14px', border: `1px solid ${INK.hairline}` }}>
                    <LegendItem shape="circle" color={LEGEND_COLOR.card} label="卡片" />
                    <LegendItem shape="diamond" color={LEGEND_COLOR.board} label="白板" />
                    <LegendItem shape="line" color={LEGEND_COLOR.wikilink} label="[[]] 引用" />
                    <LegendItem shape="dashed" color={LEGEND_COLOR.parent} label="父子白板" />
                </div>

                {/* Tooltip — 用 ref 直接操作 DOM，避免 setState 觸發 re-render 重啟 simulation */}
                <div
                    ref={tooltipRef}
                    style={{ display: 'none', position: 'fixed', zIndex: 2, background: SURFACE_OVERLAY, border: `1px solid ${INK.hairline}`, borderRadius: 8, padding: '7px 12px', pointerEvents: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', maxWidth: 260 }}
                >
                    <div className="tt-name" style={{ fontSize: 13, color: '#fff', fontWeight: 500, marginBottom: 2 }} />
                    <div className="tt-sub" style={{ fontSize: 11, color: INK.faint }} />
                </div>
            </div>
        </FullscreenPanel>
    )
}

/* ------------------------------------------------------------------ Legend item */
function LegendItem({ shape, color, label }: { shape: 'circle' | 'diamond' | 'line' | 'dashed'; color: string; label: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {shape === 'circle' && <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />}
            {shape === 'diamond' && <div style={{ width: 9, height: 9, background: color, transform: 'rotate(45deg)', flexShrink: 0 }} />}
            {shape === 'line' && <div style={{ width: 20, height: 2, background: color, flexShrink: 0 }} />}
            {shape === 'dashed' && <div style={{ width: 20, height: 2, flexShrink: 0, background: `repeating-linear-gradient(90deg,${color} 0 4px,transparent 4px 7px)` }} />}
            <span style={{ fontSize: 11, color: INK.faint }}>{label}</span>
        </div>
    )
}
