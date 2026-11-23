// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { isSoundOn, setSoundOn, playChime, SOUND_STORAGE_KEY } from './chime'

describe('chime', () => {
    beforeEach(() => localStorage.clear())
    it('預設開，存 off 才關，可再開回來', () => {
        expect(isSoundOn()).toBe(true)
        setSoundOn(false)
        expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('off')
        expect(isSoundOn()).toBe(false)
        setSoundOn(true)
        expect(isSoundOn()).toBe(true)
    })
    it('沒有 AudioContext（jsdom）不丟錯', () => {
        expect(() => playChime()).not.toThrow()
    })
})
