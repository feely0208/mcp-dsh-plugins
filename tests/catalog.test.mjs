import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCatalog,
  checkRuntime,
  getPlugin,
  listCategories,
  pluginDetail,
  searchPlugins,
  suggestPlugins,
} from '../src/catalog.mjs';
import { getSnapshotCatalog } from './helpers.mjs';

test('快照目录包含 50 个插件并完成分类', async () => {
  const catalog = await getSnapshotCatalog();
  assert.equal(catalog.plugins.length, 50);
  assert.equal(new Set(catalog.plugins.map((plugin) => plugin.name)).size, 50);
  assert.equal(catalog.plugins.every((plugin) => plugin.latestVersion), true);
  const counts = Object.fromEntries(catalog.categories.map((category) => [category.id, category.count]));
  assert.deepEqual(counts, {
    compliance: 13,
    governance: 14,
    data: 7,
    'supply-chain': 7,
    capability: 6,
    industry: 3,
    other: 0,
  });
  assert.equal(
    catalog.categories.reduce((sum, category) => sum + category.count, 0),
    50,
  );
});

test('关键插件分类正确', async () => {
  const catalog = await getSnapshotCatalog();
  const categoryOf = (name) => catalog.byName.get(name).category.id;
  assert.equal(categoryOf('@deepwhale-cn/dsh-sbom'), 'supply-chain');
  assert.equal(categoryOf('@deepwhale-cn/dsh-cn-pipl-check'), 'compliance');
  assert.equal(categoryOf('@deepwhale-cn/dsh-cn-data-export'), 'data');
  assert.equal(categoryOf('@deepwhale-cn/dsh-cn-doc-formatter'), 'capability');
  assert.equal(categoryOf('@deepwhale-cn/dsh-data-classify'), 'data');
  assert.equal(categoryOf('@deepwhale-cn/dsh-agent-scope'), 'governance');
  assert.equal(categoryOf('@deepwhale-cn/dsh-industry-finance'), 'industry');
});

test('search_plugins 支持中英文关键词、分类与 limit', async () => {
  const catalog = await getSnapshotCatalog();
  const byName = searchPlugins(catalog, { query: 'sbom' });
  assert.equal(byName.results[0].name, '@deepwhale-cn/dsh-sbom');
  assert.match(byName.results[0].installCommand, /^dsh plugin add @deepwhale-cn\/dsh-sbom$/);

  const chinese = searchPlugins(catalog, { query: '隐私', limit: 5 });
  assert.ok(chinese.count > 0);
  assert.ok(chinese.count <= 5);
  assert.ok(chinese.results.some((item) => item.name.includes('pipl') || item.name.includes('cn-filing')));

  const byCategory = searchPlugins(catalog, { category: '合规', limit: 50 });
  assert.equal(byCategory.total, 13);
  assert.ok(byCategory.results.every((item) => item.category.id === 'compliance'));
  const byCategoryId = searchPlugins(catalog, { category: 'supply-chain', limit: 50 });
  assert.equal(byCategoryId.total, 7);

  const limited = searchPlugins(catalog, { limit: 3 });
  assert.equal(limited.count, 3);
  assert.equal(limited.total, 50);

  assert.throws(() => searchPlugins(catalog, { category: '不存在的分类' }), /未知分类/);
});

test('get_plugin 支持全名/短名/大小写并可给出建议', async () => {
  const catalog = await getSnapshotCatalog();
  const plugin = getPlugin(catalog, 'dsh-sbom');
  assert.equal(plugin.name, '@deepwhale-cn/dsh-sbom');
  assert.equal(getPlugin(catalog, '@deepwhale-cn/dsh-sbom'), plugin);
  assert.equal(getPlugin(catalog, 'DSH-SBOM'), plugin);
  assert.equal(getPlugin(catalog, 'no-such-plugin'), null);
  const detail = pluginDetail(plugin);
  assert.equal(detail.latestVersion, '0.1.0');
  assert.equal(detail.homepage, 'https://deepwhale.org.cn/plugins.html');
  assert.equal(detail.engines.dsh, '>=0.1.0-rc.6 <0.3.0');
  assert.ok(detail.versions.length >= 1);
  assert.ok(suggestPlugins(catalog, 'dsh-pip').length > 0);
});

test('list_categories 列出六个非空分类', async () => {
  const catalog = await getSnapshotCatalog();
  const result = listCategories(catalog);
  assert.equal(result.count, 6);
  assert.ok(result.categories.every((category) => category.count > 0));
  assert.equal(
    result.categories.reduce((sum, category) => sum + category.count, 0),
    50,
  );
  assert.ok(result.categories.every((category) => category.plugins.length === category.count));
});

test('check_runtime 对预发布与越界版本判断正确', async () => {
  const catalog = await getSnapshotCatalog();
  const rc = checkRuntime(catalog, '0.2.1-rc.2');
  assert.equal(rc.compatibleCount, 50);
  assert.equal(rc.incompatibleCount, 0);
  assert.equal(rc.unknownCount, 0);
  assert.equal(rc.compatible[0].installCommand.startsWith('dsh plugin add '), true);

  const tooNew = checkRuntime(catalog, '0.3.0');
  assert.equal(tooNew.compatibleCount, 0);
  assert.equal(tooNew.incompatibleCount, 50);
  assert.match(tooNew.incompatible[0].reason, /需要 DSH/);

  const tooOld = checkRuntime(catalog, '0.1.0-rc.5');
  assert.equal(tooOld.compatibleCount, 0);

  assert.throws(() => checkRuntime(catalog, 'banana'), /无效的 DSH 版本号/);
});

test('buildCatalog 从乱序版本中选最新版并保留全部版本', () => {
  const catalog = buildCatalog({
    format: 1,
    plugins: [
      {
        name: '@deepwhale-cn/dsh-demo',
        title: { zh: '演示', en: 'Demo' },
        description: { zh: '演示插件', en: 'Demo plugin' },
        versions: [
          { version: '0.1.0', engines: { dsh: '>=0.1.0-rc.6 <0.3.0' } },
          { version: '0.2.0', engines: { dsh: '>=0.2.0 <0.4.0' } },
          { version: '0.2.1-rc.1', engines: { dsh: '>=0.2.0 <0.4.0' } },
        ],
      },
    ],
  });
  const plugin = catalog.plugins[0];
  assert.equal(plugin.latestVersion.version, '0.2.0');
  assert.deepEqual(
    plugin.versions.map((entry) => entry.version),
    ['0.2.1-rc.1', '0.2.0', '0.1.0'],
  );
});
