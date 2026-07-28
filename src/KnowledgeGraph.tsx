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
    const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight })
    const tooltipRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose])

    useEffect(() => {
        const h = () => setDims({ w: window.innerWidth, h: window.innerHeight })
        window.addEventListener('resize', h)
        return () => window.removeEventListener('resize', h)
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
        if (shouldShowNodeLabel(node.type, node.val, globalScale)) {
            const lbl = node.name.slice(0, 20)
            // 字級除以 globalScale：canvas 畫的是「圖座標」，不除的話放大檢視時
            // 標籤會跟著被放大成巨大文字並互相蓋住（自動 fit 之後尤其明顯）。
            // 除完等於「螢幕上恆為 9–10px」，縮放只改變節點疏密、不改變字的大小。
            ctx.font = `${(node.type === 'board' ? 10 : 9) / globalScale}px system-ui`
            ctx.fillStyle = node.type === 'board' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)'
            ctx.textAlign = 'center'; ctx.textBaseline = 'top'
            ctx.fillText(lbl, node.x ?? 0, (node.y ?? 0) + r + 3 / globalScale)
        }
    }, [])

    const btnBase: React.CSSProperties = {
        width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
        background: 'rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: 14,
        color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 0, pointerEvents: 'auto',
    }

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: '#0f172a', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1,
                display: 'flex', alignItems: 'center', padding: '12px 20px', gap: 14,
                background: 'linear-gradient(to bottom, rgba(15,23,42,0.96) 60%, transparent)',
                pointerEvents: 'none',
            }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>🕸️ 知識圖譜</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{nodes.length} 節點 · {links.length} 連結</span>
                <div style={{ flex: 1 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', pointerEvents: 'auto' }}>
                    <div onClick={() => setConnectedOnly(v => !v)} style={{ width: 34, height: 19, borderRadius: 10, position: 'relative', cursor: 'pointer', background: connectedOnly ? '#3b82f6' : 'rgba(255,255,255,0.18)', transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 2.5, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left 0.2s', left: connectedOnly ? 17 : 2.5 }} />
                    </div>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', userSelect: 'none' }}>只顯示有連結的節點</span>
                </label>
                <button onClick={onClose} style={btnBase} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}>✕</button>
            </div>

            {/* Graph */}
            <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                width={dims.w} height={dims.h}
                backgroundColor="#0f172a"
                nodeCanvasObject={paintNode}
                nodeCanvasObjectMode={() => 'replace'}
                nodeLabel={() => ''}
                onNodeHover={handleNodeHover}
                onNodeClick={handleNodeClick}
                linkColor={(l: GraphLinkObject) => l.type === 'parent' ? 'rgba(148,163,184,0.28)' : 'rgba(96,165,250,0.52)'}
                linkWidth={(l: GraphLinkObject) => l.type === 'parent' ? 1 : 1.5}
                linkDirectionalArrowLength={(l: GraphLinkObject) => l.type === 'wikilink' ? 5 : 0}
                linkDirectionalArrowRelPos={1}
                nodeRelSize={1}
                cooldownTicks={150}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.28}
                onEngineStop={handleEngineStop}
            />

            {/* Legend */}
            <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 1, display: 'flex', gap: 16, alignItems: 'center', background: 'rgba(15,23,42,0.75)', borderRadius: 8, padding: '7px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <LegendItem shape="circle" color="#60a5fa" label="卡片" />
                <LegendItem shape="diamond" color="#818cf8" label="白板" />
                <LegendItem shape="line" color="rgba(96,165,250,0.85)" label="[[]] 引用" />
                <LegendItem shape="dashed" color="rgba(148,163,184,0.6)" label="父子白板" />
            </div>

            {/* Tooltip — 用 ref 直接操作 DOM，避免 setState 觸發 re-render 重啟 simulation */}
            <div
                ref={tooltipRef}
                style={{ display: 'none', position: 'fixed', zIndex: 2, background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', pointerEvents: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', maxWidth: 260 }}
            >
                <div className="tt-name" style={{ fontSize: 13, color: 'white', fontWeight: 500, marginBottom: 2 }} />
                <div className="tt-sub" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }} />
            </div>
        </div>
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
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
        </div>
    )
}
