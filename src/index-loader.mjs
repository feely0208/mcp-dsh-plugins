/**
 * 插件市场索引加载器。
 *
 * 优先级：
 *   1. 环境变量 DSH_PLUGIN_INDEX_URL 指定地址（http/https 或本地文件路径）
 *   2. 默认线上地址 https://www.deepwhale.org.cn/plugin-market.json
 *   3. 随包快照 data/plugin-market.json（断网 / 请求失败时兜底）
 *
 * 设置 DSH_PLUGIN_INDEX_OFFLINE=1 可跳过远程请求，直接用快照。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const DEFAULT_INDEX_URL = 'https://www.deepwhale.org.cn/plugin-market.json';
export const SNAPSHOT_URL = new URL('../data/plugin-market.json', import.meta.url);
export const DEFAULT_TIMEOUT_MS = 5000;

/**
 * 校验索引结构，返回只保留合法插件条目的副本。
 * @param {unknown} index
 */
export function validateIndex(index) {
  if (!index || typeof index !== 'object') {
    throw new Error('索引内容不是 JSON 对象');
  }
  const record = /** @type {Record<string, unknown>} */ (index);
  if (!Array.isArray(record.plugins) || record.plugins.length === 0) {
    throw new Error('索引缺少非空的 plugins 数组');
  }
  const plugins = record.plugins.filter(
    (plugin) =>
      plugin &&
      typeof plugin === 'object' &&
      typeof (/** @type {Record<string, unknown>} */ (plugin).name) === 'string' &&
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (plugin).name).trim(),
  );
  if (plugins.length === 0) {
    throw new Error('索引中没有包含合法 name 的插件');
  }
  return { ...record, plugins };
}

/** @param {string|undefined} value @param {number} fallback */
function durationFromEnv(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

/**
 * 从 http(s) 或本地文件路径读取索引。
 * @param {string} url
 * @param {{fetchImpl: typeof fetch, timeoutMs: number, packageVersion?: string}} options
 */
async function readIndexSource(url, { fetchImpl, timeoutMs, packageVersion = '0.1.0' }) {
  if (!isHttpUrl(url)) {
    const path = url.startsWith('file:') ? fileURLToPath(url) : url;
    const raw = await readFile(path, 'utf8');
    return { kind: 'local', index: JSON.parse(raw), resolved: path };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': `@deepwhale-cn/mcp-dsh-plugins/${packageVersion}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText ?? ''}`.trim());
    }
    return { kind: 'remote', index: await response.json(), resolved: url };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`请求超时（${timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 加载插件市场索引。
 * @param {{
 *   url?: string,
 *   env?: Record<string, string|undefined>,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   offline?: boolean,
 *   snapshotPath?: string|URL,
 *   packageVersion?: string,
 * }} [options]
 * @returns {Promise<{index:object, source:'remote'|'local'|'snapshot', requestedUrl:string, resolved:string, loadedAt:string, warnings:string[]}>}
 */
export async function loadPluginIndex(options = {}) {
  const env = options.env ?? process.env;
  const requestedUrl =
    options.url ?? (typeof env.DSH_PLUGIN_INDEX_URL === 'string' && env.DSH_PLUGIN_INDEX_URL.trim()
      ? env.DSH_PLUGIN_INDEX_URL.trim()
      : DEFAULT_INDEX_URL);
  const offline =
    options.offline ??
    /^(1|true|yes|on)$/i.test(String(env.DSH_PLUGIN_INDEX_OFFLINE ?? '').trim());
  const timeoutMs =
    options.timeoutMs ?? durationFromEnv(env.DSH_PLUGIN_INDEX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const snapshotPath = options.snapshotPath ?? SNAPSHOT_URL;
  const warnings = [];

  if (!offline) {
    try {
      const result = await readIndexSource(requestedUrl, {
        fetchImpl,
        timeoutMs,
        packageVersion: options.packageVersion,
      });
      return {
        index: validateIndex(result.index),
        source: result.kind,
        requestedUrl,
        resolved: result.resolved,
        loadedAt: new Date().toISOString(),
        warnings,
      };
    } catch (error) {
      warnings.push(`远程索引加载失败（${requestedUrl}）：${error.message}`);
    }
  } else {
    warnings.push('已设置 DSH_PLUGIN_INDEX_OFFLINE，跳过远程索引。');
  }

  try {
    const snapshotUrl = typeof snapshotPath === 'string' ? snapshotPath : fileURLToPath(snapshotPath);
    const raw = await readFile(snapshotUrl, 'utf8');
    return {
      index: validateIndex(JSON.parse(raw)),
      source: 'snapshot',
      requestedUrl,
      resolved: snapshotUrl,
      loadedAt: new Date().toISOString(),
      warnings,
    };
  } catch (error) {
    const failure = new Error(
      `无法加载插件市场索引：远程索引与本地快照均失败。远程：${requestedUrl}；快照：${
        typeof snapshotPath === 'string' ? snapshotPath : fileURLToPath(snapshotPath)
      }（${error.message}）`,
    );
    failure.warnings = warnings;
    throw failure;
  }
}
