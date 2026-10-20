import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_INDEX_URL,
  loadPluginIndex,
  validateIndex,
} from '../src/index-loader.mjs';

const minimalIndex = {
  format: 1,
  title: { zh: '测试市场', en: 'Test Market' },
  plugins: [
    {
      name: '@deepwhale-cn/dsh-demo',
      title: { zh: '演示', en: 'Demo' },
      description: { zh: '演示插件', en: 'Demo plugin' },
      author: '温州深鲸智能科技有限公司',
      homepage: 'https://deepwhale.org.cn/plugins.html',
      versions: [{ version: '0.1.0', engines: { dsh: '>=0.1.0-rc.6 <0.3.0' } }],
    },
  ],
};

test('默认地址指向 deepwhale.org.cn 的市场索引', () => {
  assert.equal(DEFAULT_INDEX_URL, 'https://www.deepwhale.org.cn/plugin-market.json');
});

test('远程成功时来源为 remote', async () => {
  let requested;
  const fakeFetch = async (url, options) => {
    requested = { url, options };
    return new Response(JSON.stringify(minimalIndex), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const loaded = await loadPluginIndex({ fetchImpl: fakeFetch, env: {} });
  assert.equal(loaded.source, 'remote');
  assert.equal(loaded.resolved, DEFAULT_INDEX_URL);
  assert.equal(loaded.index.plugins.length, 1);
  assert.equal(requested.url, DEFAULT_INDEX_URL);
  assert.equal(requested.options.headers['user-agent'].includes('mcp-dsh-plugins'), true);
});

test('DSH_PLUGIN_INDEX_URL 覆盖默认地址', async () => {
  const urls = [];
  const fakeFetch = async (url) => {
    urls.push(url);
    return new Response(JSON.stringify(minimalIndex), { status: 200 });
  };
  const loaded = await loadPluginIndex({
    fetchImpl: fakeFetch,
    env: { DSH_PLUGIN_INDEX_URL: 'https://example.com/custom.json' },
  });
  assert.equal(loaded.source, 'remote');
  assert.equal(urls[0], 'https://example.com/custom.json');
});

test('远程失败时回退到随包快照（断网可用）', async () => {
  const failingFetch = async () => {
    throw new Error('getaddrinfo ENOTFOUND');
  };
  const loaded = await loadPluginIndex({ fetchImpl: failingFetch, env: {} });
  assert.equal(loaded.source, 'snapshot');
  assert.equal(loaded.index.plugins.length, 50);
  assert.equal(loaded.warnings.length, 1);
  assert.match(loaded.warnings[0], /远程索引加载失败/);
});

test('HTTP 错误同样回退快照', async () => {
  const fakeFetch = async () => new Response('oops', { status: 503, statusText: 'Service Unavailable' });
  const loaded = await loadPluginIndex({ fetchImpl: fakeFetch, env: {} });
  assert.equal(loaded.source, 'snapshot');
  assert.match(loaded.warnings[0], /HTTP 503/);
});

test('DSH_PLUGIN_INDEX_OFFLINE=1 直接使用快照', async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return new Response(JSON.stringify(minimalIndex), { status: 200 });
  };
  const loaded = await loadPluginIndex({
    fetchImpl: fakeFetch,
    env: { DSH_PLUGIN_INDEX_OFFLINE: '1' },
  });
  assert.equal(called, false);
  assert.equal(loaded.source, 'snapshot');
  assert.equal(loaded.index.plugins.length, 50);
});

test('本地文件路径可作为索引来源', async () => {
  const snapshotUrl = new URL('../data/plugin-market.json', import.meta.url);
  const loaded = await loadPluginIndex({ url: snapshotUrl.href, env: {} });
  assert.equal(loaded.source, 'local');
  assert.equal(loaded.index.plugins.length, 50);
});

test('validateIndex 拒绝坏结构', () => {
  assert.throws(() => validateIndex(null), /不是 JSON 对象/);
  assert.throws(() => validateIndex({}), /plugins/);
  assert.throws(() => validateIndex({ plugins: [] }), /非空/);
  assert.throws(() => validateIndex({ plugins: [{ name: '' }] }), /合法 name/);
  const valid = validateIndex({ ...minimalIndex, plugins: [...minimalIndex.plugins, { name: '' }] });
  assert.equal(valid.plugins.length, 1);
});
