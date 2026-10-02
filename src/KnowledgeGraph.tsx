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
import { buildGraph, shouldShowNodeLabel, questTitle, shortenKeepDue, type GraphNode, type GraphLink } from './utils/knowledgeGraph'
import { FullscreenPanel } from './components/ui/FullscreenPanel'
import { T } from './theme/tokens'
import { QuestPanel } from './components/knowledge-graph/QuestPanel'
import { SURFACE, SURFACE_OVERLAY, INK, QUEST_COLOR, QUEST_TEXT } from './components/knowledge-graph/palette'

/* ------------------------------------------------------------------ 畫布配色
 * A3 的決定：**面板外框跟隨主題（交給 FullscreenPanel），畫布本身維持深色**。
 * 兩個理由：
 *   1. 力導向圖的節點與連線在深色底上對比最好，且節點色是 `hsl(…, 60%)` 算出來的，
 *      那組亮度是為深色背景挑的，換淺色底要整組重挑（成本與收益不成比例）。
 *   2. canvas 讀不到 CSS 變數，token 在繪製這層本來就用不上——硬要跟隨主題
 *      得把色值當參數傳進 paintNode，還要記得補 useCallback 的 deps。
 * 界線就是 header 那條底線：**線以上用 token，線以下（畫布與浮在畫布上的東西）用 palette.ts 的常數。**
 */
const LINK_COLOR = { parent: 'rgba(148,163,184,0.28)', wikilink: 'rgba(96,165,250,0.52)' }
const LEGEND_COLOR = { card: '#60a5fa', board: '#818cf8', wikilink: 'rgba(96,165,250,0.85)', parent: 'rgba(148,163,184,0.6)', main: QUEST_COLOR.main, side: QUEST_COLOR.side }
/** 螢幕上的最小半徑（px）。縮到全局時節點不再小到 1–2px 看不見（2026-09-30） */
const MIN_SCREEN_R = { card: 3, board: 4.5 }
/** 主線／支線固定的螢幕半徑：不隨縮放變，永遠最醒目 */
const QUEST_SCREEN_R = { main: 11, side: 7 }

/* ------------------------------------------------------------------ types */
// react-force-graph-2d augments nodes/links with simulation data at runtime
type GraphNodeObject = NodeObject<GraphNode>
type GraphLinkObject = LinkObject<GraphNode, GraphLink>

/** 節點在圖座標裡的半徑。除以 globalScale＝換成螢幕 px（canvas 畫的是圖座標，會跟著縮放） */
function nodeRadius(node: GraphNodeObject, globalScale: number): number {
    return node.type === 'quest'
        ? QUEST_SCREEN_R[node.quest ?? 'side'] / globalScale
        : Math.max(Math.sqrt(Math.max(node.val, 1)) * 3.2, MIN_SCREEN_R[node.type] / globalScale)
}

/**
 * 可點範圍的最小螢幕半徑（px）。卡片點只畫 3px，直徑 6px 的目標手很難對準。
 * 8px＝直徑 16px，接近一般圖示按鈕的大小。
 */
const MIN_HIT_SCREEN_R = 8

/**
 * 碰撞：兩個節點中心至少相隔各自半徑之和，否則互相推開（圖座標）。
 * 節點只有幾十個，O(n²) 足夠；不為此多引一個 d3 套件。
 */
const COLLIDE_R = { quest: 46, board: 30, card: 26 } as const
function collideForce() {
    let nodes: GraphNodeObject[] = []
    const force = () => {
        for (let i = 0; i < nodes.length; i++) {
            const a = nodes[i]
            for (let j = i + 1; j < nodes.length; j++) {
                const b = nodes[j]
                const dx = (b.x ?? 0) - (a.x ?? 0), dy = (b.y ?? 0) - (a.y ?? 0)
                const min = COLLIDE_R[a.type] + COLLIDE_R[b.type]
                const d2 = dx * dx + dy * dy
                if (d2 >= min * min) continue
                const d = Math.sqrt(d2) || 0.01
                const push = (min - d) / d * 0.5
                const px = (dx || 0.01) * push, py = dy * push
                // 被釘住的節點（主線、滑鼠停著的那個）不動，全部由另一個讓位
                const aFixed = a.fx != null, bFixed = b.fx != null
                if (!aFixed) { a.x = (a.x ?? 0) - (bFixed ? 2 : 1) * px; a.y = (a.y ?? 0) - (bFixed ? 2 : 1) * py }
                if (!bFixed) { b.x = (b.x ?? 0) + (aFixed ? 2 : 1) * px; b.y = (b.y ?? 0) + (aFixed ? 2 : 1) * py }
            }
        }
    }
    force.initialize = (ns: GraphNodeObject[]) => { nodes = ns }
    return force
}

