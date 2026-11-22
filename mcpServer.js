// mcpServer.js — 給 Claude Code 連的本機接口（main process）
//
// Claude Code ──stdio──▶ scripts/scout-mcp.mjs ──HTTP 127.0.0.1──▶ 這裡 ──IPC──▶ 主視窗
//
// 這裡只轉送，不碰資料：主視窗是唯一的寫入者（同 Scout Desktop，見 ADR 0009／0010）。
// 預設關閉，托盤選單「允許 Claude Code 連線」打開才聽。port 與 token 每次啟動隨機產生，
// 寫在 userData/mcp-endpoint.json 給橋接腳本讀；關掉或結束 App 就刪掉。

import http from 'http';
import fs from 'fs';
import path from 'path';
import { randomBytes, randomUUID } from 'crypto';
import { app, ipcMain } from 'electron';
import { checkMcpRequest, parseMcpCall, mcpLogEntry, MCP_WRITE_TOOLS, MCP_BODY_MAX, MCP_ENDPOINT_FILE, MCP_LOG_FILE } from './mcpRules.js';

/** 主視窗多久沒回就放棄（正常是幾十毫秒） */
const RESPONSE_TIMEOUT_MS = 10_000;

let ctx = null;
let server = null;
let endpoint = null; // { port, token }
let rendererReady = false;
const pending = new Map(); // id → { resolve, timer }

const endpointPath = () => path.join(app.getPath('userData'), MCP_ENDPOINT_FILE);
const logPath = () => path.join(app.getPath('userData'), MCP_LOG_FILE);

/**
 * @param {{ store: any, getMainWindow: () => import('electron').BrowserWindow | null }} options
 */
export function initMcpIpc(options) {
  ctx = options;
  const fromMain = (e) => e.sender === ctx.getMainWindow()?.webContents;

  ipcMain.on('mcp:ready', (e, ready) => { if (fromMain(e)) rendererReady = ready === true; });
  ipcMain.on('mcp:response', (e, msg) => {
    if (!fromMain(e)) return;
    const p = pending.get(msg?.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    p.resolve(msg.result ?? { ok: false, error: '主視窗沒有回傳結果' });
  });

  if (isMcpEnabled()) startMcpServer();
}

/** 主視窗重新載入／崩潰：等它重新說 ready 之前不收請求 */
export function markMcpNotReady() {
  rendererReady = false;
}

export const isMcpEnabled = () => ctx?.store.get('mcpEnabled', false) === true;

export function setMcpEnabled(on) {
  ctx.store.set('mcpEnabled', on);
  if (on) startMcpServer();
  else stopMcpServer();
}

function askMainWindow(tool, args) {
  const win = ctx.getMainWindow();
  if (!win || win.isDestroyed() || !rendererReady) {
    return Promise.resolve({ ok: false, error: 'Scout 主視窗還沒準備好（剛啟動或正在重新載入），請稍後再試' });
  }
  const id = randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: '主視窗沒有回應（逾時）' });
    }, RESPONSE_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    win.webContents.send('mcp:request', { id, tool, args });
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function handle(req, res) {
  const denied = checkMcpRequest(req, endpoint);
  if (denied) return send(res, denied[0], { ok: false, error: denied[1] });

  let body = '';
  let tooLarge = false;
  req.setEncoding('utf8');
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MCP_BODY_MAX) { tooLarge = true; break; }
  }
  if (tooLarge) return send(res, 413, { ok: false, error: '請求太大' });

  const call = parseMcpCall(body);
  if (!call) return send(res, 400, { ok: false, error: '工具名稱或參數格式不對' });

  const result = await askMainWindow(call.tool, call.args);
  if (MCP_WRITE_TOOLS.includes(call.tool)) {
    fs.appendFile(logPath(), mcpLogEntry(Date.now(), call.tool, call.args, result) + '\n', (err) => {
      if (err) console.error('❌ MCP 寫入紀錄失敗:', err);
    });
  }
  send(res, 200, result);
}

function startMcpServer() {
  if (server) return;
  const token = randomBytes(32).toString('hex');
  server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('❌ MCP 請求處理失敗:', err);
      if (!res.headersSent) send(res, 500, { ok: false, error: '內部錯誤' });
    });
  });
  server.on('error', (err) => {
    console.error('❌ MCP 接口啟動失敗:', err);
    stopMcpServer();
  });
  // port 0＝讓系統挑空的；只綁 127.0.0.1，區網其他機器連不到
  server.listen(0, '127.0.0.1', () => {
    endpoint = { port: server.address().port, token };
    try {
      fs.writeFileSync(endpointPath(), JSON.stringify({ version: 1, port: endpoint.port, token, pid: process.pid }), { mode: 0o600 });
    } catch (err) {
      console.error('❌ 寫入 MCP 連線資訊失敗:', err);
      stopMcpServer();
    }
  });
}

export function stopMcpServer() {
  server?.close();
  server = null;
  endpoint = null;
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, error: 'Scout 已關閉 Claude Code 連線' });
    pending.delete(id);
  }
  // 只刪自己寫的那份：別的實例寫的（pid 不同）不能順手刪掉，否則它的連線也跟著斷。
  try {
    const cur = JSON.parse(fs.readFileSync(endpointPath(), 'utf8'));
    if (cur?.pid === process.pid) fs.rmSync(endpointPath(), { force: true });
  } catch { /* 檔案不在或壞掉：沒有要刪的 */ }
}
