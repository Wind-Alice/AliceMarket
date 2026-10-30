#!/usr/bin/env node
// wind-one-mcp-skill CLI 入口：命令分发、参数读取、信封输出与退出码。Agent 只读 stdout。
// Wind MCP 客户端逻辑在 mcp.mjs，自动更新在 update-check.mjs。
// 调用方 agent 识别（detect-agent）已内联在本文件：只读本进程的环境变量和祖先进程，不联网。
import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CliError, ServerResponseError, isServerToolError, SERVERS, CALL_EXAMPLES, SKILL_DIR, SKILL_VERSION, SKILL_TRANSPORT, buildToolArguments, mcpInitializeAndCall, createMcpSession,
  normalizeCallSuccess, openDeveloperPortal, resolveServerType, serverListEntries, serverTypeList,
  stripBom, writeApiKey, getUserAgent, credentialSource,
} from './mcp.mjs';
import { diagnoseUpdate, triggerUpdateCheck, updateSkill } from './update-check.mjs';
let cliIdentity;

// ---------- 调用方 agent 识别（内联自 detect-agent.mjs） ----------
// 判断当前是哪个 AI agent 在调用 CLI，返回请求头 User-Agent 的值：`claude-code/2.1.296`；
// 拿不到版本时只有名字（`codex`），认不出时为 `unknown`。
// 返回值只含 [A-Za-z0-9_./-]，可以直接放进 HTTP 头：fetch 遇到中文或换行会直接抛 TypeError。

// 进程名 → agent 名。只按可执行文件名或脚本文件名精确匹配（区分大小写），不在整条命令行里搜子串，
// 避免 `bash -c "cd ~/claude-notes && ..."` 这类路径被误判。claude 已在 Linux 上实测，其余为各家 CLI 的命令名。
const PROCESS_NAMES = new Map(Object.entries({
  claude: 'claude-code',
  codex: 'codex',
  gemini: 'gemini-cli',
  'cursor-agent': 'cursor-cli',
  opencode: 'opencode',
  copilot: 'github-copilot-cli',
  auggie: 'augment',
  qwen: 'qwen-code',
  iflow: 'iflow-cli',
  kimi: 'kimi-cli',
  kimi_code: 'kimi-code',
  codebuddy: 'codebuddy',
  qodercli: 'qoder',
  openclaw: 'openclaw',
  hermes: 'hermes',
  goose: 'goose',
  aider: 'aider',
  amp: 'amp',
  crush: 'crush',
  droid: 'droid',
  cline: 'cline',
}));

// node 直接跑包内入口（进程名是 node、脚本名是 index / cli）时，按脚本路径里的 npm 包名识别。
const PACKAGE_PATHS = Object.freeze([
  ['/@anthropic-ai/claude-code/', 'claude-code'],
  ['/@openai/codex/', 'codex'],
  ['/@google/gemini-cli/', 'gemini-cli'],
]);

// agent 注入子进程的环境变量，按顺序判断。`KEY` 表示非空即命中，`KEY=value` 表示必须等于该值。
// 取自 @vercel/detect-agent 1.2.7（CODEX_SANDBOX_NETWORK_DISABLED 取自 Codex 文档）。与它不同的是
// IDE 变量（CURSOR_TRACE_ID 等）不在这里、放到最后一层，否则在 Cursor 终端里跑的 Claude Code 会被算成 cursor。
const ENV_RULES = Object.freeze([
  ['CURSOR_AGENT', 'cursor-cli'],
  ['CURSOR_EXTENSION_HOST_ROLE=agent-exec', 'cursor-cli'],
  ['GEMINI_CLI', 'gemini-cli'],
  ['CODEX_SANDBOX', 'codex'],
  ['CODEX_CI', 'codex'],
  ['CODEX_THREAD_ID', 'codex'],
  ['CODEX_SANDBOX_NETWORK_DISABLED', 'codex'],
  ['ANTIGRAVITY_AGENT', 'antigravity'],
  ['AUGMENT_AGENT', 'augment'],
  ['OPENCODE=1', 'opencode'],
  ['OPENCODE_CLIENT', 'opencode'],
  ['CLAUDECODE', 'claude-code'],
  ['CLAUDE_CODE', 'claude-code'],
  ['COPILOT_MODEL', 'github-copilot-cli'],
  ['COPILOT_ALLOW_ALL', 'github-copilot-cli'],
  ['COPILOT_GITHUB_TOKEN', 'github-copilot-cli'],
  ['QODER_WORK_INTEGRATION_PRODUCT', 'qwenwork'],
  ['WORKBUDDY_APP_NAME', 'workbuddy'],
  ['DOUBAO_OFFICE_AGENT_NAME', 'doubao'],
  ['KIMI_CODE_HOME', 'kimi-code'],
]);

