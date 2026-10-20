import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildCatalog } from '../src/catalog.mjs';
import { loadPluginIndex } from '../src/index-loader.mjs';
import { createPluginServer } from '../src/server.mjs';

export const ROOT = new URL('..', import.meta.url);

let snapshotCatalogPromise;

/** 用随包快照构建目录（不依赖网络）。 */
export async function getSnapshotCatalog() {
  if (!snapshotCatalogPromise) {
    snapshotCatalogPromise = (async () => {
      const loaded = await loadPluginIndex({ offline: true });
      return buildCatalog(loaded.index, {
        kind: loaded.source,
        requestedUrl: loaded.requestedUrl,
        loadedAt: loaded.loadedAt,
        warnings: loaded.warnings,
      });
    })();
  }
  return snapshotCatalogPromise;
}

/** 在 in-memory transport 上连接一个 client/server 对。 */
export async function connectInMemory(catalog) {
  const server = createPluginServer({ catalog });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'dsh-plugins-test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

/** 解析工具返回的 JSON 文本。 */
export function toolJson(result) {
  return JSON.parse(result.content[0].text);
}
