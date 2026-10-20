/**
 * 轻量 SemVer 解析与范围判断（无第三方依赖）。
 *
 * 与 npm 的 semver 包相比有一处刻意差异：这里**不做预发布版本排除**。
 * npm 的严格规则下 `satisfies('0.2.1-rc.2', '>=0.1.0-rc.6 <0.3.0')` 会返回
 * false（因为区间里的预发布标记必须与版本自身三元组一致），但 DSH 插件的
 * engines 语义是按版本先后顺序比较的，`0.2.1-rc.2` 应当落在
 * `>=0.1.0-rc.6 <0.3.0` 里。因此这里按 SemVer 2.0.0 的排序规则直接比较，
 * 包括预发布标识符的大小顺序。
 */

const VERSION_RE =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const PARTIAL_RE = /^v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/;

/** @typedef {{major:number,minor:number,patch:number,prerelease:(number|string)[],raw:string}} Version */

/**
 * 解析完整版本号（允许前导 v 与 build metadata）。
 * @param {unknown} input
 * @returns {Version|null}
 */
export function parseVersion(input) {
  if (typeof input !== 'string') return null;
  const match = VERSION_RE.exec(input.trim());
  if (!match) return null;
  const prerelease = match[4]
    ? match[4].split('.').map((id) => (/^\d+$/.test(id) ? Number(id) : id))
    : [];
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
    raw: input.trim(),
  };
}

/** @param {unknown} input */
export function isValidVersion(input) {
  return parseVersion(input) !== null;
}

/**
 * 拆成偏序比较用的三元组 + 预发布数组。
 * @param {Version} version
 * @returns {[number, number, number, (number|string)[]]}
 */
function partsOf(version) {
  return [version.major, version.minor, version.patch, version.prerelease];
}

