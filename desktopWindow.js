// desktopWindow.js — Scout Desktop（今日入口小視窗）的 main process 端
//
// 邊界（docs/adr/0009-scout-desktop-scope.md）：主視窗是唯一的資料來源與寫入者。
// 這裡只做三件事：建立／關閉 Desktop 視窗、記住位置、在兩個視窗之間轉送摘要與指令。
// main process 自己不碰任何白板資料。
//
// 就緒判斷：主視窗送來第一份摘要才算就緒；主視窗重載、崩潰、關閉就清掉，
// Desktop 收到 null ⇒ 顯示「等待 Scout…」，指令回 not-ready（快速筆記不會清空輸入框）。

import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';

const DEFAULT_SIZE = { width: 560, height: 480 };
const MIN_SIZE = { minWidth: 480, minHeight: 420 };
const BOUNDS_KEY = 'desktopBounds';
/** 上次關 App 時 Desktop 是不是開著：開著的話下次啟動自動開，不用每次去系統匣找 */
const OPEN_KEY = 'desktopOpen';
const NOTE_MAX = 5000;             // 同 src/utils/desktopSummary.ts 的 DESKTOP_NOTE_MAX
const ID_MAX = 200;
/** 崩潰自動重載：一分鐘內超過這個次數就放棄，避免無限迴圈 */
const MAX_RELOADS_PER_MIN = 3;

let desktopWindow = null;
let summary = null;            // 最新一份摘要；null ＝主視窗未就緒
let ctx = null;                // init() 注入：store、getMainWindow、showMainWindow、loadPage、onChange
let reloadTimes = [];
/** 正在跟著主視窗／App 一起關：這種關閉不算「使用者把 Desktop 關掉」，不清 desktopOpen */
let shuttingDown = false;

/** 指令白名單＋格式檢查。不合格回 null */
function sanitizeCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return null;
  switch (cmd.type) {
    case 'open-task-center':
    case 'open-journal':
    case 'refresh':
      return { type: cmd.type };
    case 'open-board':
      return typeof cmd.boardId === 'string' && cmd.boardId.length > 0 && cmd.boardId.length <= ID_MAX
        ? { type: 'open-board', boardId: cmd.boardId } : null;
    case 'quick-capture': {
      if (typeof cmd.text !== 'string') return null;
      const text = cmd.text.trim();
      return text && text.length <= NOTE_MAX ? { type: 'quick-capture', text } : null;
    }
    default:
      return null;
  }
}

function broadcast() {
  if (desktopWindow && !desktopWindow.isDestroyed()) {
    desktopWindow.webContents.send('desktop:summary-changed', summary);
  }
}

/** 主視窗重載／崩潰／關閉時呼叫：Desktop 進入「未連線」 */
export function markMainNotReady() {
  if (summary === null) return;
  summary = null;
  broadcast();
}

/** 存下來的位置還在任何一個螢幕的工作區內才用，否則只沿用大小、交給 Electron 置中（拔掉外接螢幕的情況） */
function restoreBounds() {
  const saved = ctx.store.get(BOUNDS_KEY);
  if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number') return { ...DEFAULT_SIZE };
  const area = screen.getDisplayMatching(saved).workArea;
  const visibleW = Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x);
  const visibleH = Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y);
  // 至少露出 100×40（拖曳列一段）才算還拿得回來
  if (visibleW < 100 || visibleH < 40) return { width: saved.width, height: saved.height };
  return saved;
}

function createDesktopWindow() {
  shuttingDown = false;
  ctx.store.set(OPEN_KEY, true);
  const win = desktopWindow = new BrowserWindow({
    ...restoreBounds(),
    ...MIN_SIZE,
    title: 'Scout Desktop',   // 別和主視窗同名：run-desktop skill 用標題抓視窗
    frame: false,
    show: false,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(ctx.dirname, 'preload-desktop.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());

  let saveTimer = null;
  const saveBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win.isDestroyed() && !win.isMinimized()) ctx.store.set(BOUNDS_KEY, win.getBounds());
    }, 300);
  };
  win.on('move', saveBounds);
  win.on('resize', saveBounds);

  // Desktop 只是看板，不需要開新視窗或導覽到別處
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('❌ Scout Desktop renderer 結束:', details);
    const now = Date.now();
    reloadTimes = reloadTimes.filter(t => now - t < 60_000);
    if (reloadTimes.length >= MAX_RELOADS_PER_MIN || win.isDestroyed()) return;
    reloadTimes.push(now);
    win.webContents.reload();
  });

  win.on('closed', () => {
    clearTimeout(saveTimer);
    desktopWindow = null;
    if (!shuttingDown) ctx.store.set(OPEN_KEY, false);
    notifyOpenChanged();
  });

  ctx.loadPage(win, 'desktop.html');
  notifyOpenChanged();
}

