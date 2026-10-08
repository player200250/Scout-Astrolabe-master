// 🌸 統一在頂部導入所有需要的模組
import { app, BrowserWindow, ipcMain, dialog, shell, net, protocol, Tray, Menu, globalShortcut, nativeImage } from 'electron';
import Store from 'electron-store';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { GUARD_FILE, checkChromeDowngrade } from './chromeGuard.js';
import { backupFileName, parseBackupFileName, selectBackupsToDelete, MIN_INTERVAL_MS } from './backupRetention.js';
import { initDesktopIpc, toggleDesktopWindow, closeDesktopWindow, isDesktopOpen, markMainNotReady, summonDesktopWindow, restoreDesktopWindow, markDesktopShuttingDown } from './desktopWindow.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.setPath('userData', path.join(app.getPath('appData'), 'Scout-Astrolabe'));

// 大型 vault（數百張卡、含 base64 圖片）會把所有 snapshot 載入記憶體，
// 預設 V8 heap 上限不足會導致 renderer OOM 崩潰（白屏）。先拉高上限止血。
// 治本仍需延遲載入 snapshot / 將圖片移出 base64。
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

// 降版防護：這次的 Chromium 比這份資料用過的還舊 ⇒ 打開資料庫會被整個刪掉重建（見 chromeGuard.js）。
// 判斷在這裡做、結果留到 whenReady 才處理（對話框要等 ready），但**絕不建立視窗**。
const guardPath = path.join(app.getPath('userData'), GUARD_FILE);
let storedChrome = null;
try { storedChrome = JSON.parse(fs.readFileSync(guardPath, 'utf8')).chrome ?? null; } catch { /* 第一次跑或檔案壞掉：視為沒有紀錄 */ }
const chromeGuard = checkChromeDowngrade(storedChrome, process.versions.chrome);

// 硬碟備份放在「文件」底下、App 資料夾之外：userData 被清掉或解除安裝都不會連帶消失
// （2026-10-05 事故時，App 內建的自動備份跟白板在同一個 IndexedDB，一起沒了）。
const backupDir = path.join(app.getPath('documents'), 'Scout Astrolabe 備份');
/** 剩餘空間低於這個值就不寫備份——寧可少一份備份，也不能把使用者的硬碟塞滿 */
const MIN_FREE_BYTES = 2 * 1024 ** 3;
const UPGRADE_SNAPSHOT_PREFIX = '升級前-Chromium';
const KEEP_UPGRADE_SNAPSHOTS = 3;

// 升級（Chromium 主版號變大）＝資料庫即將被新版改寫格式、而且再也退不回去。
// 在任何視窗打開資料庫之前，把資料原封不動複製一份。只複製正式版的資料
// （file__0 開頭＝file:// origin），開發用的 localhost 資料庫不在內，避免一次複製上百 MB。
if (chromeGuard.ok && chromeGuard.storedMajor !== null && chromeGuard.currentMajor > chromeGuard.storedMajor) {
  try {
    const ud = app.getPath('userData');
    const stamp = backupFileName(new Date()).replace(/^vault-|\.json$/g, '');
    const dest = path.join(backupDir, `${UPGRADE_SNAPSHOT_PREFIX}${chromeGuard.storedMajor}-${stamp}`);
    fs.mkdirSync(path.join(dest, 'IndexedDB'), { recursive: true });
    for (const name of fs.readdirSync(path.join(ud, 'IndexedDB'))) {
      if (name.startsWith('file__0.')) fs.cpSync(path.join(ud, 'IndexedDB', name), path.join(dest, 'IndexedDB', name), { recursive: true });
    }
    for (const name of ['Local Storage', 'config.json']) {
      if (fs.existsSync(path.join(ud, name))) fs.cpSync(path.join(ud, name), path.join(dest, name), { recursive: true });
    }
    // 只留最近幾份升級快照
    const snaps = fs.readdirSync(backupDir).filter(n => n.startsWith(UPGRADE_SNAPSHOT_PREFIX)).sort();
    for (const old of snaps.slice(0, Math.max(0, snaps.length - KEEP_UPGRADE_SNAPSHOTS))) {
      fs.rmSync(path.join(backupDir, old), { recursive: true, force: true });
    }
  } catch (err) { console.error('❌ 升級前快照失敗:', err); }
}