function comparePrereleaseIdentifiers(a, b) {
  const numericA = typeof a === 'number';
  const numericB = typeof b === 'number';
  if (numericA && numericB) return a === b ? 0 : a < b ? -1 : 1;
  if (numericA) return -1; // 数字标识符优先级低于字母数字标识符
  if (numericB) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * 按 SemVer 2.0.0 比较两个版本。
 * @param {string|Version} a
 * @param {string|Version} b
 * @returns {-1|0|1}
 */
export function compareVersions(a, b) {
  const va = typeof a === 'string' ? parseVersion(a) : a;
  const vb = typeof b === 'string' ? parseVersion(b) : b;
  if (!va || !vb) {
    throw new TypeError(`无效的版本号: ${typeof a === 'string' ? a : '?'} / ${typeof b === 'string' ? b : '?'}`);
  }
  const [amaj, amin, apat, apre] = partsOf(va);
  const [bmaj, bmin, bpat, bpre] = partsOf(vb);
  if (amaj !== bmaj) return amaj < bmaj ? -1 : 1;
  if (amin !== bmin) return amin < bmin ? -1 : 1;
  if (apat !== bpat) return apat < bpat ? -1 : 1;
  if (apre.length === 0 && bpre.length === 0) return 0;
  if (apre.length === 0) return 1; // 正式版 > 预发布版
  if (bpre.length === 0) return -1;
  const length = Math.min(apre.length, bpre.length);
  for (let i = 0; i < length; i += 1) {
    const result = comparePrereleaseIdentifiers(apre[i], bpre[i]);
    if (result !== 0) return result;
  }
  if (apre.length === bpre.length) return 0;
  return apre.length < bpre.length ? -1 : 1;
}

/** 是否为预发布版本 */
export function isPrerelease(version) {
  const parsed = typeof version === 'string' ? parseVersion(version) : version;
  return Boolean(parsed && parsed.prerelease.length > 0);
}

/**
 * @typedef {{op:'any'|'='|'>'|'>='|'<'|'<=',version:Version|null}} Comparator
 */

/**
 * @param {string} input
 * @returns {{major:number, minor:number|undefined, patch:number|undefined, prerelease:(number|string)[], wildcard:boolean}}
 */
function parsePartial(input) {
  const match = PARTIAL_RE.exec(input.trim());
  if (!match) throw new Error(`无法解析版本号: ${input}`);
  const minorRaw = match[2];
  const patchRaw = match[3];
  const wildcard = minorRaw === undefined || patchRaw === undefined ||
    /^[xX*]$/.test(minorRaw) || /^[xX*]$/.test(patchRaw ?? '');
  const prerelease = match[4]
    ? match[4].split('.').map((id) => (/^\d+$/.test(id) ? Number(id) : id))
    : [];
  return {
    major: Number(match[1]),
    minor: minorRaw === undefined || /^[xX*]$/.test(minorRaw) ? undefined : Number(minorRaw),
    patch: patchRaw === undefined || /^[xX*]$/.test(patchRaw) ? undefined : Number(patchRaw),
    prerelease,
    wildcard,
  };
}

function makeVersion(major, minor, patch, prerelease = []) {
  const suffix = prerelease.length ? `-${prerelease.join('.')}` : '';
  return parseVersion(`${major}.${minor}.${patch}${suffix}`);
}

/**
 * @param {number} major
 * @param {number} minor
 * @param {number} patch
 * @param {(number|string)[]} prerelease
 */
function makeComparator(op, version) {
  return { op, version };
}

/** @returns {Comparator} */
function anyComparator() {
  return { op: 'any', version: null };
}

/** @param {ReturnType<typeof parsePartial>} partial */
function wildcardComparators(partial) {
  if (partial.minor === undefined) {
    return [
      makeComparator('>=', makeVersion(partial.major, 0, 0)),
      makeComparator('<', makeVersion(partial.major + 1, 0, 0)),
    ];
  }
  if (partial.patch === undefined) {
    return [
      makeComparator('>=', makeVersion(partial.major, partial.minor, 0)),
      makeComparator('<', makeVersion(partial.major, partial.minor + 1, 0)),
    ];
  }
  return [makeComparator('=', makeVersion(partial.major, partial.minor, partial.patch, partial.prerelease))];
}

/**
 * 把一个 token（如 "^0.2.3"、">=0.1.0-rc.6"、"0.1.x"）展开成比较器列表。
 * @param {string} token
 * @returns {Comparator[]}
 */
function expandToken(token) {
  const match = /^(>=|<=|>|<|==|=|\^|~)?(.*)$/.exec(token);
  const op = match[1] ?? '=';
  const raw = match[2].trim();
  if (!raw) throw new Error(`无法解析版本范围片段: ${token}`);
  if (raw === '*' || raw === 'x' || raw === 'X') return [anyComparator()];

  if (op === '^' || op === '~') {
    const partial = parsePartial(raw);
    const major = partial.major;
    const minor = partial.minor ?? 0;
    const patch = partial.patch ?? 0;
    const lower = makeComparator('>=', makeVersion(major, minor, patch, partial.prerelease));
    let upper;
    if (op === '^') {
      if (major > 0) upper = makeVersion(major + 1, 0, 0);
      else if (partial.minor === undefined) upper = makeVersion(1, 0, 0);
      else if (minor > 0) upper = makeVersion(0, minor + 1, 0);
      else if (partial.patch === undefined) upper = makeVersion(0, 1, 0);
      else if (patch > 0) upper = makeVersion(0, 0, patch + 1);
      else upper = makeVersion(0, 0, 1);
    } else if (partial.minor === undefined) {
      upper = makeVersion(major + 1, 0, 0);
    } else {
      upper = makeVersion(major, minor + 1, 0);
    }
    return [lower, makeComparator('<', upper)];
  }

  if (op === '=' || op === '==') {
    const partial = parsePartial(raw);
    return wildcardComparators(partial);
  }

  // 其余比较运算符：补齐缺失位为 0
  const partial = parsePartial(raw);
  if (partial.minor === undefined) {
    if (op === '>') {
      return [
        makeComparator('>=', makeVersion(partial.major + 1, 0, 0)),
      ];
    }
    if (op === '<=') {
      return [makeComparator('<', makeVersion(partial.major + 1, 0, 0))];
    }
    return [makeComparator(op, makeVersion(partial.major, 0, 0))];
  }
  if (partial.patch === undefined) {
    if (op === '>') {
      return [makeComparator('>=', makeVersion(partial.major, partial.minor + 1, 0))];
    }
    if (op === '<=') {
      return [makeComparator('<', makeVersion(partial.major, partial.minor + 1, 0))];
    }
    return [makeComparator(op, makeVersion(partial.major, partial.minor, 0))];
  }
  return [
    makeComparator(op, makeVersion(partial.major, partial.minor, partial.patch, partial.prerelease)),
  ];
}

/**
 * @param {string} text
 * @returns {Comparator[]}
 */
function parseComparatorSet(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(trimmed);
  if (hyphen) {
    const lower = parsePartial(hyphen[1]);
    const upper = parsePartial(hyphen[2]);
    const lowerVersion = makeVersion(lower.major, lower.minor ?? 0, lower.patch ?? 0, lower.prerelease);
    const upperVersion =
      upper.minor === undefined
        ? makeVersion(upper.major + 1, 0, 0)
        : upper.patch === undefined
          ? makeVersion(upper.major, upper.minor + 1, 0)
          : makeVersion(upper.major, upper.minor, upper.patch, upper.prerelease);
    return [makeComparator('>=', lowerVersion), makeComparator('<=', upperVersion)];
  }
  const comparators = [];
  for (const token of trimmed.split(/\s+/)) {
    comparators.push(...expandToken(token));
  }
  return comparators;
}

/**
 * 解析版本范围字符串（支持 `||`、空格 AND、caret/tilde、通配符、连字符区间）。
 * @param {string} range
 * @returns {Comparator[][]}
 */
export function parseRange(range) {
  if (typeof range !== 'string' || !range.trim()) {
    throw new Error('版本范围必须是非空字符串');
  }
  const alternatives = range
    .split('||')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseComparatorSet);
  if (alternatives.length === 0) throw new Error(`无法解析版本范围: ${range}`);
  return alternatives;
}

/**
 * 判断版本是否满足范围。
 * @param {string|Version} version
 * @param {string} range
 * @returns {boolean}
 */
export function satisfies(version, range) {
  const parsed = typeof version === 'string' ? parseVersion(version) : version;
  if (!parsed) return false;
  const alternatives = parseRange(range);
  return alternatives.some((comparators) =>
    comparators.every((comparator) => {
      if (comparator.op === 'any') return true;
      const cmp = compareVersions(parsed, comparator.version);
      switch (comparator.op) {
        case '=':
          return cmp === 0;
        case '>':
          return cmp > 0;
        case '>=':
          return cmp >= 0;
        case '<':
          return cmp < 0;
        case '<=':
          return cmp <= 0;
        default:
          return false;
      }
    }),
  );
}

/**
 * 从版本列表中挑出“最新版本”：优先正式版，其次预发布版。
 * @param {string[]} versions
 * @returns {string|null}
 */
export function maxVersion(versions) {
  const parsed = versions
    .map((version) => parseVersion(version))
    .filter((version) => version !== null);
  if (parsed.length === 0) return null;
  const stables = parsed.filter((version) => version.prerelease.length === 0);
  const pool = stables.length > 0 ? stables : parsed;
  return pool.reduce((best, current) => (compareVersions(current, best) > 0 ? current : best), pool[0]).raw;
}
