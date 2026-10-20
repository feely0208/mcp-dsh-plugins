#!/usr/bin/env node
/**
 * 启动自检：用 MCP SDK 的 stdio client 真实启动服务器（默认通过 `npx .`），
 * 验证 initialize 握手、tools/list 与一次 search_plugins 调用。
 *
 * 用法：
 *   node tests/selfcheck.mjs          # 通过 npx . 启动（验证 bin 配置）
 *   node tests/selfcheck.mjs --node   # 通过 node cli.mjs 启动
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = new URL('..', import.meta.url);
const useNode = process.argv.includes('--node');
const command = useNode ? process.execPath : 'npx';
const args = useNode ? ['cli.mjs'] : ['.'];

function parseJson(result) {
  return JSON.parse(result.content[0].text);
}

const transport = new StdioClientTransport({
  command,
  args,
  cwd: ROOT,
  env: { ...process.env, DSH_PLUGIN_INDEX_OFFLINE: '1' },
  stderr: 'inherit',
});
const client = new Client({ name: 'selfcheck-client', version: '1.0.0' });
const steps = [];
try {
  await client.connect(transport);
  const server = client.getServerVersion();
  steps.push({ step: 'initialize', ok: true, server });
  if (server?.name !== 'mcp-dsh-plugins') throw new Error(`serverInfo.name 异常: ${server?.name}`);

  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  steps.push({ step: 'tools/list', ok: true, tools: names });
  const expected = ['check_runtime', 'get_plugin', 'list_categories', 'search_plugins'];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`tools/list 不符合预期: ${names.join(',')}`);
  }

  const search = await client.callTool({ name: 'search_plugins', arguments: { query: 'sbom' } });
  const payload = parseJson(search);
  const hit = payload.results?.[0]?.name;
  steps.push({ step: 'callTool search_plugins', ok: true, hit, dataSource: payload.dataSource?.kind });
  if (hit !== '@deepwhale-cn/dsh-sbom') throw new Error(`search_plugins 未命中 dsh-sbom: ${hit}`);

  console.log(JSON.stringify({ ok: true, command: `${command} ${args.join(' ')}`, steps }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, command: `${command} ${args.join(' ')}`, steps, error: String(error) }, null, 2));
  process.exitCode = 1;
} finally {
  await client.close();
}