/** 托盤選單標籤、主 App 側邊欄按鈕的亮暗都跟著開關狀態走 */
function notifyOpenChanged() {
  ctx.onChange();
  const main = ctx.getMainWindow();
  if (main && !main.isDestroyed()) main.webContents.send('desktop:open-changed', !!desktopWindow);
}

export function isDesktopOpen() {
  return !!desktopWindow;
}

/** Tray 選單用：沒開就開、開著就關（關閉＝銷毀，省下第二個 renderer 的記憶體；位置已存） */
export function toggleDesktopWindow() {
  if (desktopWindow) desktopWindow.close();
  else createDesktopWindow();
}

/**
 * 全域快捷鍵用：沒開就開；開著但被蓋住就叫到前面；已經在最前面才關。
 * 跟托盤／側邊欄的單純開關不同——按快捷鍵時 Desktop 多半被別的視窗蓋住，這時關掉不是使用者要的
 */
export function summonDesktopWindow() {
  if (!desktopWindow) return createDesktopWindow();
  if (desktopWindow.isFocused()) return desktopWindow.close();
  if (desktopWindow.isMinimized()) desktopWindow.restore();
  desktopWindow.show();
  desktopWindow.focus();
}

/** 啟動時：上次關 App 時 Desktop 開著就自動開 */
export function restoreDesktopWindow() {
  if (!desktopWindow && ctx.store.get(OPEN_KEY, false)) createDesktopWindow();
}

/** App 要結束了（before-quit）：接下來 Desktop 被關掉不代表使用者不要它 */
export function markDesktopShuttingDown() {
  shuttingDown = true;
}

/** 主視窗關閉時一併關掉：資料來源沒了，Desktop 留著只會顯示過時的東西 */
export function closeDesktopWindow() {
  shuttingDown = true;
  desktopWindow?.close();
}

/**
 * @param {{ store: any, dirname: string, getMainWindow: () => BrowserWindow | null,
 *           showMainWindow: () => void, loadPage: (win: BrowserWindow, page: string) => void,
 *           onChange: () => void }} options
 */
export function initDesktopIpc(options) {
  ctx = options;
  const fromMain = (e) => e.sender === ctx.getMainWindow()?.webContents;
  const fromDesktop = (e) => !!desktopWindow && e.sender === desktopWindow.webContents;

  ipcMain.on('desktop:publish-summary', (e, next) => {
    if (!fromMain(e) || !next || next.version !== 1) return;
    summary = next;
    broadcast();
  });

  // 主 App 側邊欄／命令面板的開關
  ipcMain.handle('desktop:toggle', (e) => {
    if (!fromMain(e)) return isDesktopOpen();
    toggleDesktopWindow();
    return isDesktopOpen();
  });
  ipcMain.handle('desktop:is-open', (e) => (fromMain(e) ? isDesktopOpen() : false));

  ipcMain.handle('desktop:get-summary', (e) => (fromDesktop(e) ? summary : null));

  ipcMain.handle('desktop:command', (e, raw) => {
    if (!fromDesktop(e)) return { ok: false, reason: 'invalid' };
    const cmd = sanitizeCommand(raw);
    if (!cmd) return { ok: false, reason: 'invalid' };
    const main = ctx.getMainWindow();
    if (!summary || !main || main.isDestroyed()) return { ok: false, reason: 'not-ready' };
    // 「打開 Scout 某處」要把主視窗叫到前面；快速筆記與重算在背景做就好
    if (cmd.type.startsWith('open-')) ctx.showMainWindow();
    main.webContents.send('desktop:main-command', cmd);
    return { ok: true };
  });
}
