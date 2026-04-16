// 🌸 統一在頂部導入所有需要的模組
import { app, BrowserWindow, ipcMain, dialog, shell, net } from 'electron'; 
import Store from 'electron-store';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const store = new Store();

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

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  } else {
    win.loadURL('http://localhost:5173');
    // win.webContents.openDevTools(); // 需要調試時可以打開這行
  }
}

app.whenReady().then(() => {
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