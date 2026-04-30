import type { TLShape } from 'tldraw'

interface TodoItem {
    id: string
    text: string
    checked: boolean
    dueDate?: string | null
}

interface CardProps {
    type: 'text' | 'image' | 'todo' | 'link' | 'board' | 'journal'
    text: string
    todos?: TodoItem[]
    url?: string | null
    title?: string
    journalDate?: string | null
}

function nodeToMarkdown(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const el = node as Element
    const tag = el.tagName.toLowerCase()
    const inner = () => Array.from(el.childNodes).map(nodeToMarkdown).join('')

    switch (tag) {
        case 'h1': return `# ${inner()}\n\n`
        case 'h2': return `## ${inner()}\n\n`
        case 'h3': return `### ${inner()}\n\n`
        case 'h4': return `#### ${inner()}\n\n`
        case 'strong': case 'b': return `**${inner()}**`
        case 'em': case 'i': return `*${inner()}*`
        case 'u': return `<u>${inner()}</u>`
        case 'code': return `\`${inner()}\``
        case 'pre': return `\`\`\`\n${inner()}\n\`\`\`\n\n`
        case 'ul': {
            const items = Array.from(el.children).map(li => `- ${nodeToMarkdown(li).trim()}`).join('\n')
            return `${items}\n\n`
        }
        case 'ol': {
            const items = Array.from(el.children).map((li, i) => `${i + 1}. ${nodeToMarkdown(li).trim()}`).join('\n')
            return `${items}\n\n`
        }
        case 'li': return inner()
        case 'br': return '\n'
        case 'a': return `[${inner()}](${el.getAttribute('href') ?? ''})`
        case 'p': return `${inner()}\n\n`
        default: return inner()
    }
}

function htmlToMarkdown(html: string): string {
    if (!html) return ''
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return nodeToMarkdown(doc.body).trim()
}

function stripHtml(html: string): string {
    if (!html) return ''
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return doc.body.textContent ?? ''
}

function cardToMarkdown(props: CardProps): string | null {
    switch (props.type) {
        case 'text': {
            const md = htmlToMarkdown(props.text)
            return md || null
        }
        case 'journal': {
            const parts: string[] = []
            if (props.journalDate) parts.push(`# ${props.journalDate}\n`)
            const md = htmlToMarkdown(props.text)
            if (md) parts.push(md)
            return parts.join('\n') || null
        }
        case 'todo': {
            const parts: string[] = []
            const title = stripHtml(props.text)
            if (title) parts.push(`## ${title}\n`)
            for (const todo of (props.todos ?? [])) {
                const check = todo.checked ? '[x]' : '[ ]'
                const due = todo.dueDate ? ` 📅 ${todo.dueDate}` : ''
                parts.push(`- ${check} ${todo.text}${due}`)
            }
            return parts.length > 0 ? parts.join('\n') : null
        }
        case 'link': {
            const url = props.url ?? ''
            if (!url) return null
            const title = props.title || stripHtml(props.text)
            return title ? `[${title}](${url})` : `<${url}>`
        }
        case 'image':
            return '*[圖片卡片]*'
        case 'board': {
            const name = stripHtml(props.text) || '白板'
            return `*[白板連結：${name}]*`
        }
        default:
            return null
    }
}

function download(content: string, name: string): void {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.md`
    a.click()
    URL.revokeObjectURL(url)
}

export function exportBoardToMarkdown(shapes: TLShape[], boardName: string): void {
    const sections = shapes
        .filter(s => s.type === 'card')
        .map(s => cardToMarkdown((s as any).props as CardProps))
        .filter((s): s is string => s !== null && s.trim() !== '')

    if (sections.length === 0) { alert('白板沒有可匯出的卡片'); return }
    download(sections.join('\n\n---\n\n') + '\n', boardName)
}

export function exportSelectedToMarkdown(shapes: TLShape[], boardName: string): void {
    if (shapes.length === 0) { alert('請先選取卡片'); return }
    exportBoardToMarkdown(shapes, boardName)
}
