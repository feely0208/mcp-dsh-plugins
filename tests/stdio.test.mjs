import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ROOT, toolJson } from './helpers.mjs';

/**
 * 验收测试：真实 spawn `node cli.mjs`（等价于 npx 启动的 bin），
 * 走完整 MCP stdio 握手与工具调用。
 */
test('stdio：initialize 握手、tools/list 与 search_plugins 调用', async () => {
  const childEnv = { ...process.env, DSH_PLUGIN_INDEX_OFFLINE: '1' };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['cli.mjs'],
    cwd: ROOT,
    env: childEnv,
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const client = new Client({ name: 'stdio-acceptance-client', version: '1.0.0' });
  try {
    await client.connect(transport);
    const version = client.getServerVersion();
    assert.equal(version.name, 'mcp-dsh-plugins');
    assert.equal(version.version, '0.1.0');

    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ['check_runtime', 'get_plugin', 'list_categories', 'search_plugins'],
    );

    const search = await client.callTool({ name: 'search_plugins', arguments: { query: 'sbom' } });
    assert.notEqual(search.isError, true);
    const payload = toolJson(search);
    assert.equal(payload.results[0].name, '@deepwhale-cn/dsh-sbom');
    assert.equal(payload.dataSource.kind, 'snapshot');

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(stderr, /已加载 50 个插件/);
  } finally {
    await client.close();
  }
});
