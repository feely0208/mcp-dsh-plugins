import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';
import { ROOT } from './helpers.mjs';

test('package.json 满足包发布要求', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', ROOT), 'utf8'));
  assert.equal(pkg.name, '@deepwhale-cn/mcp-dsh-plugins');
  assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.bin['mcp-dsh-plugins'], 'cli.mjs');
  assert.equal(pkg.bin['mcp-dsh-plugins'].startsWith('./'), false);
  assert.match(pkg.engines.node, />=20/);
  assert.ok(pkg.dependencies['@modelcontextprotocol/sdk']);
  assert.ok(pkg.files.includes('data/'), 'files 必须包含 data/ 快照');
  assert.ok(pkg.files.includes('cli.mjs'));
});

test('cli.mjs 可执行且以 shebang 开头', async () => {
  const cliPath = new URL('cli.mjs', ROOT);
  const content = await readFile(cliPath, 'utf8');
  assert.equal(content.startsWith('#!/usr/bin/env node'), true);
  const info = await stat(cliPath);
  assert.ok((info.mode & 0o111) !== 0, 'cli.mjs 需要可执行权限');
});

test('LICENSE 与 README.zh.md 存在且内容完整', async () => {
  const license = await readFile(new URL('LICENSE', ROOT), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /温州深鲸智能科技有限公司/);

  const readme = await readFile(new URL('README.zh.md', ROOT), 'utf8');
  assert.match(readme, /npx -y @deepwhale-cn\/mcp-dsh-plugins/);
  for (const tool of ['search_plugins', 'get_plugin', 'list_categories', 'check_runtime']) {
    assert.match(readme, new RegExp(tool));
  }
  assert.match(readme, /Claude/);
  assert.match(readme, /Cursor/);
});
