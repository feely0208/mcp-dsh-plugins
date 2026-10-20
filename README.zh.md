# @deepwhale-cn/mcp-dsh-plugins

深鲸 DSH 插件市场的 **MCP（Model Context Protocol）服务器**。通过 stdio 把 [deepwhale.org.cn 插件市场](https://deepwhale.org.cn/plugins.html) 的 50 个插件暴露给 Claude Desktop、Cursor、Cline 等任意 MCP 客户端，用于插件发现、检索与运行时兼容性检查。

- 包名：`@deepwhale-cn/mcp-dsh-plugins`（version 0.1.0）
- 传输方式：MCP stdio
- 运行时：Node.js >= 20（无网络也能跑，内置市场快照）

## 功能

| 工具 | 说明 |
| --- | --- |
| `search_plugins` | 按关键词模糊搜索（包名 / 中英文标题 / 描述），可按分类过滤、限制返回条数 |
| `get_plugin` | 按包名查看详情：全部版本、最新版本、DSH 兼容范围、homepage、安装命令 |
| `list_categories` | 列出插件分类（合规 / 治理 / 数据 / 供应链 / 能力 / 行业）及分类下的插件 |
| `check_runtime` | 传入当前 DSH 版本，按 `engines.dsh` 判断哪些插件兼容，返回兼容 / 不兼容列表与安装命令 |

## 快速开始

无需安装，直接用 `npx` 启动（stdio 服务器，通常由 MCP 客户端托管）：

```bash
npx -y @deepwhale-cn/mcp-dsh-plugins
```

也可以全局安装：

```bash
npm install -g @deepwhale-cn/mcp-dsh-plugins
mcp-dsh-plugins
```

### Claude Desktop 配置

编辑 `claude_desktop_config.json`（macOS 位于 `~/Library/Application Support/Claude/`）：

```json
{
  "mcpServers": {
    "dsh-plugins": {
      "command": "npx",
      "args": ["-y", "@deepwhale-cn/mcp-dsh-plugins"]
    }
  }
}
```

### Cursor 配置

在项目根目录创建 `.cursor/mcp.json`（或编辑全局 `~/.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "dsh-plugins": {
      "command": "npx",
      "args": ["-y", "@deepwhale-cn/mcp-dsh-plugins"]
    }
  }
}
```

其他支持 MCP 的客户端同理：把命令设为 `npx`、参数设为 `["-y", "@deepwhale-cn/mcp-dsh-plugins"]` 即可。

## 工具说明与示例

### search_plugins

```json
{ "query": "sbom", "limit": 5 }
```

```json
{ "category": "合规", "limit": 10 }
```

参数：

- `query`（可选）：搜索关键词，支持中文/英文，空格分隔多个词时按 AND 匹配。
- `category`（可选）：分类 id 或中文名，如 `compliance` / `合规`、`data` / `数据`、`supply-chain` / `供应链`。
- `limit`（可选）：1–50，默认 10。

返回结果包含 `name`、`title`（中英文）、`description`、`category`、`latestVersion`、`dshRange`、`homepage`、`installCommand`，以及 `dataSource`（当前数据来自线上还是随包快照）。

### get_plugin

```json
{ "name": "dsh-sbom" }
```

包名可省略 `@deepwhale-cn/` 前缀。返回插件详情、全部版本、最新版本、`engines.dsh`、`homepage` 和安装命令：

```json
{
  "plugin": {
    "name": "@deepwhale-cn/dsh-sbom",
    "latestVersion": "0.1.0",
    "installCommand": "dsh plugin add @deepwhale-cn/dsh-sbom",
    "homepage": "https://deepwhale.org.cn/plugins.html"
  }
}
```

找不到插件时返回 `isError: true`，并附带相似插件建议。

### list_categories

```json
{}
```

```json
{ "include_plugins": false }
```

返回分类列表及每个分类的插件数量；`include_plugins` 为空时只返回分类元信息。

### check_runtime

```json
{ "dsh_version": "0.2.1-rc.2" }
```

返回 `compatible` / `incompatible` / `unknown` 三组插件，以及 `compatibleCount` 等计数。版本范围按 SemVer 2.0.0 顺序比较，**包含预发布版本**：例如 `0.2.1-rc.2` 满足 `>=0.1.0-rc.6 <0.3.0`，`0.1.0-rc.5` 不满足，`0.3.0` 不满足。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DSH_PLUGIN_INDEX_URL` | `https://www.deepwhale.org.cn/plugin-market.json` | 覆盖市场索引地址；支持 http(s) URL 或本地 JSON 文件路径 |
| `DSH_PLUGIN_INDEX_OFFLINE` | 未设置 | 设为 `1` / `true` 时跳过远程请求，直接使用随包快照 |
| `DSH_PLUGIN_INDEX_TIMEOUT_MS` | `5000` | 远程索引请求超时（毫秒） |

### 数据来源与离线回退

启动时先请求线上索引；请求失败、超时或数据不合法时自动回退到随包快照 `data/plugin-market.json`，因此断网环境也能完整使用。工具返回中的 `dataSource.kind` 会标明本次数据来自 `remote`、`local` 还是 `snapshot`。

## 本地开发

```bash
npm install
npm test           # node:test，全部测试（含真实 stdio 握手）
npm start          # 直接启动 stdio 服务器（等待 MCP 客户端连接）
```

目录结构：

```
cli.mjs                 # bin 入口（stdio）
src/server.mjs          # MCP server 与 4 个工具
src/catalog.mjs         # 插件目录：搜索 / 详情 / 分类 / 运行时检查
src/categories.mjs      # 分类规则
src/index-loader.mjs    # 索引加载：远程 → 本地 → 快照
src/semver.mjs          # 轻量 SemVer 范围判断（含预发布）
data/plugin-market.json # 随包市场快照（50 个插件）
tests/                  # node:test 测试
```

## License

MIT © 温州深鲸智能科技有限公司
