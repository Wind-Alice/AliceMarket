// Wind MCP 客户端：服务表、凭证、发送前参数整形、传输与结果清洗。cli.mjs 只依赖本文件。
// 本文件不写 stdout、不退出进程，失败一律抛 CliError；cli.mjs 负责转成信封与退出码。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// ---------- 错误 ----------

export class CliError extends Error {
  constructor(code, detail = null, { exitCode = 1, metadata = {} } = {}) {
    super(typeof detail === 'string' ? detail : '');
    this.name = 'CliError';
    this.code = code;
    this.detail = detail;
    this.exitCode = exitCode;
    this.metadata = metadata;
  }
}

// ---------- 静态信息与服务表 ----------

export const SKILL_VERSION = '3.0.0';
export const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILL_NAME = basename(SKILL_DIR);

// 所有服务共用同一个 API Key 和同一套 MCP 传输头；服务表只记录真实差异：地址与说明。
const CREDENTIAL_ENV = 'WIND_API_KEY';
const MCP_HEADERS = Object.freeze({
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
});

export const SERVERS = Object.freeze({
  stock_research: {
    endpoint: 'https://mcp.wind.com.cn/vserver_stock_research/mcp/',
    label: 'Wind 股票研究（市场/行业/公司/财务/估值/事件/资金/技术/实时分析/选股）',
  },
  fund_research: {
    endpoint: 'https://mcp.wind.com.cn/vserver_fund_research/mcp/',
    label: 'Wind 基金研究（筛选/档案/净值/业绩/持仓/归因/风格/仓位）',
  },
  options_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_options_data/mcp/',
    label: 'Wind 期权（合约/期限/波动率/情绪/香草及奇异期权定价）',
  },
  futures_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_futures_data/mcp/',
    label: 'Wind 期货（仓单/合约/基差/资金/持仓/研报观点/供需）',
  },
  company_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_company_data/mcp/',
    label: 'Wind 企业库（工商/股权/人员/知识产权/司法/税务/经营风险）',
  },
  general_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_finance_data/mcp/',
    label: 'Wind 通用金融（跨资产行情/历史序列/指标/报表/文档/投研语料/自然语言取数）',
  },
  edb_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_edb_data/mcp/',
    label: 'Wind EDB（宏观/行业/区域/汇率指标搜索与时间序列）',
  },
  index_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_index_data/mcp/',
    label: 'Wind 指数/板块（档案/基本面/技术 + 行情/K线/分钟）',
  },
  bond_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_bond_data/mcp/',
    label: 'Wind 债券（基本档案/发债主体/行情估值/主体财务）',
  },
  financial_docs: {
    endpoint: 'https://mcp.wind.com.cn/vserver_financial_docs/mcp/',
    label: 'Wind 金融文档 RAG（公告 / 新闻）',
  },
  analytics_data: {
    endpoint: 'https://mcp.wind.com.cn/vserver_analytics_data/mcp/',
    label: 'Wind 通用分析数据（NL → Wind 数据）',
  },
});

// 通用金融服务的正式名是 general_data；finance_data 作为兼容名同样接受。
const ALIASES = Object.freeze({ finance_data: 'general_data' });

export function serverTypeList() {
  return Object.keys(SERVERS).join(' / ');
}

export function resolveServerType(name) {
  const resolved = ALIASES[name] || name;
  if (!SERVERS[resolved]) {
    throw new CliError('ROUTE_ERROR', `未知 server_type: ${name}. 可用: ${serverTypeList()}`);
  }
  return resolved;
}

export function serverListEntries(filter) {
  return Object.entries(SERVERS)
    .filter(([name]) => !filter || name === filter)
    .map(([name, server]) => ({
      server_type: name,
      endpoint: server.endpoint,
      endpoint_source: 'skill_contract',
      auth_env: [CREDENTIAL_ENV],
      headers: { ...MCP_HEADERS },
    }));
}

// ---------- 凭证：读取顺序、setup-key 写入、open-portal ----------
// Key 不得出现在源码、日志或错误信息里；对外只给 maskKey 结果。

const PORTAL_URL = 'https://aifinmarket.wind.com.cn/#/user/overview';

const globalConfigFile = () => join(homedir(), '.wind-aifinmarket', 'config');
const localConfigFile = () => join(SKILL_DIR, 'config.json');

function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