if (chromeGuard.ok) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(guardPath, JSON.stringify({ chrome: chromeGuard.record, updatedAt: new Date().toISOString() }));
  } catch (err) { console.error('❌ 寫入版本紀錄失敗:', err); }
}

const store = new Store();

// ── 托盤 / 全域捕捉（N3）狀態 ───────────────────────────────────────────
// 托盤常駐後「關視窗」不等於「結束程式」，需要一個明確的離開意圖旗標，
// 否則 close 事件永遠被攔成隱藏，App 就關不掉了。
let mainWindow = null;
let tray = null;
let isQuitting = false;

/** 全域快速捕捉快捷鍵：App 沒有焦點時也能叫出捕捉框（in-app 版是 Ctrl+Space）*/
const GLOBAL_CAPTURE_ACCELERATOR = 'CommandOrControl+Shift+Space';
/** 全域叫出 Scout Desktop。避開 Ctrl+Shift+D（Chrome 加書籤、VS Code 偵錯面板都用它，全域註冊會搶走） */
const GLOBAL_DESKTOP_ACCELERATOR = 'CommandOrControl+Alt+D';

/** 關閉視窗時最小化到托盤（而非結束程式）；可從托盤選單切換，存 electron-store */
const minimizeToTray = () => store.get('minimizeToTray', true);

// 第二個實例：托盤程式常見情境是使用者再點一次捷徑。
// 不開新視窗，把既有視窗叫回前景即可。
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

/** 叫出視窗並請 renderer 開啟快速捕捉框（托盤選單與全域快捷鍵共用）*/
function triggerQuickCapture() {
  showMainWindow();
  mainWindow?.webContents.send('trigger-quick-capture');
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '顯示主視窗', click: () => showMainWindow() },
    { label: '快速捕捉', accelerator: GLOBAL_CAPTURE_ACCELERATOR, click: () => triggerQuickCapture() },
    { label: isDesktopOpen() ? '關閉 Scout Desktop' : '開啟 Scout Desktop', accelerator: GLOBAL_DESKTOP_ACCELERATOR, click: () => toggleDesktopWindow() },
    { type: 'separator' },
    {
      label: '關閉視窗時最小化到托盤',
      type: 'checkbox',
      checked: minimizeToTray(),
      click: (item) => {
        store.set('minimizeToTray', item.checked);
        tray?.setContextMenu(buildTrayMenu());
      },
    },
    { type: 'separator' },
    { label: '離開 Scout Astrolabe', click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function createTray() {
  // 放 assets/ 而非 build/：build/ 是 electron-builder 的保留資源目錄，不會打包進 asar。
  // assets/ 已列入 package.json 的 build.files，開發與安裝版路徑一致。
  // 找不到圖示時不讓整個 App 掛掉，只是沒有托盤。
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.error('❌ 托盤圖示載入失敗，略過托盤:', iconPath);
    return;
  }
  tray = new Tray(icon);
  tray.setToolTip('Scout Astrolabe');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => showMainWindow());
}