// 自带 agent 的 VS Code 系 IDE。它们的终端都报 TERM_PROGRAM=vscode，要看 git askpass 路径里的程序名区分是哪一家。
const AGENT_IDES = Object.freeze(['cursor', 'windsurf', 'trae', 'kiro', 'qoder', 'codebuddy', 'antigravity']);

// ---------- 进程树 ----------

const MAX_DEPTH = 8;
const PS_TIMEOUT_MS = 500;
const INTERPRETER = /^(node|nodejs|bun|deno|pypy3?|python[\d.]*)$/;

function fileName(path) {
  return String(path)
    .split(/[\\/]/)
    .pop()
    .replace(/^-/, '')
    .replace(/\.(exe|cmd|bat|js|mjs|cjs|py)$/i, '');
}

// Linux：直接读 /proc，不起子进程。
function procAncestors(startPid, log) {
  const out = [];
  for (let pid = startPid; pid > 1 && out.length < MAX_DEPTH;) {
    let stat;
    try {
      stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    } catch (err) {
      log(`读 /proc/${pid}/stat 失败，停止向上查：${err.message}`);
      break;
    }
    // comm 本身可能含空格和括号，所以 ppid 取最后一个 ')' 之后的第 2 个字段。
    const close = stat.lastIndexOf(')');
    const comm = stat.slice(stat.indexOf('(') + 1, close);
    const ppid = Number(stat.slice(close + 2).split(' ')[1]);
    let argv = [];
    try {
      argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    } catch (err) {
      log(`读 /proc/${pid}/cmdline 失败，只用 comm：${err.message}`);
    }
    out.push({ pid, comm, argv });
    pid = ppid;
  }
  return out;
}

// macOS 等其他 Unix：一次 ps 拿全表再在内存里往上走，避免每层起一次子进程。
function psAncestors(startPid, log) {
  const text = execFileSync('ps', ['-A', '-ww', '-o', 'pid=,ppid=,args='], {
    encoding: 'utf8',
    timeout: PS_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const table = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m) table.set(Number(m[1]), { ppid: Number(m[2]), args: m[3] });
  }
  log(`ps 返回 ${table.size} 个进程`);
  const out = [];
  for (let pid = startPid; pid > 1 && out.length < MAX_DEPTH && table.has(pid);) {
    const { ppid, args } = table.get(pid);
    // ps 只给空格拼接的命令行，路径带空格时会被切开；这里只用程序名和脚本名，影响不大。
    out.push({ pid, comm: '', argv: args.trim().split(/\s+/) });
    pid = ppid;
  }
  return out;
}

function defaultAncestors(platform, ppid, log) {
  // Windows 查进程树要起 PowerShell，代价太大，只靠环境变量。
  if (platform === 'win32') return [];
  return platform === 'linux' ? procAncestors(ppid, log) : psAncestors(ppid, log);
}

// 一个祖先进程是不是 agent：依次看脚本名、可执行文件名、comm（Linux 下即 process.title），最后看脚本路径里的包名。
function matchProcess(proc) {
  const exe = fileName(proc.argv[0] || proc.comm || '');
  const scriptArg = INTERPRETER.test(exe) ? proc.argv.slice(1).find((arg) => !arg.startsWith('-')) : undefined;
  for (const name of [scriptArg && fileName(scriptArg), exe, proc.comm && fileName(proc.comm)]) {
    if (name && PROCESS_NAMES.has(name)) return { agent: PROCESS_NAMES.get(name), source: name };
  }
  const scriptPath = scriptArg?.replaceAll('\\', '/');
  const pkg = scriptPath && PACKAGE_PATHS.find(([segment]) => scriptPath.includes(segment));
  return pkg ? { agent: pkg[1], source: pkg[0] } : null;
}

