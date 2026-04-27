import type { Editor } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'

interface ImageContentProps {
    editor: Editor;
    shape: TLCardShape;
}

export function ImageContent({ shape }: ImageContentProps) {
    const p = shape.props;

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                borderRadius: 4,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: '#f9f9f9',
                // ✅ 不攔截任何 pointer 事件，讓 tldraw 完全處理拖拽
                pointerEvents: 'none',
            }}
        >
            <img
                src={p.image || ''}
                alt="Card Content"
                draggable={false}
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    userSelect: 'none',
                }}
            />
        </div>
    );
}