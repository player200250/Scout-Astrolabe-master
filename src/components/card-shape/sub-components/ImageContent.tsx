import type { Editor } from '@tldraw/editor'
import type { TLCardShape } from '../type/CardShape'

interface ImageContentProps {
    editor: Editor;
    shape: TLCardShape;
}

export function ImageContent({ shape }: ImageContentProps) {
    const p = shape.props;

    return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none' }}>
            <img
                src={p.image || ''}
                alt="Card Content"
                loading="lazy"
                draggable={false}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    borderRadius: 'inherit',
                    pointerEvents: 'none',
                    userSelect: 'none',
                }}
            />
        </div>
    );
}