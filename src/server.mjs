/**
 * MCP stdio 服务器：把深鲸 DSH 插件市场暴露给任意 MCP 客户端。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  buildCatalog,
  checkRuntime,
  getPlugin,
  installCommand,
  listCategories,
  pluginDetail,
  searchPlugins,
  suggestPlugins,
} from './catalog.mjs';
import { loadPluginIndex } from './index-loader.mjs';

export const SERVER_NAME = 'mcp-dsh-plugins';
export const SERVER_VERSION = '0.1.0';

/** @param {unknown} data */
function ok(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/** @param {string} message @param {unknown} [details] */
function fail(message, details) {
  const text = details === undefined ? message : JSON.stringify({ error: message, ...details }, null, 2);
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

/**
 * 工具响应里附带的数据来源信息，便于调用方判断是否用的是本地快照。
 * @param {ReturnType<typeof buildCatalog>} catalog
 */
function sourcePayload(catalog) {
  const source = catalog.source;
  if (!source) return undefined;
  return {
    kind: source.kind ?? source.source,
    url: source.requestedUrl ?? source.url ?? null,
    loadedAt: source.loadedAt ?? null,
    warnings: source.warnings && source.warnings.length > 0 ? source.warnings : undefined,
  };
}

/**
 * 创建 MCP server 实例（不连接传输层，便于测试注入口 memory transport）。
 * @param {{catalog: ReturnType<typeof buildCatalog>}} options
 */
export function createPluginServer({ catalog }) {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        '深鲸 DSH 插件市场。用 search_plugins 按关键词 / 分类检索插件，用 get_plugin 查看详情与安装命令（dsh plugin add <name>），用 list_categories 查看分类，用 check_runtime 判断当前 DSH 版本兼容哪些插件。数据来自 deepwhale.org.cn/plugin-market.json，离线时回退到随包快照。',
    },
  );

  server.registerTool(
    'search_plugins',
    {
      title: '搜索 DSH 插件',
      description:
        '按关键词模糊搜索深鲸 DSH 插件市场（匹配包名、中英文标题、描述），可按分类过滤。不传 query 时按分类/默认顺序列出插件。返回插件名、简介、最新版本、DSH 兼容范围与安装命令。',
      inputSchema: {
        query: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('搜索关键词，例如 "sbom"、"隐私"、"供应链"'),
        category: z
          .string()
          .optional()
          .describe('分类 id 或中文名，例如 compliance / 合规、data / 数据、supply-chain / 供应链'),
        limit: z.coerce.number().int().min(1).max(50).default(10).describe('最多返回条数（1-50，默认 10）'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, category, limit }) => {
      const result = searchPlugins(catalog, { query, category, limit });
      return ok({ ...result, dataSource: sourcePayload(catalog) });
    },
  );

  server.registerTool(
    'get_plugin',
    {
      title: '查看插件详情',
      description:
        '按包名获取单个深鲸 DSH 插件的详情：中英文标题与描述、作者、主页、全部版本、最新版本、DSH 兼容范围，以及安装命令（dsh plugin add <name>）。包名可省略 @deepwhale-cn/ 前缀，例如 dsh-sbom。',
      inputSchema: {
        name: z.string().trim().min(1).describe('插件包名，例如 @deepwhale-cn/dsh-sbom 或 dsh-sbom'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ name }) => {
      const plugin = getPlugin(catalog, name);
      if (!plugin) {
        return fail(`未找到插件：${name}`, { suggestions: suggestPlugins(catalog, name) });
      }
      return ok({ plugin: pluginDetail(plugin), dataSource: sourcePayload(catalog) });
    },
  );

  server.registerTool(
    'list_categories',
    {
      title: '列出插件分类',
      description:
        '列出深鲸 DSH 插件市场的分类（合规 / 治理 / 数据 / 供应链 / 能力 / 行业）及每个分类下的插件包名与数量，可用于后续按分类检索。',
      inputSchema: {
        include_plugins: z
          .boolean()
          .default(true)
          .describe('是否在响应中包含每个分类下的插件包名列表（默认 true）'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ include_plugins }) => {
      const result = listCategories(catalog);
      const categories = include_plugins
        ? result.categories
        : result.categories.map(({ plugins, ...category }) => category);
      return ok({ ...result, categories, dataSource: sourcePayload(catalog) });
    },
  );

  server.registerTool(
    'check_runtime',
    {
      title: '检查 DSH 运行时兼容性',
      description:
        '传入当前 DSH 版本号（支持预发布版本，例如 0.2.1-rc.2），按每个插件最新版本的 engines.dsh 范围判断兼容性，返回兼容 / 不兼容 / 无法判断的插件列表及安装命令。',
      inputSchema: {
        dsh_version: z.string().trim().min(1).describe('当前 DSH 版本号，例如 0.2.1-rc.2 或 0.1.0'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ dsh_version }) => {
      try {
        return ok({ ...checkRuntime(catalog, dsh_version), dataSource: sourcePayload(catalog) });
      } catch (error) {
        return fail(error.message);
      }
    },
  );

  return server;
}

/**
 * 加载索引并启动 stdio MCP 服务器。
 * @param {Parameters<typeof loadPluginIndex>[0]} [loaderOptions]
 */
export async function runStdioServer(loaderOptions = {}) {
  const loaded = await loadPluginIndex({
    packageVersion: SERVER_VERSION,
    ...loaderOptions,
  });
  const catalog = buildCatalog(loaded.index, {
    kind: loaded.source,
    requestedUrl: loaded.requestedUrl,
    resolved: loaded.resolved,
    loadedAt: loaded.loadedAt,
    warnings: loaded.warnings,
  });
  const server = createPluginServer({ catalog });
  for (const warning of loaded.warnings) {
    console.error(`[${SERVER_NAME}] 警告：${warning}`);
  }
  console.error(
    `[${SERVER_NAME}] 已加载 ${catalog.plugins.length} 个插件（来源：${loaded.source}）。等待 MCP 客户端连接…`,
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const shutdown = async () => {
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { server, catalog, loaded };
}

export { installCommand };
