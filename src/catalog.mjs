/**
 * 插件目录：把市场索引规范化，并提供 search_plugins / get_plugin /
 * list_categories / check_runtime 四个工具所需的纯函数实现。
 */
import { compareVersions, maxVersion, parseVersion, satisfies } from './semver.mjs';
import { CATEGORIES, classifyPlugin, resolveCategory } from './categories.mjs';

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

/** @param {unknown} value */
function localized(value) {
  if (typeof value === 'string') return { zh: value, en: value };
  if (value && typeof value === 'object') {
    const record = /** @type {Record<string, unknown>} */ (value);
    const zh = typeof record.zh === 'string' ? record.zh : '';
    const en = typeof record.en === 'string' ? record.en : '';
    if (zh || en) return { zh: zh || en, en: en || zh };
    const first = Object.values(record).find((item) => typeof item === 'string');
    if (typeof first === 'string') return { zh: first, en: first };
  }
  return { zh: '', en: '' };
}

/** @param {unknown} value */
function plainText(value) {
  if (typeof value === 'string') return value;
  const { zh, en } = localized(value);
  return zh || en || '';
}

/** @param {string} name */
export function installCommand(name) {
  return `dsh plugin add ${name}`;
}

/** @param {unknown} value */
function normalizeVersionEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  if (typeof record.version !== 'string' || !parseVersion(record.version)) return null;
  const engines =
    record.engines && typeof record.engines === 'object'
      ? Object.fromEntries(
          Object.entries(/** @type {Record<string, unknown>} */ (record.engines)).filter(
            ([, value]) => typeof value === 'string',
          ),
        )
      : {};
  return {
    version: record.version,
    publishTimestamp: typeof record.publishTimestamp === 'number' ? record.publishTimestamp : null,
    source: record.source && typeof record.source === 'object' ? record.source : null,
    engines,
  };
}

/**
 * 规范化单个插件条目；缺少合法 name 时返回 null。
 * @param {unknown} raw
 */
export function normalizePlugin(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) return null;
  const versions = (Array.isArray(record.versions) ? record.versions : [])
    .map(normalizeVersionEntry)
    .filter((entry) => entry !== null)
    .sort((a, b) => compareVersions(b.version, a.version));
  const latestVersionString = maxVersion(versions.map((entry) => entry.version));
  const latest = versions.find((entry) => entry.version === latestVersionString) ?? versions[0] ?? null;
  const category = classifyPlugin({ name, description: plainText(record.description) });
  const title = localized(record.title);
  return {
    name,
    shortName: name.replace(/^@[^/]+\//, ''),
    title: { zh: title.zh || name.replace(/^@[^/]+\//, ''), en: title.en || title.zh || name },
    description: localized(record.description),
    author: plainText(record.author) || '温州深鲸智能科技有限公司',
    homepage: typeof record.homepage === 'string' ? record.homepage : '',
    icon: typeof record.icon === 'string' ? record.icon : null,
    versions,
    latestVersion: latest,
    engines: latest?.engines ?? {},
    category: { id: category.id, title: category.title },
  };
}

/**
 * 由索引构建目录对象（含分类索引）。
 * @param {object} index
 * @param {object} [source]
 */
export function buildCatalog(index, source = null) {
  const plugins = (Array.isArray(index?.plugins) ? index.plugins : [])
    .map(normalizePlugin)
    .filter((plugin) => plugin !== null);
  const byName = new Map(plugins.map((plugin) => [plugin.name, plugin]));
  const categories = CATEGORIES.map((category) => {
    const members = plugins.filter((plugin) => plugin.category.id === category.id);
    return {
      id: category.id,
      title: category.title,
      description: category.description,
      count: members.length,
      plugins: members.map((plugin) => plugin.name).sort(),
    };
  });
  return {
    title: localized(index?.title),
    description: localized(index?.description),
    metadata: index?.metadata && typeof index.metadata === 'object' ? index.metadata : {},
    plugins,
    byName,
    categories,
    source,
  };
}

/**
 * @param {string} value
 * @param {number} fallback
 */
function clampLimit(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(number)));
}

function searchHaystack(plugin) {
  return [
    plugin.name,
    plugin.shortName,
    plugin.title.zh,
    plugin.title.en,
    plugin.description.zh,
    plugin.description.en,
  ]
    .join('\n')
    .toLowerCase();
}

function relevance(plugin, query) {
  if (!query) return 0;
  const full = query.toLowerCase();
  const tokens = full.split(/\s+/).filter(Boolean);
  const name = `${plugin.name}\n${plugin.shortName}`.toLowerCase();
  const title = `${plugin.title.zh}\n${plugin.title.en}`.toLowerCase();
  const description = `${plugin.description.zh}\n${plugin.description.en}`.toLowerCase();
  let score = 0;
  if (plugin.name.toLowerCase() === full || plugin.shortName.toLowerCase() === full) score += 100;
  if (name.includes(full)) score += 40;
  if (title.includes(full)) score += 25;
  if (description.includes(full)) score += 12;
  for (const token of tokens) {
    if (name.includes(token)) score += 8;
    else if (title.includes(token)) score += 5;
    else if (description.includes(token)) score += 2;
  }
  return score;
}

/** @param {ReturnType<typeof normalizePlugin>} plugin */
export function pluginSummary(plugin) {
  return {
    name: plugin.name,
    title: plugin.title,
    description: plugin.description,
    category: { id: plugin.category.id, title: plugin.category.title },
    latestVersion: plugin.latestVersion?.version ?? null,
    dshRange: plugin.engines?.dsh ?? null,
    homepage: plugin.homepage,
    installCommand: installCommand(plugin.name),
  };
}