// 自訂 protocol：image 卡改存實體檔後，用 astro-img://<storedName> 讓 Chromium
// 直接讀 userData/files 內的檔（不把 base64 載進 renderer JS heap，畫布 culling 時自動釋放）。
// 必須在 app ready 前註冊為 privileged scheme。
protocol.registerSchemesAsPrivileged([
  { scheme: 'astro-img', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // 確保根目錄有 preload.js
      contextIsolation: true,
      nodeIntegration: false, // 為了安全，建議保持 false
    },
    
  });
  // 連結卡的 YouTube 內嵌：正式版與 ELECTRON_PROD_TEST 都用 file:// 載入 ⇒ 送不出 Referer、
  // origin 是 null ⇒ YouTube 的 embed 直接拒播。實測（含「確定可嵌」的對照影片與
  // youtube-nocookie 版本）三者全掛，所以不是影片本身關掉嵌入。這裡只替 youtube 網域補 Referer。
  //
  // ⚠️ 三件事都是實測出來的，別憑直覺改：
  //   ① Referer 不能填 youtube.com 自己 —— 錯誤碼會從 153 變成 152-4，一樣播不了。
  //   ② 不可以順手加 Origin —— 播放器內部的 youtubei API 會回 403，整個畫面白掉。
  //   ③ 不要改 renderer 自己的 origin 來解 —— IndexedDB 按 origin 分隔，換掉＝整份 vault 讀不到。
  const YT_REFERER = 'https://scout-astrolabe.app/'; // 只是一個合法的 https 來源，不需要真實存在
  win.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.youtube.com/*', 'https://*.youtube-nocookie.com/*'] },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      if (!requestHeaders.Referer) requestHeaders.Referer = YT_REFERER;
      callback({ requestHeaders });
    }
  );

  // 💡 加入這段：攔截所有 window.open 或 target="_blank" 的連結
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      console.log("🔗 攔截到外部連結並由系統開啟:", url);
      shell.openExternal(url);
      return { action: 'deny' }; // 拒絕在 Electron 內部視窗開啟，防止資源洩漏
    }
    return { action: 'allow' };
  });

  // 診斷：把 renderer 的 console 轉發到主程序終端，並攔截崩潰/載入失敗，
  // 方便排查白屏（renderer 程序崩潰時 React 邊界與全域監聽都無能為力）。
  // 注意：Electron 35+ 的 console-message 改為單一 event 物件，這裡相容兩種簽名。
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    if (typeof e === 'object' && e && 'message' in e) {
      console.log(`[renderer:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
    } else {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    }
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('❌ renderer 程序結束（白屏元兇）:', details);
    markMainNotReady();
  });
  // 重新整理（含開發時的整頁重載）：舊摘要在新頁面發布前都不可信。
  // 用 did-navigate 而不是 did-start-loading：後者連 iframe（YouTube 內嵌）載入也會觸發
  win.webContents.on('did-navigate', () => markMainNotReady());
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('❌ 頁面載入失敗:', code, desc, url);
  });

  // 托盤常駐時，關視窗＝收進托盤（保住全域快速捕捉）。
  // 只有從托盤選單「離開」或 app.quit() 才真的結束，否則使用者會關不掉。
  win.on('close', (e) => {
    if (isQuitting || !tray || !minimizeToTray()) return;
    e.preventDefault();
    win.hide();
  });

  win.on('closed', () => {
    mainWindow = null;
    // 資料來源沒了：Desktop 一起關，否則它會讓 window-all-closed 不觸發、還顯示過時資料
    markMainNotReady();
    closeDesktopWindow();
  });

  loadPage(win, 'index.html');
  if (!app.isPackaged) win.webContents.openDevTools(); // 開發與 ELECTRON_PROD_TEST 診斷用：正式安裝版不開
}

// ELECTRON_PROD_TEST=1：用 file:// 載入正式建置的 dist（= 安裝版的環境與 IndexedDB origin），
// 方便在不打包整個安裝程式的情況下重現「只在安裝版發生」的白屏。
const prodTest = process.env.ELECTRON_PROD_TEST === '1';

/** 主視窗與 Scout Desktop 共用：正式版讀 dist/，開發版讀 Vite dev server（同一份判斷，兩個視窗的 origin 才會一致） */
function loadPage(win, page) {
  if (app.isPackaged || prodTest) {
    win.loadFile(path.join(__dirname, 'dist', page));
  } else {
    win.loadURL(page === 'index.html' ? 'http://localhost:5173' : `http://localhost:5173/${page}`);
  }
}

const filesDir = path.join(app.getPath('userData'), 'files')
fs.mkdirSync(filesDir, { recursive: true })

