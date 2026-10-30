// ============================================================================
// mcp.mjs —— Wind MCP 客户端传输层（Search / Call 版）
// ----------------------------------------------------------------------------
// 职责：向万得 MCP 网关发起 JSON-RPC 调用，并对外提供：
//   - 服务表（SERVERS / ALIASES / serverTypeList / resolveServerType / serverListEntries）
//   - 凭证管理（getApiKey / writeApiKey / openDeveloperPortal）
//   - 发送前参数整形（buildToolArguments）
//   - 会话与调用（createMcpSession / mcpInitializeAndCall / normalizeCallSuccess）
// 约定：
//   - 本文件不写 stdout、不退出进程；服务端错误保留原始响应，由 cli.mjs 输出并设退出码。
//   - cli.mjs 只依赖本文件；update-check.mjs 会用正则读取本文件的 SKILL_VERSION，
//     因此该行必须保持“export const SKILL_VERSION = 'X.Y.Z';”的单行格式。
//   - 沿用既有认证、会话和错误处理；目标工具参数按线上 inputSchema 原样传递。
// ============================================================================
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// ------------------------------ 错误定义 ------------------------------

// 本地配置、路由和输入错误仍使用 CliError；服务端响应使用 ServerResponseError。
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

// ------------------------- 静态信息与服务表 -------------------------

// 当前包版本标识（语义化版本号）。update-check.mjs 以此为准校验 Git 来源包并比较版本。
export const SKILL_VERSION = '3.0.0';
export const SKILL_TRANSPORT = 'search-call-v1';
// Skill 根目录：scripts/ 的上一级。
export const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILL_NAME = basename(SKILL_DIR);

// 调用来源标识只是传输层元数据，绝不作为金融工具的查询参数。
// 优先级：显式 --user-agent > WIND_USER_AGENT 环境变量；两者都没有且 required 时抛错。
export function getUserAgent(userAgent, { env = process.env, required = true } = {}) {
  const explicit = userAgent !== undefined;
  const configured = explicit || Object.hasOwn(env, 'WIND_USER_AGENT');
  if (!configured) {
    if (!required) return null;
    throw new CliError('USER_AGENT_REQUIRED', '联网调用需要实际Agent标识；传 --user-agent <Agent名称> 或配置 WIND_USER_AGENT。');
  }
  const agent = explicit ? userAgent : env.WIND_USER_AGENT;
  if (typeof agent !== 'string' || agent.length > 256 || !/^[\x20-\x7e]+$/.test(agent) || !agent.trim()) {
    throw new CliError('USER_AGENT_INVALID', 'Agent标识须为1–256个可打印ASCII字符，不包含换行或控制字符；使用实际宿主标识。');
  }
  return { agent: agent.trim(), value: agent.trim(), source: explicit ? 'explicit' : 'environment' };
}

// 所有服务共用同一个 API Key 与同一套 MCP 传输头；服务表只记录真实差异：地址与说明。
const CREDENTIAL_ENV = 'WIND_API_KEY';
const MCP_HEADERS = Object.freeze({
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
});

// 服务表：server_type -> { endpoint, label, 以及可选的传输特性 }。
// 本表同时被 cli.mjs 的 usage/list-servers 与 mcpRequest 的路由使用，是唯一权威来源。
export const SERVERS = Object.freeze({
  wind_tools: {
    endpoint: 'https://mcp.wind.com.cn/vserver_wind_tools/mcp/',
    label: 'Wind 金融工具发现与调用（market_search_tools / market_call_tool）',
    streaming: true,
    initializedNotification: true,
  },
});

const ALIASES = Object.freeze({ 'wind-tools': 'wind_tools' });

// 返回全部可用 server_type 的可读列表（用于报错与 usage 提示）。
export function serverTypeList() {
  return Object.keys(SERVERS).join(' / ');
}

// 解析 server_type：先查别名，再查服务表；未知名称直接抛 ROUTE_ERROR。
export function resolveServerType(name) {
  const resolved = ALIASES[name] || name;
  if (!SERVERS[resolved]) {
    throw new CliError('ROUTE_ERROR', `未知 server_type: ${name}. 可用: ${serverTypeList()}`);
  }
  return resolved;
}

// 导出服务表条目（供 list-servers 命令离线展示端点、请求头与认证变量）。
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

// ------------------ 凭证：读取顺序、setup-key 写入、open-portal ------------------
// 对外输出使用 maskKey 脱敏。

const PORTAL_URL = 'https://market.windalice.com/#/user/overview';

const globalConfigFile = () => join(homedir(), '.wind-aifinmarket', 'config');
const localConfigFile = () => join(SKILL_DIR, 'config.json');

function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

// 去 BOM：按码位判断，避免源码里出现不可见字符。
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// dotenv 子集解析：支持注释行、export 前缀、引号包裹，写回时按原样保留其它行。
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
  return existsSync(file) ? parseDotenv(readFileSync(file, 'utf8')) : {};
}