// ---------- 各层 ----------

function parseDeclared(raw) {
  // Claude Code 的写法：claude-code_2-1-296_agent
  const claude = raw.match(/^(.+?)_(\d+(?:-\d+)+)_agent$/);
  if (claude) return { agent: claude[1], version: claude[2].replaceAll('-', '.') };
  const slash = raw.indexOf('/');
  if (slash > 0) return { agent: raw.slice(0, slash), version: raw.slice(slash + 1) || null };
  return { agent: raw, version: null };
}

// 显式声明：WIND_AGENT 留给集成方自己设（name 或 name/version），AI_AGENT 是各家 agent 的通用约定。
function fromDeclared(env, log) {
  for (const key of ['WIND_AGENT', 'AI_AGENT']) {
    const raw = env[key]?.trim();
    if (!raw) continue;
    const { agent, version } = parseDeclared(raw);
    if (clean(agent)) return { agent, version, source: key };
    log(`${key}=${JSON.stringify(raw)} 去掉非法字符后为空，忽略`);
  }
  return null;
}

// 离调用方最近的 agent 进程获胜。排在环境变量前：环境变量会被嵌套的外层 agent 继承，
// 也会被 fork 出来的 CLI 原样沿用（如 Gemini CLI 的分支），进程名更准。
function fromProcessTree(listAncestors, log) {
  const ancestors = listAncestors();
  log(`祖先进程 ${ancestors.length} 层（由近到远）：${ancestors
    .map((p) => `${p.pid}:${p.comm || '-'}:${p.argv.join(' ').slice(0, 200)}`)
    .join(' <- ')}`);
  for (const proc of ancestors) {
    const hit = matchProcess(proc);
    if (hit) return hit;
  }
  return null;
}

function fromEnv(env) {
  for (const [rule, agent] of ENV_RULES) {
    const [key, want] = rule.split('=');
    if (want === undefined ? env[key] : env[key] === want) return { agent, source: key };
  }
  return null;
}

// 只有 IDE 信号时兜底当 agent，信号最弱：人在这些 IDE 的终端里手动跑也会命中。原版 VS Code 不算 agent。
function fromIde(env) {
  if (env.CURSOR_TRACE_ID) return { agent: 'cursor', source: 'CURSOR_TRACE_ID' };
  if (env.TERM_PROGRAM !== 'vscode') return null;
  const appPath = `${env.VSCODE_GIT_ASKPASS_NODE || ''} ${env.VSCODE_GIT_ASKPASS_MAIN || ''}`.toLowerCase();
  const ide = AGENT_IDES.find((name) => appPath.includes(name));
  return ide ? { agent: ide, source: 'VSCODE_GIT_ASKPASS' } : null;
}

// ---------- 识别入口 ----------

// 将探测到的 Agent 名称整理为 HTTP User-Agent 字符。
function clean(value, max = 40) {
  if (typeof value !== 'string') return null;
  const out = value.replace(/[^\w.-]+/g, '-').slice(0, max).replace(/^[-.]+|[-.]+$/g, '');
  return out || null;
}

const WATCHED_ENV = Object.freeze([
  'WIND_AGENT', 'AI_AGENT', 'CLAUDE_CODE_IS_COWORK',
  ...ENV_RULES.map(([rule]) => rule.split('=')[0]),
  'CURSOR_TRACE_ID', 'TERM_PROGRAM', 'VSCODE_GIT_ASKPASS_NODE', 'VSCODE_GIT_ASKPASS_MAIN',
]);

// 与 mcp.mjs 的 maskKey 同一约定：凭证类变量只记是否存在，不记值。
function envSnapshot(env) {
  const parts = WATCHED_ENV.filter((key) => env[key]).map((key) =>
    (/TOKEN|KEY|SECRET/.test(key) ? `${key}=<set>` : `${key}=${JSON.stringify(String(env[key]).slice(0, 160))}`));
  return parts.length ? parts.join(' ') : '(无相关变量)';
}

