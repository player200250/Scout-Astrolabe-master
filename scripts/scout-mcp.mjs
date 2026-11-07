#!/usr/bin/env node
// scripts/scout-mcp.mjs — Claude Code 的 MCP server（stdio），把工具呼叫轉給開著的 Scout Astrolabe
//
// Claude Code ──stdio──▶ 這支 ──HTTP 127.0.0.1──▶ mcpServer.js（main process）──▶ 主視窗
//
// 註冊一次就好：
//   claude mcp add scout -- node "C:/Users/win11/Desktop/Scout-Astrolabe-master/scripts/scout-mcp.mjs"
//
// 這支不碰資料，只讀 userData/mcp-endpoint.json 拿 port 與 token。零依賴：MCP 的 stdio 傳輸
// 就是一行一則 JSON-RPC，自己處理比多裝一個 SDK 簡單。見 docs/adr/0010-claude-code-mcp-bridge.md。

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const SERVER_INFO = { name: 'scout-astrolabe', version: '1.0.0' };
const FALLBACK_PROTOCOL = '2025-06-18';
const ENDPOINT_FILE = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Scout-Astrolabe', 'mcp-endpoint.json');
const NOT_RUNNING = 'Scout Astrolabe 沒有開，或托盤選單裡「允許 Claude Code 連線」沒有勾。請使用者打開後再試。';

const id = { type: 'string' };
const TOOLS = [
  {
    name: 'list_boards',
    description: '列出所有白板（不含垃圾桶）：id、名稱、種類（board／folder／inbox／journal／home）、所在資料夾、卡片數、最後修改時間。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'read_board',
    description: '讀一塊白板上的所有卡片：cardId、型別、純文字內容（每張最多 2000 字）、標籤；待辦卡另附每一項的 todoId、文字、是否勾選、到期日。',
    inputSchema: { type: 'object', properties: { boardId: id }, required: ['boardId'] },
  },
  {
    name: 'search_cards',
    description: '全域搜尋卡片內容與標籤（不分大小寫），回傳最多 50 筆：所在白板、cardId、型別、內容片段。',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: '關鍵字' } }, required: ['query'] },
  },
  {
    name: 'list_todos',
    description: '列出待辦項目，依到期日排序（最多 200 筆）。filter：overdue＝逾期未完成、today＝今天到期未完成、open＝所有未完成（預設）、all＝全部。',
    inputSchema: { type: 'object', properties: { filter: { type: 'string', enum: ['overdue', 'today', 'open', 'all'] } } },
  },
  {
    name: 'add_to_inbox',
    description: '在收件匣新增一張文字卡（純文字，換行會分段）。回傳新卡的 cardId。',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: '卡片內容，最多 5000 字' } }, required: ['text'] },
  },
  {
    name: 'set_todo_checked',
    description: '勾選或取消勾選一個待辦項目。boardId／cardId／todoId 從 list_todos 或 read_board 取得。',
    inputSchema: {
      type: 'object',
      properties: { boardId: id, cardId: id, todoId: id, checked: { type: 'boolean' } },
      required: ['boardId', 'cardId', 'todoId', 'checked'],
    },
  },
  {
    name: 'set_todo_due',
    description: '改一個待辦項目的到期日。dueDate 用 YYYY-MM-DD；給 null 拿掉到期日。',
    inputSchema: {
      type: 'object',
      properties: { boardId: id, cardId: id, todoId: id, dueDate: { type: ['string', 'null'], description: 'YYYY-MM-DD 或 null' } },
      required: ['boardId', 'cardId', 'todoId', 'dueDate'],
    },
  },
];

function readEndpoint() {
  try {
    const ep = JSON.parse(fs.readFileSync(ENDPOINT_FILE, 'utf8'));
    return ep && ep.version === 1 && ep.port && ep.token ? ep : null;
  } catch {
    return null;
  }
}

/** 呼叫 App；回傳 MCP 的 tools/call 結果 */
async function callScout(name, args) {
  const ep = readEndpoint();
  if (!ep) return toolError(NOT_RUNNING);
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${ep.port}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ep.token}` },
      body: JSON.stringify({ tool: name, args: args ?? {} }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // 連線被拒＝App 當掉沒刪到 endpoint 檔，當作沒開
    return toolError(NOT_RUNNING);
  }
  const result = await res.json().catch(() => null);
  if (!result) return toolError(`Scout 回應格式不對（HTTP ${res.status}）`);
  if (!result.ok) return toolError(result.error ?? `失敗（HTTP ${res.status}）`);
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
}

const toolError = (text) => ({ content: [{ type: 'text', text }], isError: true });

async function handle(msg) {
  switch (msg.method) {
    case 'initialize':
      return {
        protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : FALLBACK_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const name = msg.params?.name;
      if (!TOOLS.some(t => t.name === name)) throw Object.assign(new Error(`沒有這個工具：${name}`), { code: -32602 });
      return callScout(name, msg.params?.arguments);
    }
    default:
      throw Object.assign(new Error(`不支援的方法：${msg.method}`), { code: -32601 });
  }
}

const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  // 通知（沒有 id，例如 notifications/initialized）不必回
  if (msg.id === undefined || msg.id === null) return;
  try {
    write({ jsonrpc: '2.0', id: msg.id, result: await handle(msg) });
  } catch (err) {
    write({ jsonrpc: '2.0', id: msg.id, error: { code: err.code ?? -32603, message: err.message } });
  }
});