app.whenReady().then(() => {
  if (!chromeGuard.ok) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'Scout Astrolabe 不能用這個版本開啟',
      message: '這個版本比你上次使用的還舊，直接開啟會讓所有白板資料被清空。',
      detail: `上次使用的瀏覽器核心：Chromium ${chromeGuard.storedMajor}\n這個版本的瀏覽器核心：Chromium ${chromeGuard.currentMajor}\n\n請改用較新的版本開啟。資料都還在，沒有被動過。`,
      buttons: ['結束'],
    });
    app.exit(0);
    return;
  }

  // astro-img://<storedName> → 串流 userData/files/<storedName>。
  // storedName 一律 basename 淨化，只允許讀 filesDir 內的檔（防路徑穿越）。
  protocol.handle('astro-img', async (request) => {
    try {
      const url = new URL(request.url)
      const raw = decodeURIComponent(url.hostname || url.pathname.replace(/^\/+/, ''))
      const storedName = path.basename(raw)
      const filePath = path.join(filesDir, storedName)
      if (!storedName || !fs.existsSync(filePath)) {
        return new Response('Not Found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      console.error('❌ astro-img 讀取失敗:', err)
      return new Response('Error', { status: 500 })
    }
  })

  initDesktopIpc({
    store,
    dirname: __dirname,
    getMainWindow: () => mainWindow,
    showMainWindow,
    loadPage,
    onChange: () => tray?.setContextMenu(buildTrayMenu()),
  });
  createWindow();
  createTray();
  restoreDesktopWindow();
  // 驗證用（run-desktop skill）：agent 點不到托盤選單，用環境變數直接開 Scout Desktop。安裝版不理會
  if (!app.isPackaged && process.env.SCOUT_OPEN_DESKTOP === '1' && !isDesktopOpen()) toggleDesktopWindow();

  // 全域快捷鍵：App 在背景／沒有焦點時也能捕捉。註冊失敗多半是被其他程式佔用，
  // 不影響 App 本身，記錄即可（in-app 的 Ctrl+Space 仍可用）。
  if (!globalShortcut.register(GLOBAL_CAPTURE_ACCELERATOR, () => triggerQuickCapture())) {
    console.error('❌ 全域快速捕捉快捷鍵註冊失敗（可能已被其他程式佔用）:', GLOBAL_CAPTURE_ACCELERATOR);
  }
  if (!globalShortcut.register(GLOBAL_DESKTOP_ACCELERATOR, () => summonDesktopWindow())) {
    console.error('❌ Scout Desktop 快捷鍵註冊失敗（可能已被其他程式佔用）:', GLOBAL_DESKTOP_ACCELERATOR);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on('before-quit', () => { isQuitting = true; markDesktopShuttingDown(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });

app.on('window-all-closed', () => {
  // 有托盤且設定為最小化到托盤時，視窗全關只是收起來，不結束程式
  if (tray && minimizeToTray()) return;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ----------------------------------------------------------------
// | IPC MAIN 處理邏輯 |
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// | IPC MAIN 處理邏輯 (新增抓取功能) |
// ----------------------------------------------------------------

ipcMain.handle('get-link-preview', async (_event, url) => {
  try {
    // 1. 使用 Electron 原生的 net.fetch 避免 CORS 與安全性問題
    const response = await net.fetch(url);
    const html = await response.text();

    // 2. 簡單的正則表達式抓取 (不需要 cheerio 也能抓到基本的)
    const getMeta = (name) => {
      const match = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']([^"']*${name}[^"']*)["'][^>]+content=["']([^"']*)["']`, 'i'))
                 || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']([^"']*${name}[^"']*)["']`, 'i'));
      return match ? match[1].includes(name) ? match[2] : match[1] : null;
    };

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = getMeta('title') || getMeta('og:title') || (titleMatch ? titleMatch[1] : url);
    const description = getMeta('description') || getMeta('og:description') || "";
    const image = getMeta('og:image') || getMeta('twitter:image') || null;

    return { title, description, image };
  } catch (error) {
    console.error('❌ 抓取連結失敗:', error);
    return { title: '無法讀取網頁', description: '', image: null };
  }
});

// main.js
ipcMain.on('open-external-link', (_event, url) => {
  console.log("🚀 Electron 大腦收到指令了！準備開啟網頁:", url); // 加這行
  shell.openExternal(url).catch(err => console.error("❌ 開啟失敗:", err));
});

ipcMain.on('open-external', (_event, url) => {
  shell.openExternal(url).catch(err => console.error("❌ openExternal 失敗:", err));
});

ipcMain.handle('select-and-copy-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: '選擇檔案'
  })
  if (result.canceled || !result.filePaths[0]) return null

  const srcPath = result.filePaths[0]
  const fileName = path.basename(srcPath)
  const ext = path.extname(srcPath)
  const uuid = randomUUID()
  const destName = uuid + ext
  const destPath = path.join(filesDir, destName)

  await fs.promises.copyFile(srcPath, destPath)

  const stat = await fs.promises.stat(srcPath)
  return {
    storedName: destName,
    originalName: fileName,
    size: stat.size,
    ext: ext.toLowerCase()
  }
})

ipcMain.handle('open-file', async (_, storedName) => {
  const filePath = path.join(filesDir, storedName)
  await shell.openPath(filePath)
})

ipcMain.handle('delete-file', async (_, storedName) => {
  const filePath = path.join(filesDir, path.basename(storedName || ''))
  try {
    await fs.promises.unlink(filePath)
  } catch { /* 檔案不存在時忽略 */ }
})

// image 卡改存檔用：把壓縮後的圖片 bytes 寫入 filesDir，只回傳 storedName（輕量）。
// 來源為 base64/blob（貼上、拖入、選圖），非既有檔案路徑，故不能重用 select-and-copy-file。
ipcMain.handle('save-image', async (_, bytes, ext) => {
  const cleaned = (ext || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '')
  const finalExt = cleaned.startsWith('.') ? cleaned : '.' + cleaned
  const storedName = (randomUUID() + finalExt).toLowerCase()
  const destPath = path.join(filesDir, storedName)
  await fs.promises.writeFile(destPath, Buffer.from(bytes))
  return { storedName }
})

// ── 圖片同步（Supabase Storage）用的三個 IPC ────────────────────────────────
// 上面的 save-image 一律自己產生新的 uuid 名字，對「把雲端那張圖存回來、而且必須
// 沿用同一個 storedName」是不能用的——名字一變，snapshot 裡的參照就對不上了。
// 三個都用 basename 淨化 storedName，只允許碰 filesDir 內的檔（同 astro-img handler）。

/** 圖片存在嗎（決定要不要從雲端下載）。 */
ipcMain.handle('has-stored-file', async (_, storedName) => {
  const name = path.basename(storedName || '')
  if (!name) return false
  try {
    await fs.promises.access(path.join(filesDir, name))
    return true
  } catch {
    return false
  }
})

/** 讀出圖片位元組供上傳。檔案不存在回 null（呼叫端據此跳過，不是錯誤）。 */
ipcMain.handle('read-stored-file', async (_, storedName) => {
  const name = path.basename(storedName || '')
  if (!name) return null
  try {
    const buf = await fs.promises.readFile(path.join(filesDir, name))
    // 轉成 ArrayBuffer 才能過 structured clone 給 renderer
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  } catch {
    return null
  }
})

/**
 * 列出 filesDir 裡的所有實體檔（N10 孤兒檔清理用）。
 * 只回 metadata 不回內容——上千張圖的位元組全塞進 renderer 就是另一次 OOM。
 * `mtimeMs` 供呼叫端把「剛存進來、snapshot 還沒寫回 DB」的新檔排除在刪除名單外。
 */
ipcMain.handle('list-stored-files', async () => {
  try {
    const names = await fs.promises.readdir(filesDir)
    const out = []
    for (const name of names) {
      try {
        const st = await fs.promises.stat(path.join(filesDir, name))
        if (st.isFile()) out.push({ name, size: st.size, mtimeMs: st.mtimeMs })
      } catch { /* 掃描途中被刪掉就略過 */ }
    }
    return out
  } catch (err) {
    console.error('❌ list-stored-files 失敗:', err)
    return []
  }
})

// ── 硬碟備份（文件\Scout Astrolabe 備份）──────────────────────────────────
// renderer 每次做 App 內備份時順便呼叫；節流、空間檢查、保留規則都在這裡做，
// 這樣 renderer 重新載入也不會繞過節流。
ipcMain.handle('write-backup-file', async (_, json, imageNames) => {
  try {
    await fs.promises.mkdir(backupDir, { recursive: true });
    const existing = await fs.promises.readdir(backupDir);
    const newest = existing.map(parseBackupFileName).filter(Boolean).sort((a, b) => b - a)[0];
    if (newest && Date.now() - newest.getTime() < MIN_INTERVAL_MS) return { written: false, reason: 'throttled' };

    const { bavail, bsize } = await fs.promises.statfs(backupDir);
    if (bavail * bsize < MIN_FREE_BYTES) return { written: false, reason: 'low-disk' };

    // 先寫暫存檔再改名：寫到一半當掉也不會留下一份壞掉的 JSON
    const name = backupFileName(new Date());
    const tmp = path.join(backupDir, `${name}.tmp`);
    await fs.promises.writeFile(tmp, json, 'utf8');
    await fs.promises.rename(tmp, path.join(backupDir, name));

    // 圖片：檔名是 uuid、內容不會變 ⇒ 已經複製過的就跳過（增量）
    const imgDir = path.join(backupDir, 'files');
    await fs.promises.mkdir(imgDir, { recursive: true });
    let copied = 0;
    for (const raw of Array.isArray(imageNames) ? imageNames : []) {
      const base = path.basename(String(raw || ''));
      if (!base || fs.existsSync(path.join(imgDir, base)) || !fs.existsSync(path.join(filesDir, base))) continue;
      await fs.promises.copyFile(path.join(filesDir, base), path.join(imgDir, base));
      copied++;
    }

    const toDelete = selectBackupsToDelete(await fs.promises.readdir(backupDir), new Date());
    for (const old of toDelete) await fs.promises.unlink(path.join(backupDir, old)).catch(() => {});
    return { written: true, name, imagesCopied: copied, deleted: toDelete.length };
  } catch (err) {
    console.error('❌ 寫入硬碟備份失敗:', err);
    return { written: false, reason: String(err) };
  }
});

ipcMain.handle('get-backup-dir', () => backupDir);

/** 資料安全中心顯示用：份數、總大小（含圖片）、最新一份的時間 */
ipcMain.handle('get-backup-status', async () => {
  try {
    const names = await fs.promises.readdir(backupDir).catch(() => []);
    const dated = names.map(n => ({ n, d: parseBackupFileName(n) })).filter(x => x.d);
    let totalBytes = 0;
    for (const { n } of dated) totalBytes += (await fs.promises.stat(path.join(backupDir, n))).size;
    const imgDir = path.join(backupDir, 'files');
    for (const n of await fs.promises.readdir(imgDir).catch(() => [])) {
      totalBytes += (await fs.promises.stat(path.join(imgDir, n))).size;
    }
    const latest = dated.map(x => x.d.getTime()).sort((a, b) => b - a)[0] ?? null;
    return { dir: backupDir, count: dated.length, totalBytes, latest };
  } catch (err) {
    console.error('❌ 讀取備份狀態失敗:', err);
    return { dir: backupDir, count: 0, totalBytes: 0, latest: null };
  }
});

/**
 * 「從備份檔還原…」：選檔 → 回傳 JSON 文字；同時把備份資料夾裡、本機缺的圖片補回 filesDir。
 * 補圖只會「新增缺少的檔」，不覆蓋、不刪除——就算使用者最後按了取消也沒有副作用。
 */
ipcMain.handle('pick-backup-file', async () => {
  await fs.promises.mkdir(backupDir, { recursive: true });
  const result = await dialog.showOpenDialog({
    title: '選擇要還原的備份檔',
    defaultPath: backupDir,
    properties: ['openFile'],
    filters: [{ name: 'Scout Astrolabe 備份', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const file = result.filePaths[0];
  const json = await fs.promises.readFile(file, 'utf8');
  let imagesRestored = 0;
  const imgDir = path.join(path.dirname(file), 'files');
  for (const n of await fs.promises.readdir(imgDir).catch(() => [])) {
    const base = path.basename(n);
    if (fs.existsSync(path.join(filesDir, base))) continue;
    await fs.promises.copyFile(path.join(imgDir, base), path.join(filesDir, base));
    imagesRestored++;
  }
  return { name: path.basename(file), json, imagesRestored };
});
ipcMain.handle('open-backup-dir', async () => {
  await fs.promises.mkdir(backupDir, { recursive: true });
  return shell.openPath(backupDir);
});

/** 把雲端下載回來的圖片**以指定的 storedName** 寫進 filesDir。 */
ipcMain.handle('write-stored-file', async (_, storedName, bytes) => {
  const name = path.basename(storedName || '')
  if (!name) return false
  try {
    await fs.promises.writeFile(path.join(filesDir, name), Buffer.from(bytes))
    return true
  } catch (err) {
    console.error('❌ write-stored-file 失敗:', err)
    return false
  }
})