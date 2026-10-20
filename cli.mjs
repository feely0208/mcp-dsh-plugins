#!/usr/bin/env node
/**
 * @deepwhale-cn/mcp-dsh-plugins
 * MCP stdio 服务器入口：把深鲸 DSH 插件市场暴露给 Claude / Cursor 等 MCP 客户端。
 *
 * 注意：stdout 专用于 JSON-RPC，日志一律写到 stderr。
 */
import { runStdioServer } from './src/server.mjs';

runStdioServer().catch((error) => {
  console.error(`[mcp-dsh-plugins] 启动失败：${error?.stack ?? error}`);
  process.exit(1);
});
