import { describe, it, expect } from 'vitest'
import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import { baseBoardName, boardHasContent, findDuplicateBoards } from './duplicateBoards'

const snapWith = (shapes: Record<string, unknown>): TLEditorSnapshot =>
    ({ document: { store: shapes, schema: { schemaVersion: 2, sequences: {} } }, session: {} }) as unknown as TLEditorSnapshot

const shape = (id: string) => ({ typeName: 'shape', id, type: 'card', props: { type: 'text', text: 'x' } })

/** 有 snapshot 但畫布上一個 shape 也沒有（建了沒用就放著的板） */
const emptySnap = () => snapWith({ 'document:document': { typeName: 'document', id: 'document:document' } })

const board = (over: Partial<BoardRecord> & { id: string; name: string }): BoardRecord => ({
    snapshot: null,
    thumbnail: null,
    updatedAt: 1000,
    ...over,
})

describe('baseBoardName', () => {
    it('去掉尾端的序號', () => {
        expect(baseBoardName('主頁白板 (2)')).toBe('主頁白板')
        expect(baseBoardName('主頁白板 (13)')).toBe('主頁白板')
        expect(baseBoardName('主頁白板(2)')).toBe('主頁白板')
    })

    it('沒有序號時原樣返回', () => {
        expect(baseBoardName('主頁白板')).toBe('主頁白板')
    })

    it('只砍尾端、不動名稱中間的括號數字', () => {
        expect(baseBoardName('進度 (2) 備份')).toBe('進度 (2) 備份')
    })

    it('非數字的括號不算序號', () => {
        expect(baseBoardName('技術債 (舊)')).toBe('技術債 (舊)')
    })
})

describe('boardHasContent', () => {
    it('沒有 snapshot ＝ 空', () => {
        expect(boardHasContent(board({ id: 'a', name: 'A' }))).toBe(false)
    })

    it('有 snapshot 但沒有 shape ＝ 空（舊版 !snapshot 判斷會漏掉這種）', () => {
        expect(boardHasContent(board({ id: 'a', name: 'A', snapshot: emptySnap() }))).toBe(false)
    })

    it('有 shape ＝ 有內容', () => {
        expect(boardHasContent(board({ id: 'a', name: 'A', snapshot: snapWith({ 'shape:1': shape('shape:1') }) }))).toBe(true)
    })
})

describe('findDuplicateBoards', () => {
    it('抓得到「名稱 (N)」這種序號副本（舊版用完整名稱分組所以永遠抓不到）', () => {
        const boards = [
            board({ id: 'a', name: '主頁白板', snapshot: snapWith({ 'shape:1': shape('shape:1') }) }),
            board({ id: 'b', name: '主頁白板 (2)' }),
            board({ id: 'c', name: '主頁白板 (3)', snapshot: emptySnap() }),
        ]
        expect(findDuplicateBoards(boards).map(b => b.id)).toEqual(['b', 'c'])
    })

    it('有內容的重複板一律不刪', () => {
        const boards = [
            board({ id: 'a', name: '進度', snapshot: snapWith({ 'shape:1': shape('shape:1') }) }),
            board({ id: 'b', name: '進度 (2)', snapshot: snapWith({ 'shape:2': shape('shape:2') }) }),
        ]
        expect(findDuplicateBoards(boards)).toEqual([])
    })

    it('整組都空時必定留一塊（序號最小的本尊），不會全刪光', () => {
        const boards = [
            board({ id: 'a', name: '草稿 (3)' }),
            board({ id: 'b', name: '草稿' }),
            board({ id: 'c', name: '草稿 (2)' }),
        ]
        expect(findDuplicateBoards(boards).map(b => b.id)).toEqual(['c', 'a'])
    })

    it('沒有重複就沒有東西可刪', () => {
        const boards = [
            board({ id: 'a', name: '甲' }),
            board({ id: 'b', name: '乙' }),
        ]
        expect(findDuplicateBoards(boards)).toEqual([])
    })

    it('資料夾不參與（天生沒有 snapshot，會被誤判成空板）', () => {
        const boards = [
            board({ id: 'f1', name: '專案', isFolder: true }),
            board({ id: 'f2', name: '專案 (2)', isFolder: true }),
        ]
        expect(findDuplicateBoards(boards)).toEqual([])
    })

    it('主頁與收件匣不參與', () => {
        const boards = [
            board({ id: 'home', name: '主頁', isHome: true }),
            board({ id: 'h2', name: '主頁 (2)' }),
            board({ id: 'inbox', name: '收件匣', isInbox: true }),
            board({ id: 'i2', name: '收件匣 (2)' }),
        ]
        // 兩組各只剩一個候選 → 不成組
        expect(findDuplicateBoards(boards)).toEqual([])
    })

    it('已在垃圾桶的不重複計算', () => {
        const boards = [
            board({ id: 'a', name: '板', snapshot: snapWith({ 'shape:1': shape('shape:1') }) }),
            board({ id: 'b', name: '板 (2)', deletedAt: 123 }),
        ]
        expect(findDuplicateBoards(boards)).toEqual([])
    })

    it('有子白板指著的空板不刪（刪了子板會失去父節點）', () => {
        const boards = [
            board({ id: 'a', name: '容器', snapshot: snapWith({ 'shape:1': shape('shape:1') }) }),
            board({ id: 'b', name: '容器 (2)' }),
            board({ id: 'child', name: '子板', parentId: 'b' }),
        ]
        expect(findDuplicateBoards(boards)).toEqual([])
    })

    it('多組重複各自處理', () => {
        const boards = [
            board({ id: 'a1', name: '甲', snapshot: snapWith({ 'shape:1': shape('shape:1') }) }),
            board({ id: 'a2', name: '甲 (2)' }),
            board({ id: 'b1', name: '乙', snapshot: snapWith({ 'shape:2': shape('shape:2') }) }),
            board({ id: 'b2', name: '乙 (2)' }),
        ]
        expect(findDuplicateBoards(boards).map(b => b.id)).toEqual(['a2', 'b2'])
    })
})
