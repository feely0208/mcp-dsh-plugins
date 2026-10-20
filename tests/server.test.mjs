import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { connectInMemory, getSnapshotCatalog, toolJson } from './helpers.mjs';

let client;
let server;

before(async () => {
  const catalog = await getSnapshotCatalog();
  ({ client, server } = await connectInMemory(catalog));
});

after(async () => {
  await client?.close();
  await server?.close();
});

test('initialize 握手后 tools/list 返回四个工具', async () => {
  const result = await client.listTools();
  const names = result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ['check_runtime', 'get_plugin', 'list_categories', 'search_plugins']);
  for (const tool of result.tools) {
    assert.ok(tool.description, `${tool.name} 缺少 description`);
    assert.equal(tool.inputSchema.type, 'object');
  }
});

test('search_plugins 通过 MCP 调用可用', async () => {
  const result = await client.callTool({ name: 'search_plugins', arguments: { query: 'sbom' } });
  assert.notEqual(result.isError, true);
  const payload = toolJson(result);
  assert.equal(payload.results[0].name, '@deepwhale-cn/dsh-sbom');
  assert.equal(payload.count, 1);
  assert.equal(payload.dataSource.kind, 'snapshot');
});

test('search_plugins 支持分类过滤与 limit', async () => {
  const result = await client.callTool({
    name: 'search_plugins',
    arguments: { category: '数据', limit: 3 },
  });
  const payload = toolJson(result);
  assert.equal(payload.category.id, 'data');
  assert.equal(payload.count, 3);
  assert.equal(payload.total, 7);
});

test('get_plugin 返回版本、安装命令与 homepage', async () => {
  const result = await client.callTool({ name: 'get_plugin', arguments: { name: 'dsh-sbom' } });
  const payload = toolJson(result);
  assert.equal(payload.plugin.name, '@deepwhale-cn/dsh-sbom');
  assert.equal(payload.plugin.latestVersion, '0.1.0');
  assert.equal(payload.plugin.installCommand, 'dsh plugin add @deepwhale-cn/dsh-sbom');
  assert.equal(payload.plugin.homepage, 'https://deepwhale.org.cn/plugins.html');
  assert.ok(payload.plugin.versions.length >= 1);
});

test('get_plugin 找不到时返回 isError 与建议', async () => {
  const result = await client.callTool({ name: 'get_plugin', arguments: { name: 'dsh-pip' } });
  assert.equal(result.isError, true);
  const payload = toolJson(result);
  assert.match(payload.error, /未找到插件/);
  assert.ok(Array.isArray(payload.suggestions));
});

test('list_categories 返回六个分类', async () => {
  const result = await client.callTool({ name: 'list_categories', arguments: {} });
  const payload = toolJson(result);
  assert.equal(payload.count, 6);
  assert.equal(
    payload.categories.reduce((sum, category) => sum + category.count, 0),
    50,
  );
});

test('list_categories 可省略插件名单', async () => {
  const result = await client.callTool({
    name: 'list_categories',
    arguments: { include_plugins: false },
  });
  const payload = toolJson(result);
  assert.equal(payload.categories.every((category) => category.plugins === undefined), true);
});

test('check_runtime 判断预发布版本兼容性', async () => {
  const compatible = toolJson(
    await client.callTool({ name: 'check_runtime', arguments: { dsh_version: '0.2.1-rc.2' } }),
  );
  assert.equal(compatible.compatibleCount, 50);
  assert.equal(compatible.incompatibleCount, 0);
  assert.equal(compatible.dataSource.kind, 'snapshot');

  const incompatible = toolJson(
    await client.callTool({ name: 'check_runtime', arguments: { dsh_version: '0.3.0' } }),
  );
  assert.equal(incompatible.compatibleCount, 0);
  assert.equal(incompatible.incompatibleCount, 50);
});

test('check_runtime 非法版本返回 isError', async () => {
  const result = await client.callTool({
    name: 'check_runtime',
    arguments: { dsh_version: '版本号' },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /无效的 DSH 版本号/);
});
