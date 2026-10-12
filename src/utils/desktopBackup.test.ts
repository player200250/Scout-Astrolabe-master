// src/utils/desktopBackup.test.ts
import { describe, it, expect } from 'vitest'
import { describeBackupAge } from './desktopBackup'

const NOW = new Date(2026, 9, 12, 12, 0).getTime()
const ago = (ms: number) => NOW - ms
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('describeBackupAge', () => {
    it('沒有備份＝紅色', () => {
        expect(describeBackupAge(null, NOW)).toEqual({ level: 'danger', text: '還沒有備份' })
    })

    it('一天內＝正常，文字依長短換單位', () => {
        expect(describeBackupAge(ago(20_000), NOW)).toEqual({ level: 'ok', text: '剛剛' })
        expect(describeBackupAge(ago(5 * MIN), NOW)).toEqual({ level: 'ok', text: '5 分鐘前' })
        expect(describeBackupAge(ago(3 * HOUR + 59 * MIN), NOW)).toEqual({ level: 'ok', text: '3 小時前' })
        expect(describeBackupAge(ago(DAY), NOW).level).toBe('ok')
    })

    it('超過 1 天變黃、超過 3 天變紅', () => {
        expect(describeBackupAge(ago(DAY + MIN), NOW)).toEqual({ level: 'warn', text: '1 天前' })
        expect(describeBackupAge(ago(3 * DAY), NOW).level).toBe('warn')
        expect(describeBackupAge(ago(3 * DAY + MIN), NOW)).toEqual({ level: 'danger', text: '3 天前' })
        expect(describeBackupAge(ago(10 * DAY), NOW)).toEqual({ level: 'danger', text: '10 天前' })
    })

    it('備份時間比現在還新（時鐘被調過）當成剛剛', () => {
        expect(describeBackupAge(NOW + HOUR, NOW)).toEqual({ level: 'ok', text: '剛剛' })
    })
})