function debugLogger(env) {
  if (env.WIND_DEBUG !== '1') return () => {};
  return (msg) => process.stderr.write(`[wind-mcp detect-agent] ${msg}\n`);
}

/**
 * 返回调用 CLI 的 agent，格式 `名字/版本`，用作请求头 User-Agent。
 * 优先级：显式声明 > 进程树 > agent 环境变量 > IDE 兜底，命中即停。目前只有显式声明能拿到版本。
 * 参数都可注入，便于离线测试；默认读当前进程。WIND_DEBUG=1 时每一层的输入和结果打到 stderr。
 */
function detectAgent({
  env = process.env,
  platform = process.platform,
  ppid = process.ppid,
  log = debugLogger(env),
  listAncestors = () => defaultAncestors(platform, ppid, log),
} = {}) {
  log(`入口 platform=${platform} ppid=${ppid} ${envSnapshot(env)}`);
  const hit = fromDeclared(env, log)
    || fromProcessTree(listAncestors, log)
    || fromEnv(env)
    || fromIde(env);
  let agent = clean(hit?.agent.toLowerCase()) || 'unknown';
  if (agent === 'claude-code' && env.CLAUDE_CODE_IS_COWORK) agent = 'claude-cowork';
  const version = clean(hit?.version, 32);
  const userAgent = version ? `${agent}/${version}` : agent;
  log(`结果 ${userAgent}`);
  return userAgent;
}

export function parseUserAgentOption(argv) {
  const args = [];
  let userAgent;
  let found = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--user-agent' || flag.startsWith('--user-agent=')) {
      if (found) throw new CliError('USAGE_ERROR', '--user-agent 只能传一次。');
      found = true;
      if (flag === '--user-agent') {
        if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new CliError('USAGE_ERROR', '--user-agent 缺少Agent标识。');
        userAgent = argv[++i];
      } else userAgent = flag.slice('--user-agent='.length);
      getUserAgent(userAgent);
    } else args.push(flag);
  }
  return { args, userAgent };
}

// 宿主标识只在 CLI 启动时解析一次；普通调用无需在命令中重复传参。
// 优先级：显式 --user-agent / WIND_USER_AGENT > detect-agent 四层探测 > Unknown-Agent。
export function detectAgentIdentity(explicit, env = process.env) {
  if (explicit !== undefined) return getUserAgent(explicit, { env });
  if (Object.hasOwn(env, 'WIND_USER_AGENT')) return getUserAgent(undefined, { env });
  const detected = detectAgent({ env });
  if (detected && detected !== 'unknown') {
    const identity = getUserAgent(detected, { env: {} });
    return { ...identity, source: `detected:${detected}` };
  }
  return { ...getUserAgent('Unknown-Agent', { env: {} }), source: 'unknown' };
}


// ---------- 输出 ----------
function writeJson(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

// 服务端响应正文原样输出；本地错误保留实际消息，不映射成泛化文案。
export function fail(err) {
  if (err instanceof ServerResponseError) {
    if (err.status !== null) writeJson({ ok: false, code: 'HTTP_ERROR', http_status: err.status, body: err.body });
    else process.stdout.write(err.body.endsWith('\n') ? err.body : err.body + '\n');
    process.exitCode = 1;
    return;
  }
  const isCliError = err instanceof CliError;
  const code = isCliError ? err.code : (err?.name || 'LOCAL_ERROR');
  const message = isCliError ? String(err.detail || err.message || code) : String(err?.message ?? err);
  writeJson({ ok: false, code, message,
    ...(isCliError && err.metadata.tool_definition ? { tool_definition: err.metadata.tool_definition } : {}) });
  process.exitCode = isCliError ? err.exitCode : 1;
}

// ---------- 参数读取：inline JSON / stdin '-' / '@文件'（UTF-8，兼容 BOM） ----------

function loadParamsText(input) {
  if (input === '-') {
    try {
      return { text: stripBom(readFileSync(0, 'utf8')), source: 'stdin' };
    } catch (cause) {
      throw new CliError('PARAMS_FILE_ERROR', `无法从 stdin 读取 params (${cause.code || cause.message})`);
    }
  }
  if (!input.startsWith('@')) return { text: input, source: 'inline' };

  const fileArg = input.slice(1);
  if (!fileArg) throw new CliError('PARAMS_FILE_ERROR', '@file 缺少文件路径');
  const filePath = resolve(process.cwd(), fileArg);
  try {
    return { text: stripBom(readFileSync(filePath, 'utf8')), source: 'file', filePath };
  } catch (cause) {
    throw new CliError('PARAMS_FILE_ERROR', `无法读取 params 文件：${filePath} (${cause.code || cause.message})`);
  }
}

function parseParams(input) {
  const { text, source, filePath } = loadParamsText(input);
  let params;
  try {
    params = JSON.parse(text);
  } catch (err) {
    const where = source === 'file' ? `文件：${filePath}` : `原文：${text.slice(0, 200)}`;
    throw new CliError('INVALID_PARAMS_JSON', `params JSON 解析失败：${err.message} | ${where}`);
  }
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new CliError('PARAM_TYPE_ERROR', 'params 必须是 JSON object');
  }
  return params;
}

