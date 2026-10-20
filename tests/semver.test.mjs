import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareVersions,
  isValidVersion,
  maxVersion,
  parseRange,
  parseVersion,
  satisfies,
} from '../src/semver.mjs';

test('parseVersion 解析正式版与预发布版', () => {
  assert.deepEqual(
    { ...parseVersion('v1.2.3-rc.4+build.5'), raw: undefined },
    { major: 1, minor: 2, patch: 3, prerelease: ['rc', 4], raw: undefined },
  );
  assert.equal(isValidVersion('0.2.1-rc.2'), true);
  assert.equal(isValidVersion('0.2'), false);
  assert.equal(parseVersion('not-a-version'), null);
});

test('compareVersions 按 SemVer 顺序比较', () => {
  assert.equal(compareVersions('0.1.0', '0.2.0'), -1);
  assert.equal(compareVersions('0.2.0', '0.2.0'), 0);
  assert.equal(compareVersions('0.2.1-rc.2', '0.1.0-rc.6'), 1);
  assert.equal(compareVersions('0.2.1-rc.2', '0.2.1'), -1);
  assert.equal(compareVersions('0.3.0-rc.1', '0.3.0'), -1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  assert.equal(compareVersions('1.0.0-alpha.beta', '1.0.0-beta'), -1);
  assert.equal(compareVersions('1.0.0-rc.10', '1.0.0-rc.9'), 1);
});

test('engines 场景：预发布版本按顺序比较而非被排除', () => {
  const range = '>=0.1.0-rc.6 <0.3.0';
  assert.equal(satisfies('0.2.1-rc.2', range), true);
  assert.equal(satisfies('0.1.0-rc.6', range), true);
  assert.equal(satisfies('0.1.0-rc.5', range), false);
  assert.equal(satisfies('0.2.1', range), true);
  assert.equal(satisfies('0.3.0-rc.1', range), true);
  assert.equal(satisfies('0.3.0', range), false);
  assert.equal(satisfies('1.0.0', range), false);
});

test('caret / tilde / 通配符 / || / 连字符范围', () => {
  assert.equal(satisfies('0.2.5', '^0.2.3'), true);
  assert.equal(satisfies('0.3.0', '^0.2.3'), false);
  assert.equal(satisfies('0.0.3', '^0.0.3'), true);
  assert.equal(satisfies('0.0.4', '^0.0.3'), false);
  assert.equal(satisfies('1.9.0', '^1.2.3'), true);
  assert.equal(satisfies('2.0.0', '^1.2.3'), false);
  assert.equal(satisfies('0.1.9', '~0.1.2'), true);
  assert.equal(satisfies('0.2.0', '~0.1.2'), false);
  assert.equal(satisfies('1.2.9', '~1.2.3'), true);
  assert.equal(satisfies('1.3.0', '~1.2.3'), false);
  assert.equal(satisfies('0.1.5', '0.1.x'), true);
  assert.equal(satisfies('0.2.0', '0.1.x'), false);
  assert.equal(satisfies('0.2.1-rc.2', '>=0.1.0-rc.6 <0.3.0 || 1.x'), true);
  assert.equal(satisfies('1.5.0', '>=2.0.0 || 1.x'), true);
  assert.equal(satisfies('0.1.5', '0.1.0 - 0.2.0'), true);
  assert.equal(satisfies('0.2.1', '0.1.0 - 0.2.0'), false);
  assert.equal(satisfies('0.9.0', '*'), true);
});

test('parseRange 对非法范围抛错，satisfies 对非法版本返回 false', () => {
  assert.throws(() => parseRange('>=banana'), /无法解析/);
  assert.equal(satisfies('banana', '>=0.1.0'), false);
});

test('maxVersion 优先正式版', () => {
  assert.equal(maxVersion(['0.1.0', '0.2.0-rc.1', '0.2.0']), '0.2.0');
  assert.equal(maxVersion(['0.1.0-rc.1', '0.1.0-rc.2']), '0.1.0-rc.2');
  assert.equal(maxVersion([]), null);
});