/**
 * search_plugins 的实现。
 * @param {ReturnType<typeof buildCatalog>} catalog
 * @param {{query?:string, category?:string, limit?:number}} options
 */
export function searchPlugins(catalog, options = {}) {
  const query = typeof options.query === 'string' ? options.query.trim() : '';
  const limit = clampLimit(options.limit, DEFAULT_LIMIT);
  let pool = catalog.plugins;
  let category = null;
  if (typeof options.category === 'string' && options.category.trim()) {
    category = resolveCategory(options.category);
    if (!category) {
      throw new Error(
        `未知分类：${options.category}。可用分类：${CATEGORIES.filter((item) => item.id !== 'other')
          .map((item) => `${item.id}(${item.title.zh})`)
          .join('、')}`,
      );
    }
    pool = pool.filter((plugin) => plugin.category.id === category.id);
  }
  let matched = pool;
  if (query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    matched = pool.filter((plugin) => {
      const haystack = searchHaystack(plugin);
      return tokens.every((token) => haystack.includes(token));
    });
  }
  const ranked = matched
    .map((plugin) => ({ plugin, score: relevance(plugin, query) }))
    .sort((a, b) => b.score - a.score || a.plugin.name.localeCompare(b.plugin.name))
    .slice(0, limit)
    .map((entry) => pluginSummary(entry.plugin));
  return {
    query: query || null,
    category: category ? { id: category.id, title: category.title } : null,
    count: ranked.length,
    total: pool.length,
    results: ranked,
  };
}

/**
 * get_plugin 的实现；找不到返回 null。
 * @param {ReturnType<typeof buildCatalog>} catalog
 * @param {string} name
 */
export function getPlugin(catalog, name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  const input = name.trim();
  const lower = input.toLowerCase();
  const candidates = [input, `@deepwhale-cn/${input}`, `dsh-${input}`];
  for (const candidate of candidates) {
    const direct = catalog.byName.get(candidate);
    if (direct) return direct;
  }
  for (const plugin of catalog.plugins) {
    if (
      plugin.name.toLowerCase() === lower ||
      plugin.shortName.toLowerCase() === lower ||
      plugin.shortName.toLowerCase() === `dsh-${lower}`
    ) {
      return plugin;
    }
  }
  return null;
}

/**
 * 找不到插件时的相似项建议。
 * @param {ReturnType<typeof buildCatalog>} catalog
 * @param {string} name
 * @param {number} [limit]
 */
export function suggestPlugins(catalog, name, limit = 5) {
  const input = String(name ?? '').toLowerCase().replace(/^@[^/]+\//, '');
  if (!input) return [];
  const tokens = input.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
  return catalog.plugins
    .map((plugin) => {
      const haystack = `${plugin.shortName} ${plugin.title.zh} ${plugin.description.zh}`.toLowerCase();
      const score = tokens.filter((token) => haystack.includes(token)).length;
      return { plugin, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.plugin.name.localeCompare(b.plugin.name))
    .slice(0, limit)
    .map((entry) => pluginSummary(entry.plugin));
}

/**
 * get_plugin 的完整响应。
 * @param {ReturnType<typeof normalizePlugin>} plugin
 */
export function pluginDetail(plugin) {
  return {
    ...pluginSummary(plugin),
    author: plugin.author,
    engines: plugin.engines,
    versions: plugin.versions.map((entry) => ({
      version: entry.version,
      publishTimestamp: entry.publishTimestamp,
      source: entry.source,
      engines: entry.engines,
    })),
  };
}

/**
 * list_categories 的实现。
 * @param {ReturnType<typeof buildCatalog>} catalog
 */
export function listCategories(catalog) {
  const categories = catalog.categories.filter((category) => category.count > 0);
  return {
    count: categories.length,
    categories,
  };
}

/**
 * check_runtime 的实现：判断给定 DSH 版本能装哪些插件。
 * @param {ReturnType<typeof buildCatalog>} catalog
 * @param {string} dshVersion
 */
export function checkRuntime(catalog, dshVersion) {
  if (typeof dshVersion !== 'string' || !parseVersion(dshVersion)) {
    throw new Error(`无效的 DSH 版本号：${dshVersion ?? ''}。示例：0.2.1-rc.2`);
  }
  const compatible = [];
  const incompatible = [];
  const unknown = [];
  for (const plugin of catalog.plugins) {
    const latest = plugin.latestVersion;
    const base = {
      name: plugin.name,
      title: plugin.title,
      version: latest?.version ?? null,
      dshRange: latest?.engines?.dsh ?? null,
      installCommand: installCommand(plugin.name),
    };
    if (!latest) {
      unknown.push({ ...base, reason: '没有可安装的版本' });
      continue;
    }
    const range = latest.engines?.dsh;
    if (!range) {
      unknown.push({ ...base, reason: '插件未声明 engines.dsh，无法判断' });
      continue;
    }
    try {
      if (satisfies(dshVersion, range)) compatible.push(base);
      else incompatible.push({ ...base, reason: `需要 DSH ${range}` });
    } catch (error) {
      unknown.push({ ...base, reason: `版本范围无法解析：${error.message}` });
    }
  }
  return {
    dshVersion,
    total: catalog.plugins.length,
    compatibleCount: compatible.length,
    incompatibleCount: incompatible.length,
    unknownCount: unknown.length,
    compatible,
    incompatible,
    unknown,
  };
}

export { CATEGORIES };
