import { describe, it, expect } from 'vitest'
import { getImageSrc } from './imageStore'

describe('getImageSrc', () => {
    it('有 storedName → 用 astro-img:// protocol', () => {
        expect(getImageSrc({ storedName: 'uuid.png', image: null })).toBe('astro-img://uuid.png')
    })

    it('storedName 優先於 image', () => {
        expect(getImageSrc({ storedName: 'uuid.png', image: 'data:image/png;base64,AAAA' })).toBe('astro-img://uuid.png')
    })

    it('無 storedName 但有 image → fallback 舊 base64', () => {
        expect(getImageSrc({ image: 'data:image/png;base64,AAAA' })).toBe('data:image/png;base64,AAAA')
    })

    it('兩者皆無 → 空字串', () => {
        expect(getImageSrc({ image: null })).toBe('')
    })
})