// 去 BOM：用码位判断，避免源码里出现不可见字符。
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// dotenv 子集：注释、引号、export 前缀。
function parseDotenv(content) {
  const env = {};
  for (const rawLine of content.split('\n')) {
    let line = stripBom(rawLine).trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const comment = value.indexOf(' #');
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    env[key] = value;
  }
  return env;
}

function readGlobalConfig() {
  const file = globalConfigFile();
  if (!existsSync(file)) return {};
  try {
    return parseDotenv(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function readLocalConfig() {
  const file = localConfigFile();
  if (!existsSync(file)) return {};
  try {
    const cfg = JSON.parse(readFileSync(file, 'utf8'));
    return cfg && typeof cfg === 'object' ? cfg : {};
  } catch {
    return {};
  }
}

// 查找顺序：用户全局配置 > Skill 本地 config.json 的 wind_api_key > 环境变量。
function getApiKey() {
  const sources = [
    () => readGlobalConfig()[CREDENTIAL_ENV],
    () => readLocalConfig().wind_api_key,
    () => process.env[CREDENTIAL_ENV],
  ];
  for (const read of sources) {
    const value = read();
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  throw new CliError('AUTH_ERROR',
    `${CREDENTIAL_ENV} 未配置（已检查：用户全局配置 > Skill 本地配置 > 环境变量）。` +
    '运行 node scripts/cli.mjs open-portal 获取 API Key，再运行 node scripts/cli.mjs setup-key <KEY> 写入后重试。');
}

function writeGlobalKey(file, key) {
  mkdirSync(dirname(file), { recursive: true });
  const keyLine = new RegExp(`^\\s*(export\\s+)?${CREDENTIAL_ENV}\\s*=`);
  const kept = existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter((line) => line.length > 0 && !keyLine.test(line))
    : [];
  writeFileSync(file, [...kept, `${CREDENTIAL_ENV}=${key}`].join('\n') + '\n', { mode: 0o600 });
}

function writeLocalKey(file, key) {
  let cfg = {};
  if (existsSync(file)) {
    try {
      cfg = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new CliError('SETUP_ERROR', `本地配置不是合法 JSON，已保留原文件未覆盖：${file} (${err.message})`);
    }
  }
  writeFileSync(file, JSON.stringify({ ...cfg, wind_api_key: key }, null, 2) + '\n', { mode: 0o600 });
}

// setup-key：scope=global 写用户全局配置（保留文件里其余行），scope=skill 写 Skill 本地 config.json。
export function writeApiKey({ key, scope }) {
  const file = scope === 'global' ? globalConfigFile() : localConfigFile();
  try {
    if (scope === 'global') writeGlobalKey(file, key);
    else writeLocalKey(file, key);
  } catch (err) {
    if (err instanceof CliError) throw err;
    throw new CliError('SETUP_ERROR', `配置写入失败 (scope=${scope}, path=${file}): ${err.message}`);
  }
  return { scope, path: file, key_masked: maskKey(key), next: '现在可以重试原 Wind 调用' };
}

// open-portal：用系统默认浏览器打开万得开发者中心；起不来时报错并给出手动访问地址。
export async function openDeveloperPortal() {
  const platform = process.platform;
  const [bin, args] = platform === 'darwin' ? ['open', [PORTAL_URL]]
    : platform === 'win32' ? ['cmd', ['/c', 'start', '', PORTAL_URL]]
      : ['xdg-open', [PORTAL_URL]];

  let spawnError = null;
  try {
    const child = spawn(bin, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.unref();
    spawnError = await new Promise((resolve) => {
      child.once('error', resolve);
      setTimeout(() => resolve(null), 300);
    });
  } catch (err) {
    spawnError = err;
  }
  if (spawnError) {
    throw new CliError('SETUP_ERROR', `本地无法启动浏览器: ${spawnError.message} | 用户应手动打开 ${PORTAL_URL}`);
  }
  return {
    url: PORTAL_URL,
    platform,
    spawn_command: `${bin} ${args.join(' ')}`,
    flow_note: '未登录时会自动跳转到登录页（/#/login）；登录完成后回到 overview 页面即可获取 API Key。',
    fallback_message: `如果浏览器没有自动弹出，请手动访问：${PORTAL_URL}`,
  };
}

// ---------- 发送前参数整形 ----------
// 只做确定无歧义的转换：代码大小写与港股前导零、逗号分隔串的空白、整型字段、K 线周期助记名。
// 不为中文名称或无后缀代码猜交易所；工具专属规则按 server_type + tool_name 限定，MCP Server 负责最终校验。

const KLINE_TOOLS = new Set(['get_index_kline']);
const KLINE_PERIODS = new Map([
  ['1min', '1'], ['5min', '3'], ['10min', '4'], ['15min', '5'],
  ['30min', '6'], ['60min', '7'], ['120min', '8'], ['240min', '9'],
  ['1d', '10'], ['1w', '11'], ['1mo', '12'], ['1y', '13'],
  ['1q', '14'], ['6mo', '15'],
]);

const splitList = (text) => text.split(',').map((item) => item.trim()).filter(Boolean);

// 中日韩统一表意文字（U+4E00..U+9FFF）。
function containsHan(text) {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0x4e00 && code <= 0x9fff) return true;
  }
  return false;
}

// 已带后缀的标准代码统一大小写并去掉港股前导零；中文名称与其它写法原样交给后端解析。
function normalizeWindcode(code) {
  if (typeof code !== 'string') return code;
  const raw = code.trim();
  if (containsHan(raw)) return raw;
  const upper = raw.toUpperCase();
  if (/^0\d{4}\.HK$/.test(upper)) return upper.slice(1);
  if (/^\d{4}\.HK$/.test(upper)) return upper;
  if (/^\d{6}\.(SH|SZ|BJ|OF)$/.test(upper)) return upper;
  if (/^[A-Z]{1,5}\.(O|N|A|HK|SH|SZ|BJ)$/.test(upper)) return upper;
  return raw;
}

// windCodes 一律按数组发出：全部服务的契约都是 array<string>。通用服务早先收逗号分隔字符串，
// 2026-09-09 起后端也改成数组，旧的 join 会让网关把整串当成一个标的。用户仍可传逗号分隔的
// 字符串，这里拆成数组。
function normalizeWindcodes(value) {
  const codes = Array.isArray(value) ? value.map(normalizeWindcode)
    : typeof value === 'string' ? splitList(value).map(normalizeWindcode)
      : null;
  return codes || value;
}

// server_type + tool_name + 用户参数 → 实际发往网关的 arguments。
export function buildToolArguments(server_type, toolName, params) {
  const out = { ...params };

  if (typeof out.indexes === 'string') out.indexes = splitList(out.indexes).join(',');
  if (typeof out.windcode === 'string') out.windcode = normalizeWindcode(out.windcode);
  if (typeof out.windCode === 'string') out.windCode = normalizeWindcode(out.windCode);
  if (Object.hasOwn(out, 'windCodes')) out.windCodes = normalizeWindcodes(out.windCodes);

  // count 是整型字段：整数字符串收敛成 number，其余原样交给网关校验。
  if (typeof out.count === 'string' && /^-?\d+$/.test(out.count.trim())) out.count = Number(out.count.trim());

  // 通用历史行情的 type：契约声明为字符串枚举 "0"/"1"，但网关按整数解释——传字符串 "1" 会按分时
  // 返回而不是 K 线。这里把 "0"/"1" 转成整数，其余原样。
  if (server_type === 'general_data' && toolName === 'quote_get_historical_data_series'
    && typeof out.type === 'string' && /^[01]$/.test(out.type.trim())) {
    out.type = Number(out.type.trim());
  }

  // K 线周期：缺省 1d；助记名转网关编码，已是编码或未知值原样。
  if (KLINE_TOOLS.has(toolName)) {
    const period = typeof out.period === 'string' ? out.period.trim() : out.period ?? '1d';
    out.period = KLINE_PERIODS.get(period) || period;
  }

  return out;
}

// ---------- 传输：initialize → tools/call | tools/list ----------

const PROTOCOL_VERSION = '2025-03-26';
const INITIALIZE_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 600_000;
const RETRY = { attempts: 3, delaysMs: [300, 1000] };

// HTTP 状态码 → 信封错误码；未列出的非 2xx 一律 NETWORK_ERROR。
const HTTP_ERROR_CODES = { 401: 'AUTH_ERROR', 429: 'RATE_LIMIT_ERROR' };

// 后端把明确的拒绝写成纯文本时的前缀。只匹配 300 字以内、不以 JSON/Markdown/表格开头的文本，
// 避免把研究正文里出现的"错误""失败"字样判成请求失败。
const TEXT_ERROR_PREFIXES = [
  'Invalid ',
  '未识别到有效的金融标的',
  '缺少必填参数',
  '请求参数不合法',
  '服务暂时不可用',
  '余额不足',
];

function looksLikeTextError(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 300 || /^[[{#|*]/.test(trimmed)) return false;
  return TEXT_ERROR_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

// 后端接口错误统一为 backend_error，并保留原始信息：缺字段之类可修正的错误不能被覆盖成泛化网络故障。
function backendError(message) {
  return new CliError('backend_error', null, {
    metadata: { error_message: String(message ?? '').slice(0, 2000) },
  });
}

async function fetchWithRetry(url, makeOptions) {
  const debug = process.env.WIND_DEBUG === '1';
  let lastError;
  for (let attempt = 1; attempt <= RETRY.attempts; attempt += 1) {
    try {
      return await fetch(url, makeOptions());
    } catch (err) {
      lastError = err;
      if (debug) {
        const cause = err?.cause?.code || err?.code || 'UNKNOWN_CAUSE';
        process.stderr.write(`[wind-mcp fetch retry ${attempt}/${RETRY.attempts}] ${cause}: ${err?.message || err}\n`);
      }
      const delayMs = RETRY.delaysMs[Math.min(attempt - 1, RETRY.delaysMs.length - 1)] || 0;
      if (attempt < RETRY.attempts && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

async function sendRequest(endpoint, body, { timeoutMs, extraHeaders }) {
  const headers = { Authorization: `Bearer ${getApiKey()}`, ...MCP_HEADERS, ...extraHeaders };
  let resp;
  try {
    resp = await fetchWithRetry(endpoint, () => ({
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    }));
  } catch {
    throw new CliError('NETWORK_ERROR');
  }
  if (!resp.ok) {
    await resp.text().catch(() => '');
    throw new CliError(HTTP_ERROR_CODES[resp.status] || 'NETWORK_ERROR');
  }
  return resp;
}

// 后端正常返回 SSE，部分错误场景返回纯 JSON；取最后一个 data 行。
function parsePayload(text, server_type) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // 不是纯 JSON，按 SSE 继续解析。
    }
  }
  let last = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('data: ')) last = line.slice(6);
  }
  if (last) {
    try {
      return JSON.parse(last);
    } catch (err) {
      throw new CliError('TOOL_RUNTIME_ERROR', `SSE data 行 JSON 解析失败：${err.message}。原文前 200 字符：${text.slice(0, 200)} (server=${server_type})`);
    }
  }
  throw new CliError('TOOL_RUNTIME_ERROR', `响应格式无法识别（既非 SSE 也非纯 JSON）。原文前 200 字符：${text.slice(0, 200)} (server=${server_type})`);
}

// 识别已知的后端错误形态：JSON-RPC error、isError、明确的文本拒绝、content[0] 内层 JSON 的业务错误码。
function assertNoBackendError(payload) {
  if (payload.error) {
    throw backendError(typeof payload.error === 'string' ? payload.error : (payload.error.message || JSON.stringify(payload.error)));
  }
  if (payload.result?.isError) {
    throw backendError(payload.result.content?.[0]?.text || JSON.stringify(payload.result));
  }

  const text = payload.result?.content?.[0]?.text;
  if (typeof text !== 'string') return;
  if (looksLikeTextError(text)) throw backendError(text.trim());

  let inner;
  try {
    inner = JSON.parse(text);
  } catch {
    return;
  }
  if (!inner || typeof inner !== 'object') return;

  if (typeof inner.mcp_tool_error_code === 'number' && inner.mcp_tool_error_code !== 0) {
    throw backendError(inner.mcp_tool_error_msg || JSON.stringify(inner));
  }
  if (inner.error && (inner.error.code || inner.error.message)) {
    throw backendError(inner.error.message || JSON.stringify(inner.error));
  }
  if (inner.data && typeof inner.data === 'object') {
    const raw = inner.data.code;
    const code = typeof raw === 'number' ? raw
      : (typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : null);
    const success = code === 0 || (code !== null && code >= 200 && code < 300);
    if (code !== null && !success) {
      throw backendError(typeof inner.data.message === 'string' ? inner.data.message : JSON.stringify(inner.data));
    }
  }
}

async function mcpRequest(server_type, method, params, { timeoutMs, extraHeaders = {} }) {
  const server = SERVERS[server_type];
  if (!server) {
    throw new CliError('ROUTE_ERROR', `未知 server_type: ${server_type}. 可用: ${serverTypeList()}`);
  }
  const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params });
  const resp = await sendRequest(server.endpoint, body, { timeoutMs, extraHeaders });
  const payload = parsePayload(await resp.text(), server_type);
  assertNoBackendError(payload);
  if (payload.result === undefined) {
    throw new CliError('TOOL_RUNTIME_ERROR', `响应缺少 result 字段。原文前 200 字符：${JSON.stringify(payload).slice(0, 200)} (server=${server_type})`);
  }
  return { result: payload.result, sessionId: resp.headers.get('mcp-session-id') };
}

export async function mcpInitializeAndCall(server_type, method, params) {
  const init = await mcpRequest(server_type, 'initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: SKILL_NAME, version: SKILL_VERSION },
  }, { timeoutMs: INITIALIZE_TIMEOUT_MS });

  const sessionHeaders = {};
  if (init.sessionId) sessionHeaders['Mcp-Session-Id'] = init.sessionId;
  const negotiated = init.result?.protocolVersion;
  if (negotiated) sessionHeaders['MCP-Protocol-Version'] = negotiated;

  const call = await mcpRequest(server_type, method, params, { timeoutMs: CALL_TIMEOUT_MS, extraHeaders: sessionHeaders });
  return call.result;
}

// ---------- 结果清洗：保留 MCP result 外层，附加 cli_meta ----------
// 三条规则有业务语义，不得删减：结构化数据区（rows / value 数组内）的字符串 INVALID → null，
// 表示缺失或不适用，不能按 0 计算；每个 rows 数组记录真实行数；excelTotalCount 只是后端原始字段，
// 不能据此判断结果总数或完整性。

function normalizePayload(value, path, state, inDataArea) {
  if (inDataArea && value === 'INVALID') {
    state.invalidPaths.push(path);
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizePayload(item, `${path}[${index}]`, state, inDataArea));
  }
  if (!value || typeof value !== 'object') return value;

  const normalized = {};
  for (const [key, item] of Object.entries(value)) {
    const entersDataArea = Array.isArray(item) && (key === 'rows' || key === 'value');
    normalized[key] = normalizePayload(item, `${path}.${key}`, state, inDataArea || entersDataArea);
  }
  if (Array.isArray(value.rows)) {
    state.tables.push({ path, actual_row_count: value.rows.length });
  }
  if (Object.hasOwn(value, 'excelTotalCount')) {
    state.warnings.push({
      code: 'UNRELIABLE_DECLARED_COUNT',
      path: `${path}.excelTotalCount`,
      message: 'excelTotalCount 仅保留为后端原始字段，不得据此判断结果总数或完整性。',
    });
  }
  return normalized;
}

export function normalizeCallSuccess(result, { server_type = null, tool_name = null } = {}) {
  const output = result && typeof result === 'object' ? structuredClone(result) : result;
  const state = { warnings: [], tables: [], invalidPaths: [] };

  if (output && Array.isArray(output.content)) {
    for (const item of output.content) {
      if (item?.type !== 'text' || typeof item.text !== 'string') continue;
      try {
        item.text = JSON.stringify(normalizePayload(JSON.parse(item.text), '$', state, false));
      } catch {
        // 非 JSON 文本按后端原文透传。
      }
    }
  }

  if (state.invalidPaths.length) {
    state.warnings.push({
      code: 'BACKEND_INVALID_AS_NULL',
      count: state.invalidPaths.length,
      paths: state.invalidPaths.slice(0, 100),
      truncated: state.invalidPaths.length > 100,
      message: '结构化数据区中的后端字符串 INVALID 已转换为 null；表示缺失或不适用，禁止按 0 参与计算。',
    });
  }

  if (output && typeof output === 'object') {
    const countUnreliable = state.warnings.some((warning) => warning.code === 'UNRELIABLE_DECLARED_COUNT');
    output.cli_meta = {
      schema_version: '1.0',
      server_type,
      tool_name,
      completeness: countUnreliable ? 'unknown' : 'not_asserted',
      tables: state.tables,
      warnings: state.warnings,
    };
  }
  return output;
}
