/**
 * 插件分类：按包名前缀优先归纳，未知包名再按描述关键词兜底。
 * 分类顺序即 list_categories 的展示顺序。
 */

const OTHER = {
  id: 'other',
  title: { zh: '其他', en: 'Other' },
  description: {
    zh: '暂未归入现有分类的插件。',
    en: 'Plugins that do not match any current category.',
  },
  match: () => false,
};

/** @typedef {{id:string,title:{zh:string,en:string},description:{zh:string,en:string},match:(name:string,description:string)=>boolean}} Category */

/** @type {Category[]} */
export const CATEGORIES = [
  {
    id: 'compliance',
    title: { zh: '合规', en: 'Compliance' },
    description: {
      zh: '中国大陆法规与标准对照：备案、个保、等保、算法、内容与行业监管。',
      en: 'Mainland China regulatory checks: filing, PIPL, MLPS, algorithms, content and industry rules.',
    },
    match: (name) =>
      /^@deepwhale-cn\/dsh-(cn-|compliance-doc|pipia|minor-guard|consent-guard|algorithm-filing|local-regulation)/.test(
        name,
      ),
  },
  {
    id: 'governance',
    title: { zh: '治理', en: 'Governance' },
    description: {
      zh: 'Agent 行为、权限、密钥与事件响应的治理与自检。',
      en: 'Governance and self-checks for agent behavior, privileges, secrets and incident response.',
    },
    match: (name) =>
      /^@deepwhale-cn\/dsh-(agent-policy|agent-scope|ai-output-trust|alert-relay|content-trust|env-audit|fix-verify|guard-core|guard-suite|incident-package|key-rotate|least-privilege|phishing-guard|remediation)$/.test(
        name,
      ),
  },
  {
    id: 'data',
    title: { zh: '数据', en: 'Data' },
    description: {
      zh: '数据分级、生命周期、数据主体权利、日志留存与敏感数据/密钥扫描。',
      en: 'Data classification, lifecycle, data-subject rights, log retention and sensitive-data scanning.',
    },
    match: (name) =>
      /^@deepwhale-cn\/dsh-(data-[a-z-]+|cn-data-export|cn-log-retention|secret-scan)$/.test(name),
  },
  {
    id: 'supply-chain',
    title: { zh: '供应链', en: 'Supply Chain' },
    description: {
      zh: '依赖、构建、许可证、SBOM 与第三方插件/MCP 的供应链风险。',
      en: 'Dependency, build, license, SBOM and third-party plugin/MCP supply-chain risks.',
    },
    match: (name) =>
      /^@deepwhale-cn\/dsh-(sbom|dep-audit|ci-guard|license-guard|mcp-audit|release-selfcheck|tool-vet)$/.test(
        name,
      ),
  },
  {
    id: 'capability',
    title: { zh: '能力', en: 'Capabilities' },
    description: {
      zh: '面向产出的能力插件：文档、画布、设计工序、徽章与会话产物整理。',
      en: 'Productivity plugins: documents, canvas, design pipeline, badges and session artifacts.',
    },
    match: (name) =>
      /^@deepwhale-cn\/dsh-(badge|bundle-cn-skills|cn-doc-formatter|design-line|session-artifacts|shell-canvas)$/.test(
        name,
      ),
  },
  {
    id: 'industry',
    title: { zh: '行业', en: 'Industry' },
    description: {
      zh: '教育、金融、医疗等行业的专属合规补充项。',
      en: 'Industry-specific compliance add-ons for education, finance and healthcare.',
    },
    match: (name) => /^@deepwhale-cn\/dsh-industry-/.test(name),
  },
  OTHER,
];

/** @param {string} text */
function descriptionFallback(text) {
  const value = String(text ?? '');
  if (/合规|备案|个保|等保|隐私|国密|法规|监管|未成年人|同意/.test(value)) return 'compliance';
  if (/数据|日志|密钥|凭据|脱敏/.test(value)) return 'data';
  if (/依赖|供应链|SBOM|构建|许可|发布|插件审计/.test(value)) return 'supply-chain';
  if (/画布|排版|设计|文档|徽章|素材|视频/.test(value)) return 'capability';
  if (/治理|审计|权限|扫描|告警|整改|事件|agent/i.test(value)) return 'governance';
  return 'other';
}

/**
 * 分类判定优先级（从具体到宽泛）：先匹配具体分类，最后才是按 cn- 前缀兜底的合规。
 * 与 list_categories 的展示顺序无关。
 */
const CLASSIFY_PRIORITY = [
  'industry',
  'data',
  'supply-chain',
  'capability',
  'governance',
  'compliance',
];

/**
 * 判断插件属于哪个分类。
 * @param {{name:string, description?:string}} plugin
 * @returns {Category}
 */
export function classifyPlugin(plugin) {
  const name = typeof plugin?.name === 'string' ? plugin.name : '';
  const description = typeof plugin?.description === 'string' ? plugin.description : '';
  for (const id of CLASSIFY_PRIORITY) {
    const category = CATEGORIES.find((item) => item.id === id);
    if (category && category.match(name)) return category;
  }
  const fallbackId = descriptionFallback(description);
  return CATEGORIES.find((category) => category.id === fallbackId) ?? OTHER;
}

/**
 * 按 id / 中文名 / 英文名解析分类，未找到返回 null。
 * @param {string} input
 * @returns {Category|null}
 */
export function resolveCategory(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const value = input.trim().toLowerCase();
  return (
    CATEGORIES.find(
      (category) =>
        category.id === value ||
        category.title.zh === input.trim() ||
        category.title.en.toLowerCase() === value,
    ) ?? null
  );
}

export { OTHER as OTHER_CATEGORY };
