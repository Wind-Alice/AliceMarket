#!/usr/bin/env node
// wind-mcp-skill CLI 入口：命令分发、参数读取、信封输出与退出码。Agent 只读 stdout。
// Wind MCP 客户端逻辑在 mcp.mjs，自动更新在 update-check.mjs。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CliError, SERVERS, SKILL_DIR, SKILL_VERSION, buildToolArguments, mcpInitializeAndCall,
  normalizeCallSuccess, openDeveloperPortal, resolveServerType, serverListEntries, serverTypeList,
  stripBom, writeApiKey,
} from './mcp.mjs';
import { diagnoseUpdate, triggerUpdateCheck } from './update-check.mjs';

const CALL_EXAMPLES = [
  `cli.mjs call stock_research stock_screener '{"question":"筛选沪深市场市值超500亿且连续5日上涨的股票"}'`,
  `cli.mjs call stock_research stock_get_company_profile '{"windCode":"600519.SH"}'`,
  `cli.mjs call fund_research fund_get_basic_info '{"windCodes":["005827.OF"]}'`,
  `cli.mjs call general_data quote_get_realtime_indicators '{"windCodes":["600519.SH"],"indexes":"最新成交价,涨跌幅"}'`,
  `cli.mjs call company_data company_search_entity '{"searchKey":"贵州茅台"}'`,
  `cli.mjs call edb_data economic_search_indicator '{"question":"中国GDP相关指标"}'`,
  `cli.mjs call index_data get_index_kline '{"windcode":"000300.SH","begin_date":"2026-04-01","end_date":"2026-04-30"}'`,
  `cli.mjs call financial_docs get_financial_news '{"query":"美联储利率政策","top_k":3}'`,
  `cli.mjs call analytics_data get_financial_data '{"question":"查询中国A股市场过去一年的平均成交量"}'`,
];

// 有默认文案的错误码：detail 优先（截 500 字），否则用默认文案。其余错误码（如 backend_error）
// 直接透传后端信息（截 2000 字）。
const DEFAULT_ERROR_MESSAGES = {
  AUTH_ERROR: '认证失败，请检查 API Key',
  PARAM_TYPE_ERROR: '参数类型错误，请检查字段类型',
  USAGE_ERROR: '命令用法错误，请检查输入参数',
  PARAMS_FILE_ERROR: '参数文件读取失败，请检查文件路径和内容',
  INVALID_PARAMS_JSON: '参数格式错误，params 必须是 JSON 对象',
  ROUTE_ERROR: '工具路由失败，请检查 server_type 和 tool_name',
  PARAM_VALIDATION_ERROR: '参数校验失败，请检查字段名和取值',
  PARAM_CONFLICT_ERROR: '参数存在冲突，请检查输入组合',
  RATE_LIMIT_ERROR: '请求过于频繁，请稍后重试',
  NETWORK_ERROR: '服务暂时不可用，请稍后重试',
  TOOL_RUNTIME_ERROR: '响应解析失败，请稍后重试',
  SETUP_ERROR: '本地配置缺失或无效，请检查技能配置',
};
const UNKNOWN_ERROR_MESSAGE = '调用失败，请稍后重试';

// ---------- 输出 ----------

function writeJson(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function errorMessage(code, detail, metadata) {
  const text = typeof detail === 'string' ? detail.trim() : '';
  if (Object.hasOwn(DEFAULT_ERROR_MESSAGES, code)) {
    return text ? text.slice(0, 500) : DEFAULT_ERROR_MESSAGES[code];
  }
  const backendText = typeof metadata?.error_message === 'string' ? metadata.error_message.trim() : '';
  return backendText || (text ? text.slice(0, 2000) : UNKNOWN_ERROR_MESSAGE);
}

// 唯一的失败出口：写 {ok:false, code, message} 信封并退出。
function fail(err) {
  const isCliError = err instanceof CliError;
  const code = isCliError ? err.code : 'UNKNOWN';
  const detail = isCliError ? err.detail
    : `执行失败: ${err?.message || err}${err?.stack ? ' | stack: ' + err.stack.slice(0, 300) : ''}`;
  writeJson({ ok: false, code, message: errorMessage(code, detail, isCliError ? err.metadata : {}) });
  process.exit(isCliError ? err.exitCode : 1);
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

async function cmdCall([serverType, toolName, paramsInput]) {
  if (!serverType || !toolName || !paramsInput) {
    throw new CliError('USAGE_ERROR', `USAGE:\n${callUsage()}`);
  }
  const server_type = resolveServerType(serverType);
  const params = parseParams(paramsInput);
  const result = await mcpInitializeAndCall(server_type, 'tools/call', {
    name: toolName,
    arguments: buildToolArguments(server_type, toolName, params),
    _meta: { clientVersion: SKILL_VERSION },
  });
  return { server_type, tool: toolName, result };
}

async function cmdListTools([serverType]) {
  if (!serverType) {
    throw new CliError('USAGE_ERROR', `USAGE:\n用法：list-tools <server_type>\n可用 server_type: ${serverTypeList()}`);
  }
  const server_type = resolveServerType(serverType);
  const result = await mcpInitializeAndCall(server_type, 'tools/list', {});
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

const COMMANDS = {
  call: cmdCall,
  'list-tools': cmdListTools,
  'list-servers': cmdListServers,
  'setup-key': cmdSetupKey,
  'open-portal': () => openDeveloperPortal(),
  diagnose: () => diagnoseUpdate(SKILL_DIR),
};

// ---------- 用法 ----------

function callUsage() {
  return `用法：call <server_type> <tool_name> '<params_json>|@params_file|-'\n` +
    `可用 server_type: ${serverTypeList()}\n` +
    `典型：\n  ${CALL_EXAMPLES.join('\n  ')}`;
}

function usageText() {
  return 'wind-mcp-skill\n' +
    '访问万得 Wind 金融数据（按数据域分类调用）\n\n' +
    '用法:\n' +
    `  cli.mjs call <server_type> <tool_name> '<params_json>|@params_file|-'\n` +
    '  cli.mjs list-tools <server_type>                    # 获取后端官方工具描述和 inputSchema\n' +
    '  cli.mjs list-servers [server_type]                 # 离线查看主站地址、请求头和认证变量\n' +
    '  cli.mjs open-portal                                # 打开万得开发者中心拿 API Key\n' +
    '  cli.mjs setup-key <KEY> [--scope <global|skill>]   # 写入 API Key；默认 scope=global\n' +
    '  cli.mjs diagnose                                   # 查看自动更新状态（只读）\n\n' +
    '通用金融服务名为 general_data；finance_data 作为兼容名同样可用于 call / list-tools / list-servers。\n\n' +
    '可用 server_type:\n' +
    Object.entries(SERVERS).map(([name, server]) => `  ${name.padEnd(20)}${server.label}`).join('\n') + '\n\n' +
    '典型:\n' +
    `  ${CALL_EXAMPLES.join('\n  ')}`;
}

// ---------- 主入口 ----------

const MIN_NODE_MAJOR = 18;

async function main([cmd, ...args]) {
  if (!cmd) {
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
  if (cmd === 'call') {
    // 透传 MCP result 并附 cli_meta；只有成功的数据调用才触发每日后台更新检查。
    writeJson(normalizeCallSuccess(data.result, { server_type: data.server_type, tool_name: data.tool }));
    triggerUpdateCheck(SKILL_DIR);
  } else {
    writeJson(data);
  }
}

// 只有直接运行才执行；被测试 import 时无副作用。
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (IS_MAIN) main(process.argv.slice(2)).catch(fail);
