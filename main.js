// 🌸 統一在頂部導入所有需要的模組
import { app, BrowserWindow, ipcMain, dialog, shell, net, protocol, Tray, Menu, globalShortcut, nativeImage } from 'electron';
import Store from 'electron-store';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.setPath('userData', path.join(app.getPath('appData'), 'Scout-Astrolabe'));

// 大型 vault（數百張卡、含 base64 圖片）會把所有 snapshot 載入記憶體，
// 預設 V8 heap 上限不足會導致 renderer OOM 崩潰（白屏）。先拉高上限止血。
// 治本仍需延遲載入 snapshot / 將圖片移出 base64。
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

const store = new Store();

// ── 托盤 / 全域捕捉（N3）狀態 ───────────────────────────────────────────
// 托盤常駐後「關視窗」不等於「結束程式」，需要一個明確的離開意圖旗標，
// 否則 close 事件永遠被攔成隱藏，App 就關不掉了。
let mainWindow = null;
let tray = null;
let isQuitting = false;

/** 全域快速捕捉快捷鍵：App 沒有焦點時也能叫出捕捉框（in-app 版是 Ctrl+Space）*/
const GLOBAL_CAPTURE_ACCELERATOR = 'CommandOrControl+Shift+Space';

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
  });
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

  win.on('closed', () => { mainWindow = null; });

  // ELECTRON_PROD_TEST=1：用 file:// 載入正式建置的 dist（= 安裝版的環境與 IndexedDB origin），
  // 方便在不打包整個安裝程式的情況下重現「只在安裝版發生」的白屏。
  const prodTest = process.env.ELECTRON_PROD_TEST === '1';
  if (app.isPackaged || prodTest) {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
    if (prodTest) win.webContents.openDevTools(); // 診斷用：正式安裝版不開
  } else {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools(); // 調試中
  }
}

const filesDir = path.join(app.getPath('userData'), 'files')
fs.mkdirSync(filesDir, { recursive: true })

app.whenReady().then(() => {
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

  createWindow();
  createTray();

  // 全域快捷鍵：App 在背景／沒有焦點時也能捕捉。註冊失敗多半是被其他程式佔用，
  // 不影響 App 本身，記錄即可（in-app 的 Ctrl+Space 仍可用）。
  if (!globalShortcut.register(GLOBAL_CAPTURE_ACCELERATOR, () => triggerQuickCapture())) {
    console.error('❌ 全域快速捕捉快捷鍵註冊失敗（可能已被其他程式佔用）:', GLOBAL_CAPTURE_ACCELERATOR);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on('before-quit', () => { isQuitting = true; });
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

// 儲存與讀取功能
ipcMain.on('save-document', (event, document) => {
  store.set('tldraw-document', document);
  console.log('Document saved!');
});

ipcMain.handle('load-document', () => {
  return store.get('tldraw-document');
});

// 檔案開啟功能
ipcMain.handle('open-document', async (event) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ 
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json', 'tldr'] }]
  });

  if (canceled) {
    return null;
  } else {
    try {
      const content = fs.readFileSync(filePaths[0], 'utf-8'); 
      return content;
    } catch (error) {
      console.error('Failed to read file:', error);
      return null;
    }
  }
});

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