// src/utils/migrationState.ts
//
// 圖片遷移進行中的旗標。遷移會逐板改寫 snapshot；若此時觸發 autoBackup，會把
// 「一半 base64、一半 storedName」的全 vault 複製成一份仍然肥大的備份。故遷移期間
// 暫停 autoBackup，全部遷完再做一次乾淨備份（見 useImageMigration / useAutoBackup）。

let running = false

export const setImageMigrationRunning = (v: boolean): void => { running = v }
export const isImageMigrationRunning = (): boolean => running
