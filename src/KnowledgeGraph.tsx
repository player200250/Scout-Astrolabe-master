// src/KnowledgeGraph.tsx
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import _ForceGraph2D from 'react-force-graph-2d'
import type { NodeObject, LinkObject } from 'react-force-graph-2d'
// react-force-graph-2d's FCwithRef wraps NodeType in NodeObject<> at every layer,
// producing NodeObject<NodeObject<NodeObject<T>>>[] — bypass with a local cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = _ForceGraph2D as any
import type { BoardRecord } from './db'
import { getCardShapes } from './utils/snapshot'

/* ------------------------------------------------------------------ types */
interface GraphNode extends NodeObject {
    id: string
    name: string
    type: 'card' | 'board'
    boardId: string
    boardName: string
    color: string
    val: number
}

interface GraphLink {
    source: string
    target: string
    type: 'wikilink' | 'parent'
}

// react-force-graph-2d augments nodes/links with simulation data at runtime
type GraphNodeObject = NodeObject<GraphNode>
type GraphLinkObject = LinkObject<GraphNode, GraphLink>

/* ------------------------------------------------------------------ helpers */
function firstLine(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48) || '(empty)'
}

function extractWikilinks(text: string): string[] {
    return (text.match(/\[\[([^\]]+)\]\]/g) ?? []).map(m => m.slice(2, -2).trim())
}

function hsl(idx: number, total: number, l: number): string {
    const h = Math.round((idx / Math.max(total, 1)) * 360)
    return `hsl(${h},65%,${l}%)`
}

/* ------------------------------------------------------------------ graph builder */
function buildGraph(boards: BoardRecord[]): { nodes: GraphNode[]; links: GraphLink[] } {
    const total = boards.length
    const colorIdx = new Map<string, number>()
    boards.forEach((b, i) => colorIdx.set(b.id, i))

    const nodes: GraphNode[] = []
    const links: GraphLink[] = []
    const refCount = new Map<string, number>()

    const boardByName = new Map<string, string>()
    boards.forEach(b => boardByName.set(b.name.toLowerCase(), b.id))
    const cardByName = new Map<string, string[]>()

    // Pass 1: card nodes
    for (const board of boards) {
        const ci = colorIdx.get(board.id) ?? 0
        for (const shape of getCardShapes(board.snapshot)) {
            if (shape.props.type !== 'text' && shape.props.type !== 'journal') continue
            const name = firstLine(shape.props.text ?? '')
            nodes.push({ id: shape.id, name, type: 'card', boardId: board.id, boardName: board.name, color: hsl(ci, total, 60), val: 1 })
            const key = name.toLowerCase()
            const existing = cardByName.get(key)
            if (existing) existing.push(shape.id)
            else cardByName.set(key, [shape.id])
            refCount.set(shape.id, 0)
        }
    }

    // Pass 1b: board nodes
    for (const board of boards) {
        const ci = colorIdx.get(board.id) ?? 0
        nodes.push({ id: board.id, name: board.name, type: 'board', boardId: board.id, boardName: board.name, color: hsl(ci, total, 44), val: 5 })
        refCount.set(board.id, 0)
    }

    // Pass 2: links
    for (const board of boards) {
        if (board.parentId && boards.find(b => b.id === board.parentId)) {
            links.push({ source: board.parentId, target: board.id, type: 'parent' })
        }
        for (const shape of getCardShapes(board.snapshot)) {
            if (shape.props.type !== 'text' && shape.props.type !== 'journal') continue
            for (const t of extractWikilinks(shape.props.text ?? '')) {
                const tl = t.toLowerCase()
                const targetId = boardByName.get(tl) ?? cardByName.get(tl)?.[0] ?? null
                if (targetId && targetId !== shape.id) {
                    links.push({ source: shape.id, target: targetId, type: 'wikilink' })
                    refCount.set(targetId, (refCount.get(targetId) ?? 0) + 1)
                }
            }
        }
    }

    for (const node of nodes) {
        const rc = refCount.get(node.id) ?? 0
        node.val = node.type === 'board' ? 5 + rc : 1 + rc
    }

    return { nodes, links }
}

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

    const { nodes: allNodes, links: allLinks } = useMemo(() => buildGraph(boards), [boards])

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

    const paintNode = useCallback((node: GraphNodeObject, ctx: CanvasRenderingContext2D) => {
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
        if (node.type === 'board' || node.val >= 3) {
            const lbl = node.name.slice(0, 20)
            ctx.font = `${node.type === 'board' ? 10 : 9}px system-ui`
            ctx.fillStyle = node.type === 'board' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)'
            ctx.textAlign = 'center'; ctx.textBaseline = 'top'
            ctx.fillText(lbl, node.x ?? 0, (node.y ?? 0) + r + 3)
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