// 支持 --name value 与 --name=value；未出现返回 undefined。
function readFlag(flags, name) {
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] === `--${name}`) return flags[i + 1];
    if (flags[i].startsWith(`--${name}=`)) return flags[i].slice(name.length + 3);
  }
  return undefined;
}

// ---------- 命令 ----------

async function gatewayCall(name, args) {
  const server_type = 'wind_tools';
  const userAgent = cliIdentity;
  const session = await createMcpSession(server_type, { userAgent: userAgent.agent });
  const result = await session.request('tools/call', {
    name, arguments: args, _meta: { clientVersion: SKILL_VERSION },
  });
  return { server_type, tool: name, result, userAgent };
}

async function cmdSearch([questionInput, ...flags]) {
  if (!questionInput) throw new CliError('USAGE_ERROR', '用法：search <用户原问题|@question_file|-> [--top-k N]');
  const question = loadParamsText(questionInput).text;
  if (!question.trim()) throw new CliError('PARAM_TYPE_ERROR', 'question 不能为空');
  const args = { question };
  let found = false;
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (found || (flag !== '--top-k' && !flag.startsWith('--top-k='))) {
      throw new CliError('USAGE_ERROR', `不支持或重复的选项：${flag}`);
    }
    const value = flag === '--top-k' ? flags[++i] : flag.slice('--top-k='.length);
    if (!/^[1-9]\d*$/.test(value || '') || !Number.isSafeInteger(Number(value)) || Number(value) > 10) {
      throw new CliError('PARAM_TYPE_ERROR', '--top-k 必须是 1–10 的整数');
    }
    args.topK = Number(value);
    found = true;
  }
  return gatewayCall('market_search_tools', args);
}

async function cmdCall([toolName, paramsInput, ...flags]) {
  if (!toolName || !paramsInput || flags.length) throw new CliError('USAGE_ERROR', callUsage());
  return gatewayCall('market_call_tool', buildToolArguments(toolName, parseParams(paramsInput)));
}

async function cmdListTools(args) {
  if (args.length > 1) throw new CliError('USAGE_ERROR', '用法：list-tools [wind_tools]');
  const server_type = resolveServerType(args[0] || 'wind_tools');
  const result = await mcpInitializeAndCall(server_type, 'tools/list', {}, { userAgent: cliIdentity.agent });
  return { server_type, ...result };
}

async function cmdListServers([serverType]) {
  return { servers: serverListEntries(serverType ? resolveServerType(serverType) : null) };
}

async function cmdSetupKey([key, ...flags]) {
  if (!key || key.startsWith('--')) {
    throw new CliError('USAGE_ERROR', 'USAGE:\n' +
      '用法：cli.mjs setup-key <KEY> [--scope <global|skill>]\n\n' +
      '默认 scope=global（用户全局配置，所有 Wind skill 共享）；仅用户明确要求时传 scope=skill（只写当前 Skill 目录）。');
  }
  const scope = readFlag(flags, 'scope') ?? 'global';
  if (!['global', 'skill'].includes(scope)) {
    throw new CliError('SETUP_ERROR', `setup-key 未知 scope: ${scope} (可选: global / skill)`);
  }
  return writeApiKey({ key, scope });
}

