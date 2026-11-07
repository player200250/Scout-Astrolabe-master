// mcpRules.js — Claude Code（MCP）本機接口在 main process 這端的規則
//
// main 只做「門口檢查」：連線是不是從本機程式來的、token 對不對、工具在不在白名單、大小有沒有超過。
// 參數的完整檢查在主視窗（src/utils/mcpTools.ts 的 parseMcpArgs）。見 docs/adr/0010-claude-code-mcp-bridge.md。
//
// 純函式、不 import electron，才能直接在 vitest 裡測。

import { timingSafeEqual } from 'crypto';

/** 與 src/utils/mcpTools.ts 的 MCP_TOOL_NAMES 一致 */
export const MCP_READ_TOOLS = ['list_boards', 'read_board', 'search_cards', 'list_todos'];
export const MCP_WRITE_TOOLS = ['add_to_inbox', 'set_todo_checked', 'set_todo_due'];
export const MCP_BODY_MAX = 64 * 1024;
export const MCP_ENDPOINT_FILE = 'mcp-endpoint.json';
export const MCP_LOG_FILE = 'mcp-log.jsonl';

/**
 * 這個 HTTP 請求能不能進門。回傳 null＝可以；否則回 [狀態碼, 原因]。
 * - 瀏覽器發的請求一定帶 Origin：一律擋（網頁不該碰得到白板）
 * - Host 必須是 127.0.0.1:<port>：擋 DNS rebinding（惡意網域解析到 127.0.0.1）
 * - token 用固定時間比對
 */
export function checkMcpRequest({ method, url, headers }, { port, token }) {
  if (headers.origin) return [403, 'browser requests are not allowed'];
  if (headers.host !== `127.0.0.1:${port}`) return [403, 'bad host'];
  if (method !== 'POST' || url !== '/call') return [404, 'not found'];
  const auth = String(headers.authorization ?? '');
  const given = Buffer.from(auth.startsWith('Bearer ') ? auth.slice(7) : '');
  const want = Buffer.from(token);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return [401, 'bad token'];
  return null;
}

/** 解析請求本體 { tool, args }；不合格回 null */
export function parseMcpCall(body) {
  let parsed;
  try { parsed = JSON.parse(body); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const { tool, args } = parsed;
  if (!MCP_READ_TOOLS.includes(tool) && !MCP_WRITE_TOOLS.includes(tool)) return null;
  if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) return null;
  return { tool, args: args ?? {} };
}

/**
 * 寫入紀錄的一行（mcp-log.jsonl）。只記 id 與長度，不記內容：
 * 這個檔不加密，白板內容不該多一份散在 userData。
 */
export function mcpLogEntry(at, tool, args, result) {
  const entry = { at: new Date(at).toISOString(), tool, ok: !!result?.ok };
  for (const key of ['boardId', 'cardId', 'todoId', 'checked', 'dueDate']) {
    if (args[key] !== undefined) entry[key] = args[key];
  }
  if (typeof args.text === 'string') entry.textLength = args.text.length;
  if (result?.ok && result.data?.cardId) entry.newCardId = result.data.cardId;
  if (!result?.ok && result?.error) entry.error = result.error;
  return JSON.stringify(entry);
}
