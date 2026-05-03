import { useContext } from 'react'
import type { Editor } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'
import { BoardsContext } from '../BoardsContext'
import { getEmbedData } from '../utils/embedUtils'
import { TextContent } from './TextContent'
import { ImageContent } from './ImageContent'
import { TodoContent } from './TodoContent'
import { LinkContent } from './LinkContent'
import { BoardContent } from './Boardcontent'
import { BacklinksPanel } from './BacklinksPanel'

function TagsDisplay({ tags }: { tags: string[] }) {
    if (!tags.length) return null
    return (
        <div style={{ padding: '3px 12px 5px', display: 'flex', flexWrap: 'wrap', gap: 3, flexShrink: 0 }}>
            {tags.map(tag => (
                <span key={tag} style={{
                    background: '#eff6ff', color: '#2563eb',
                    borderRadius: 8, padding: '1px 7px', fontSize: 10, fontWeight: 500,
                }}>
                    #{tag}
                </span>
            ))}
        </div>
    )
}

export interface CardContentProps {
    editor: Editor
    shape: TLCardShape
    isEditing: boolean
    exitEdit: () => void
}

export function CardContent({ editor, shape, isEditing, exitEdit }: CardContentProps) {
    const p = shape.props
    const boards = useContext(BoardsContext)

    switch (p.type) {
        case 'text':
            return (
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                        <TextContent editor={editor} shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
                    </div>
                    {!isEditing && <TagsDisplay tags={p.tags ?? []} />}
                    {!isEditing && (
                        <BacklinksPanel shapeId={shape.id} htmlContent={p.text || ''} />
                    )}
                </div>
            )
        case 'image':
            return <ImageContent editor={editor} shape={shape} />
        case 'todo': {
            const todoTags = p.tags ?? []
            if (!isEditing && todoTags.length > 0) {
                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
                            <TodoContent shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
                        </div>
                        <TagsDisplay tags={todoTags} />
                    </div>
                )
            }
            return <TodoContent shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
        }
        case 'link':
            return (
                <LinkContent
                    key={shape.id + p.w + p.h}
                    editor={editor}
                    shape={shape}
                    isEditing={isEditing}
                    exitEdit={exitEdit}
                    getEmbedData={getEmbedData}
                />
            )
        case 'board': {
            const linkedBoard = boards.find(b => b.id === p.linkedBoardId)
            return (
                <BoardContent
                    shape={shape}
                    boardName={linkedBoard?.name ?? p.text}
                    boardThumbnail={linkedBoard?.thumbnail ?? null}
                />
            )
        }
        case 'journal':
            return (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{
                        padding: '8px 14px',
                        background: '#dbeafe',
                        borderBottom: '2px solid #3b82f6',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#1d4ed8',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}>
                        📔 {p.journalDate ?? '今日'}
                    </div>
                    <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                            <TextContent editor={editor} shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
                        </div>
                        {!isEditing && <TagsDisplay tags={p.tags ?? []} />}
                        {!isEditing && (
                            <BacklinksPanel shapeId={shape.id} htmlContent={p.text || ''} />
                        )}
                    </div>
                </div>
            )
        // case 'code':
        //     return <CodeContent shape={shape} isEditing={isEditing} exitEdit={exitEdit} />
    }
}
