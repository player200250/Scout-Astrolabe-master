// 🌸 統一在頂部導入所有需要的模組
import { app, BrowserWindow, ipcMain, dialog, shell, net, protocol } from 'electron';
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

// 自訂 protocol：image 卡改存實體檔後，用 astro-img://<storedName> 讓 Chromium
// 直接讀 userData/files 內的檔（不把 base64 載進 renderer JS heap，畫布 culling 時自動釋放）。
// 必須在 app ready 前註冊為 privileged scheme。
protocol.registerSchemesAsPrivileged([
  { scheme: 'astro-img', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
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