/**
 * 往中心收：沒有連結的幾群原本被斥力推到很遠，zoomToFit 要把它們全框進來，
 * 每一群在螢幕上就縮成一小團。給一點點拉回原點的力，空白少了、縮放自然變大。
 */
function gatherForce(strength: number) {
    let nodes: GraphNodeObject[] = []
    const force = (alpha: number) => {
        for (const n of nodes) {
            n.vx = (n.vx ?? 0) - (n.x ?? 0) * strength * alpha
            n.vy = (n.vy ?? 0) - (n.y ?? 0) * strength * alpha
        }
    }
    force.initialize = (ns: GraphNodeObject[]) => { nodes = ns }
    return force
}

/* ------------------------------------------------------------------ component */
interface KnowledgeGraphProps {
    boards: BoardRecord[]
    onClose: () => void
    onJumpToCard: (boardId: string, shapeId: string) => void
    onSwitchBoard: (boardId: string) => void
}

export function KnowledgeGraph({ boards, onClose, onJumpToCard, onSwitchBoard }: KnowledgeGraphProps) {
    // 預設只看有連結的節點：124 個節點裡大多是孤點，全部畫出來只會互推成一圈、縮到看不見（2026-09-30）。
    // 主線／支線一律保留（它們連到所屬白板，本來就有連結）。
    const [connectedOnly, setConnectedOnly] = useState(true)
    // 畫布尺寸量的是**容器**、不是視窗：進 FullscreenPanel 後畫布上方多了一條 54px header，
    // 沿用 window.innerHeight 會讓底部被裁掉。用 ResizeObserver 也免得把 header 高度寫死在這裡。
    const [dims, setDims] = useState({ w: 0, h: 0 })
    const surfaceRef = useRef<HTMLDivElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)

    // 點主線／支線節點時打開的進度面板（存 id，節點資料每次從最新的 allNodes 取）
    const [questId, setQuestId] = useState<string | null>(null)

    // Esc 先關進度面板，再按一次才關圖譜
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            if (questId) setQuestId(null)
            else onClose()
        }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose, questId])

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
    const questNode = questId ? allNodes.find(n => n.id === questId && n.type === 'quest') ?? null : null

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
    // 主線釘在原點：打開圖譜第一眼就在正中央，其他節點圍著它排（2026-09-30：原本會被推到畫面邊緣）
    const graphData = useMemo(() => {
        for (const n of nodes as GraphNodeObject[]) {
            if (n.type === 'quest' && n.quest === 'main') { n.fx = 0; n.fy = 0 }
        }
        return { nodes, links }
    }, [nodes, links])

    // 力導向圖的預設縮放是固定的，跟實際佈局範圍無關——56 個節點會縮成畫面中央
    // 一小坨、標籤全疊在一起，周圍整片空白。simulation 收斂後把視野套到節點範圍。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(null)
    const hasFitRef = useRef(false)

    // 換資料（例如切「只顯示有連結的節點」）就允許再自動框一次
    useEffect(() => { hasFitRef.current = false }, [graphData])

    // 主線／支線與所屬白板拉開距離：預設連線長度 30，兩個節點的標籤會疊成一團（2026-09-30 截圖）。
    // 另外把主線／支線的斥力加大，讓附近的卡片標籤讓出位置。
    useEffect(() => {
        const fg = fgRef.current
        if (!fg) return
        const isQuest = (n: unknown) => typeof n === 'object' && n !== null && (n as GraphNodeObject).type === 'quest'
        // 2026-10-02：一般連線 55 → 120。55 在縮放 0.53 下只剩螢幕 29px，比標籤短得多，一群節點字疊字。
        fg.d3Force('link')?.distance((l: GraphLinkObject) => (isQuest(l.target) || isQuest(l.source) ? 140 : 120))
        fg.d3Force('charge')?.strength((n: GraphNodeObject) => (n.type === 'quest' ? -400 : -90))
        fg.d3Force('collide', collideForce())
        fg.d3Force('gather', gatherForce(0.04))
        fg.d3ReheatSimulation?.()
    }, [graphData, dims.w])

    // onEngineStop 每次 simulation 停下來都會觸發（拖節點也會重啟再停），
    // 只做第一次——否則使用者自己縮放/平移之後會被硬拉回去。
    const handleEngineStop = useCallback(() => {
        if (hasFitRef.current) return
        hasFitRef.current = true
        fgRef.current?.zoomToFit(400, 110) // 110：留出左下角圖例的位置，邊緣節點不會被它蓋住
    }, [])

    const handleNodeClick = useCallback((node: GraphNodeObject) => {
        // 主線／支線：圖譜留著、左側開進度面板；跳轉改由面板裡的按鈕
        if (node.type === 'quest') { setQuestId(node.id); return }
        onClose()
        if (node.type === 'board') onSwitchBoard(node.id)
        else onJumpToCard(node.boardId, node.id)
    }, [onClose, onJumpToCard, onSwitchBoard])

    const handleNodeHover = useCallback((node: GraphNodeObject | null, prevNode: GraphNodeObject | null) => {
        // 取消前一個節點的固定（主線例外：它固定在中心）
        if (prevNode && !(prevNode.type === 'quest' && prevNode.quest === 'main')) { prevNode.fx = undefined; prevNode.fy = undefined }
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
            if (subEl) subEl.textContent = node.type === 'board' ? '📋 白板'
                : node.type === 'quest' ? `${node.quest === 'main' ? '🎯 主線' : '支線'} · ${node.boardName}`
                : `📄 ${node.boardName}`
            el.style.display = 'block'
        }
    }, [])

    // 可點範圍（畫在 force-graph 的影子畫布上，看不見）。
    // 沒給這個的話，'replace' 模式下影子畫布會退回預設圓：√val × nodeRelSize(=1) + 1px ——
    // 縮放 0.53 時主線只剩 3.4px、卡片 1.75px，比畫出來的圓小得多，點在圓上常被當成點背景、毫無反應（2026-10-02 實測）。
    const paintPointerArea = useCallback((node: GraphNodeObject, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const r = Math.max(nodeRadius(node, globalScale) * (node.type === 'quest' ? 1.7 : 1), MIN_HIT_SCREEN_R / globalScale)
        ctx.beginPath(); ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI)
        ctx.fillStyle = color; ctx.fill()
    }, [])

    // 節點只畫圖形；文字統一交給 drawLabels（見下）。
    const paintNode = useCallback((node: GraphNodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const x = node.x ?? 0, y = node.y ?? 0
        const r = nodeRadius(node, globalScale)
        if (node.type === 'quest') {
            // 外圈光暈：在一片小點裡一眼找到
            ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, 2 * Math.PI)
            ctx.fillStyle = node.quest === 'main' ? 'rgba(249,115,22,0.22)' : 'rgba(167,139,250,0.18)'; ctx.fill()
            ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI)
            ctx.fillStyle = node.color; ctx.fill()
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5 / globalScale; ctx.stroke()
            return
        }
        ctx.beginPath()
        if (node.type === 'board') {
            ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4)
            const s = r * 0.88; ctx.rect(-s, -s, s * 2, s * 2); ctx.restore()
        } else {
            ctx.arc(x, y, r, 0, 2 * Math.PI)
        }
        ctx.fillStyle = node.color; ctx.fill()
        if (node.type === 'board') { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke() }
        // 註：這些色值是常數、不隨主題變（見檔頭「畫布配色」），所以 deps 維持空陣列是安全的。
    }, [])

    /**
     * 標籤統一在每一幀最後畫（onRenderFramePost），依重要性由高到低：主線 → 支線 → 白板 → 卡片（被引用多的先）。
     * 每畫一個就記下它佔的矩形；之後的標籤若會和已佔的重疊就不畫。
     *
     * 為什麼不再靠調連線距離／斥力：那是碰運氣——資料一變就又疊在一起（2026-09-30 試了 5 輪才發現）。
     * 這樣做「主線／支線永遠可讀」「標籤互不重疊」兩件事是由程式保證的，不隨佈局而變。
     * 字級一律換算成螢幕 px：主線 14／12.5、支線 12／11、白板 12、卡片 11。
     */
    const drawLabels = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
        const px = (n: number) => n / globalScale
        const placed: { x1: number; y1: number; x2: number; y2: number }[] = []
        const gap = px(2)
        const free = (x1: number, y1: number, x2: number, y2: number) =>
            !placed.some(p => x1 < p.x2 + gap && x2 > p.x1 - gap && y1 < p.y2 + gap && y2 > p.y1 - gap)
        const rank = (n: GraphNodeObject) =>
            n.type === 'quest' ? (n.quest === 'main' ? 0 : 1) : n.type === 'board' ? 2 : 3
        const list = (graphData.nodes as GraphNodeObject[])
            .filter(n => shouldShowNodeLabel(n.type, n.val, globalScale))
            .sort((p, q) => rank(p) - rank(q) || q.val - p.val)

        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        for (const node of list) {
            const x = node.x ?? 0, y = node.y ?? 0
            const top = y + nodeRadius(node, globalScale) + px(node.type === 'quest' ? 6 : 3)
            if (node.type === 'quest') {
                const title = `${node.quest === 'main' ? '主線' : '支線'}｜${questTitle(node.name).slice(0, 20)}`
                const next = node.nextStep ? `下一步：${shortenKeepDue(node.nextStep, 30)}` : '（全部完成）'
                const f1 = node.quest === 'main' ? 14 : 12, f2 = node.quest === 'main' ? 12.5 : 11
                ctx.font = `600 ${px(f1)}px system-ui`; const w1 = ctx.measureText(title).width
                ctx.font = `${px(f2)}px system-ui`; const w2 = ctx.measureText(next).width
                const padX = px(6), padY = px(4)
                const w = Math.max(w1, w2) + padX * 2, h = px(f1 + f2 + 6) + padY * 2
                // 主線／支線排在最前面，一定放得下；底板幾乎不透明，壓在連線或節點上也讀得到
                placed.push({ x1: x - w / 2, y1: top, x2: x + w / 2, y2: top + h })
                ctx.fillStyle = 'rgba(15,23,42,0.96)'; ctx.fillRect(x - w / 2, top, w, h)
                ctx.font = `600 ${px(f1)}px system-ui`; ctx.fillStyle = QUEST_TEXT[node.quest ?? 'side']
                ctx.fillText(title, x, top + padY)
                ctx.font = `${px(f2)}px system-ui`; ctx.fillStyle = INK.strong
                ctx.fillText(next, x, top + padY + px(f1 + 6))
                continue
            }
            const size = node.type === 'board' ? 12 : 11
            const lbl = node.name.slice(0, 20)
            ctx.font = `${px(size)}px system-ui`
            const w = ctx.measureText(lbl).width
            const box = { x1: x - w / 2, y1: top, x2: x + w / 2, y2: top + px(size + 2) }
            if (!free(box.x1, box.y1, box.x2, box.y2)) continue // 放不下就讓位給更重要的標籤
            placed.push(box)
            ctx.fillStyle = node.type === 'board' ? INK.strong : INK.normal
            ctx.fillText(lbl, x, top)
        }
    }, [graphData])

    return (
        <FullscreenPanel
            title="知識圖譜" titleIcon="knowledgeGraph"
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
                        nodePointerAreaPaint={paintPointerArea}
                        onRenderFramePost={drawLabels}
                        nodeCanvasObjectMode={() => 'replace'}
                        nodeLabel={() => ''}
                        onNodeHover={handleNodeHover}
                        onNodeClick={handleNodeClick}
                        onBackgroundClick={() => setQuestId(null)}
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

                {questNode && (
                    <QuestPanel
                        node={questNode}
                        onClose={() => setQuestId(null)}
                        onJump={() => { onClose(); onJumpToCard(questNode.boardId, questNode.id) }}
                    />
                )}

                {/* Legend */}
                <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 1, display: 'flex', gap: 16, alignItems: 'center', background: SURFACE_OVERLAY, borderRadius: 8, padding: '7px 14px', border: `1px solid ${INK.hairline}` }}>
                    <LegendItem shape="circle" color={LEGEND_COLOR.main} label="主線" />
                    <LegendItem shape="circle" color={LEGEND_COLOR.side} label="支線" />
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