function readLocalConfig() {
  const file = localConfigFile();
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

function resolveCredential() {
  for (const [source, read] of [
    ['global', () => readGlobalConfig()[CREDENTIAL_ENV]],
    ['skill', () => readLocalConfig().wind_api_key],
    ['environment', () => process.env[CREDENTIAL_ENV]],
  ]) {
    const value = read();
    if (typeof value === 'string' && value.trim()) return { source, key: value.trim() };
  }
  return { source: null, key: null };
}

export function credentialSource() {
  return resolveCredential().source;
}

function getApiKey() {
  const { key } = resolveCredential();
  if (!key) throw new CliError('AUTH_ERROR', 'WIND_API_KEY 未配置，使用 setup-key <KEY> 配置。');
  return key;
}

// 写入用户全局配置：替换旧的 WIND_API_KEY 行，保留文件里其它内容。
function writeGlobalKey(file, key) {
  mkdirSync(dirname(file), { recursive: true });
  const keyLine = new RegExp(`^\\s*(export\\s+)?${CREDENTIAL_ENV}\\s*=`);
  const kept = existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter((line) => line.length > 0 && !keyLine.test(line))
    : [];
  writeFileSync(file, [...kept, `${CREDENTIAL_ENV}=${key}`].join('\n') + '\n', { mode: 0o600 });
}

// 写入 Skill 本地配置：合并 wind_api_key 字段；原文件必须是合法 JSON，否则不覆盖。
function writeLocalKey(file, key) {
  const cfg = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  writeFileSync(file, JSON.stringify({ ...cfg, wind_api_key: key }, null, 2) + '\n', { mode: 0o600 });
}

// setup-key：scope=global 写用户全局配置，scope=skill 写 Skill 本地 config.json。
// 返回脱敏后的写入结果，key 本身不出现在返回值里。
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

// open-portal：按平台用系统默认浏览器打开万得开发者中心；启动失败时抛错并给出手动地址。
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
    flow_note: '登录后进入用户页面获取 API Key。',
  };
}

// --------------------------- Search / Call 参数 ---------------------------
// 不沿用旧分域工具的代码/数字/周期转换：线上 inputSchema 是唯一参数契约。
export function buildToolArguments(toolName, params) {
  if (typeof toolName !== 'string' || !toolName.trim() || toolName !== toolName.trim()) {
    throw new CliError('PARAM_TYPE_ERROR', 'toolName 必须是搜索返回的非空工具名，不添加前后空白。');
  }
  // 外层 arguments 是 JSON 文本；内层数组、字符串、数字均保持原类型。
  return { toolName, arguments: JSON.stringify(params) };
}

// ------------------- 传输：initialize → tools/call | tools/list -------------------

const PROTOCOL_VERSION = '2025-03-26';
const INITIALIZE_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 600_000;
// 服务端 HTTP/JSON-RPC 错误保留原始响应正文，由 CLI 原样输出。
export class ServerResponseError extends Error {
  constructor(body, status = null) {
    super(body);
    this.name = 'ServerResponseError';
    this.body = body;
    this.status = status;
  }
}

function isTimeoutError(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError'
    || error?.cause?.code === 'UND_ERR_HEADERS_TIMEOUT' || error?.cause?.code === 'UND_ERR_BODY_TIMEOUT';
}

function networkFailure(error) {
  if (!(error instanceof TypeError) || !['fetch failed', 'terminated'].includes(error.message)) return null;
  const cause = error.cause;
  const detail = cause?.code || cause?.errors?.map(item => item.code).filter(Boolean).join(', ') || 'UNKNOWN';
  return new CliError('NETWORK_ERROR', `网络请求失败（${detail}）：${error.message}`);
}

// 只负责发送和设置超时；网络异常保持原始异常。
async function sendRequest(endpoint, body, { timeoutMs, extraHeaders }) {
  const headers = { Authorization: `Bearer ${getApiKey()}`, ...MCP_HEADERS, ...extraHeaders };
  // WIND_TRACE=1：把真实传到网关的请求头与请求体打到 stderr（Authorization 打码，其余原样）。
  if (process.env.WIND_TRACE === '1') {
    const safeHeaders = { ...headers };
    if (typeof safeHeaders.Authorization === 'string' && safeHeaders.Authorization.startsWith('Bearer ')) {
      safeHeaders.Authorization = `Bearer ${maskKey(safeHeaders.Authorization.slice('Bearer '.length))}`;
    }
    process.stderr.write(`[wind-mcp trace] POST ${endpoint}\n`);
    process.stderr.write(`[wind-mcp trace] 请求头: ${JSON.stringify(safeHeaders, null, 2)}\n`);
    process.stderr.write(`[wind-mcp trace] 请求体: ${body}\n`);
  }
  return fetch(endpoint, {
    method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs),
  });
}

// 后端正常返回 SSE，部分错误场景返回纯 JSON；纯 JSON 优先整体解析，否则取最后一个 data 行。
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

