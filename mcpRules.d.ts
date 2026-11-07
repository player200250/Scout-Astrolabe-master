// mcpRules.js 的型別宣告（main.js 是純 JS，給 src/ 裡的 TS 測試用）
export declare const MCP_READ_TOOLS: string[]
export declare const MCP_WRITE_TOOLS: string[]
export declare const MCP_BODY_MAX: number
export declare const MCP_ENDPOINT_FILE: string
export declare const MCP_LOG_FILE: string
export declare function checkMcpRequest(
    req: { method?: string; url?: string; headers: Record<string, string | undefined> },
    endpoint: { port: number; token: string },
): [number, string] | null
export declare function parseMcpCall(body: string): { tool: string; args: Record<string, unknown> } | null
export declare function mcpLogEntry(at: number, tool: string, args: Record<string, unknown>, result: { ok: boolean; data?: unknown; error?: string } | null): string