function cmdUpdate(args) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--force')) {
    throw new CliError('USAGE_ERROR', '用法：cli.mjs update [--force]');
  }
  return updateSkill({ force: args.includes('--force') });
}

const COMMANDS = {
  search: cmdSearch,
  discover: cmdSearch,
  call: cmdCall,
  'list-tools': cmdListTools,
  'list-servers': cmdListServers,
  'setup-key': cmdSetupKey,
  'open-portal': () => openDeveloperPortal(),
  update: cmdUpdate,
  diagnose: () => {
    const identity = cliIdentity;
    return { ...diagnoseUpdate(), skill_version: SKILL_VERSION, skill_transport: SKILL_TRANSPORT, platform: process.platform, node_version: process.version,
      credential_source: credentialSource(),
      user_agent: identity?.value || null, user_agent_source: identity?.source || null };
  },
};

// ---------- 用法 ----------

function callUsage() {
  return "用法：call <搜索返回的toolName> '<目标参数JSON>|@params_file|-'\n" +
    'CLI 自动封装 market_call_tool 的 toolName 与字符串 arguments；不传 server_type。';
}

function usageText() {
  return 'wind-one-mcp-skill Search / Call\n' +
    '通过 Wind 统一入口先发现工具，再按 inputSchema 调用\n\n' +
    '用法:\n' +
    '  cli.mjs search <用户原问题|@question_file|-> [--top-k N]\n' +
    '  cli.mjs discover <用户原问题|@question_file|-> [--top-k N]  # search 别名\n' +
    "  cli.mjs call <toolName> '<目标参数JSON>|@params_file|-'\n" +
    '  cli.mjs list-tools [wind_tools]         # 获取统一入口线上定义\n' +
    '  cli.mjs list-servers [wind_tools]       # 离线查看连接信息\n' +
    '  cli.mjs open-portal\n' +
    '  cli.mjs setup-key <KEY> [--scope <global|skill>]\n' +
    '  cli.mjs update [--force]               # 前台检查更新，--force 立即重新检查\n' +
    '  cli.mjs diagnose                       # 只读查看版本、来源标识和更新状态\n\n' +
    '调用来源自动识别；--user-agent 或 WIND_USER_AGENT 可覆盖。Node.js 18+。\n' +
    '典型:\n  ' + CALL_EXAMPLES.join('\n  ');
}

// ---------- 主入口 ----------

const MIN_NODE_MAJOR = 18;

export async function main(argv) {
  const parsed = parseUserAgentOption(argv);
  const [cmd, ...args] = parsed.args;
  cliIdentity = detectAgentIdentity(parsed.userAgent);
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(usageText() + '\n');
    return;
  }
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < MIN_NODE_MAJOR) {
    throw new CliError('SETUP_ERROR', `需要 Node.js ${MIN_NODE_MAJOR} 或更高版本，当前为 ${process.version}`);
  }
  const run = COMMANDS[cmd];
  if (!run) throw new CliError('USAGE_ERROR', `未知命令: ${cmd}\nUSAGE:\n${usageText()}`);

  const data = await run(args);
  if (['call', 'search', 'discover'].includes(cmd)) {
    const output = normalizeCallSuccess(data.result, { server_type: data.server_type, tool_name: data.tool });
    if (isServerToolError(output)) {
      writeJson(output);
      process.exitCode = 1;
      return;
    }
    output.cli_meta = { ...output.cli_meta, user_agent: data.userAgent.value, user_agent_source: data.userAgent.source };
    writeJson(output);
    triggerUpdateCheck();
  } else {
    writeJson(data);
    if (cmd === 'update' && data.status === 'failed') process.exitCode = 1;
  }
}

// 只有直接运行才执行；被测试 import 时无副作用。
const IS_MAIN = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (IS_MAIN) main(process.argv.slice(2)).catch(fail);