// 读取并匹配属于本次请求 id 的响应：SSE 流按 \n\n 分块、过滤 data: 行，匹配到同 id 即返回。
async function readMatchingResponse(resp, id, server_type) {
  if (!resp.headers.get('content-type')?.includes('text/event-stream')) {
    const payload = parsePayload(await resp.text(), server_type);
    if (payload.id !== id) throw new CliError('TOOL_RUNTIME_ERROR', 'JSON-RPC response id mismatch');
    return payload;
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new CliError('TOOL_RUNTIME_ERROR', 'SSE response has no readable body');
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }
      if (done) buffer += decoder.decode();
      buffer = buffer.replace(/\r\n/g, '\n');
      let separator;
      while ((separator = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        let message;
        try { message = JSON.parse(data); }
        catch (err) { throw new CliError('TOOL_RUNTIME_ERROR', `SSE JSON parse failed: ${err.message}`); }
        if (message.id === id) return message;
      }
      if (done) {
        if (buffer.includes('data:')) {
          const message = parsePayload(buffer, server_type);
          if (message.id === id) return message;
        }
        throw new CliError('TOOL_RUNTIME_ERROR', 'SSE ended without the matching JSON-RPC response');
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// 单一 JSON-RPC 请求。只有 tools/call 超时才立即重试一次，其它失败不重试。
async function mcpRequest(server_type, method, params, { timeoutMs, extraHeaders = {}, notification = false }) {
  const server = SERVERS[server_type];
  if (!server) throw new CliError('ROUTE_ERROR', '未知 server_type: ' + server_type + '. 可用: ' + serverTypeList());
  const id = notification ? undefined : Date.now();
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const attempts = method === 'tools/call' ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const resp = await sendRequest(server.endpoint, body, { timeoutMs, extraHeaders });
      if (!resp.ok) {
        const raw = await resp.text();
        throw new ServerResponseError(raw || `HTTP ${resp.status}`, resp.status);
      }
      if (notification) {
        await resp.body?.cancel().catch(() => {});
        return { result: null, sessionId: resp.headers.get('mcp-session-id') };
      }
      const payload = server.streaming
        ? await readMatchingResponse(resp, id, server_type)
        : parsePayload(await resp.text(), server_type);
      if (payload.error) throw new ServerResponseError(JSON.stringify(payload));
      if (payload.result === undefined) {
        throw new CliError('TOOL_RUNTIME_ERROR', '响应缺少 result 字段。原文前 200 字符：' + JSON.stringify(payload).slice(0, 200) + ' (server=' + server_type + ')');
      }
      return { result: payload.result, sessionId: resp.headers.get('mcp-session-id') };
    } catch (error) {
      if (method === 'tools/call' && attempt === 0 && isTimeoutError(error)) continue;
      throw networkFailure(error) || error;
    }
  }
}

export function isServerToolError(result) {
  return result?.isError === true;
}

// 建立会话：initialize → 携带 sessionId/协议版本 → 必要时发送 initialized 通知 → 返回可复用的 request。
// 会话仅在当前调用内持有；不在进程全局或用户目录缓存会话与工具定义。
export async function createMcpSession(server_type, { userAgent } = {}) {
  const identity = getUserAgent(userAgent);
  const identityHeaders = { 'User-Agent': identity.value };
  const init = await mcpRequest(server_type, 'initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: SKILL_NAME, version: SKILL_VERSION },
  }, { timeoutMs: INITIALIZE_TIMEOUT_MS, extraHeaders: identityHeaders });

  const sessionHeaders = { ...identityHeaders };
  if (init.sessionId) sessionHeaders['Mcp-Session-Id'] = init.sessionId;
  const negotiated = init.result?.protocolVersion;
  if (negotiated) sessionHeaders['MCP-Protocol-Version'] = negotiated;
  if (SERVERS[server_type].initializedNotification) {
    await mcpRequest(server_type, 'notifications/initialized', {}, {
      timeoutMs: INITIALIZE_TIMEOUT_MS, extraHeaders: sessionHeaders, notification: true,
    });
  }

  return {
    async request(method, params) {
      const call = await mcpRequest(server_type, method, params, { timeoutMs: CALL_TIMEOUT_MS, extraHeaders: sessionHeaders });
      if (call.sessionId) sessionHeaders['Mcp-Session-Id'] = call.sessionId;
      return call.result;
    },
  };
}

// 一步式：initialize + 单次调用，供无需复用会话的场景（如 list-tools）使用。
export async function mcpInitializeAndCall(server_type, method, params, options = {}) {
  const session = await createMcpSession(server_type, options);
  return session.request(method, params);
}

// 保留后端结果原文，只附加 CLI 路由与明确错误的元数据。
export function normalizeCallSuccess(result, { server_type = null, tool_name = null } = {}) {
  const output = result && typeof result === 'object' ? structuredClone(result) : result;
  if (!output || typeof output !== 'object' || Array.isArray(output)) throw new CliError('TOOL_RUNTIME_ERROR', 'MCP result must be an object');
  if (isServerToolError(output)) return output;
  output.cli_meta = {
    ...output.cli_meta,
    schema_version: '1.0',
    server_type,
    tool_name,
  };
  return output;
}

// call 命令 usage 里展示的典型调用示例。
export const CALL_EXAMPLES = [
  `cli.mjs search "查询贵州茅台最新行情" --top-k 3`,
  `cli.mjs search @question.txt`,
  `cli.mjs call <搜索返回的toolName> @params.json`,
];
