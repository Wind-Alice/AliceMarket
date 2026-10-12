// DeepSeek Harness（DSH）集成 bundle 的契约测试。
//
// 这些测试不依赖 DSH 安装：它们用 DSH 自己的解析方式（js-yaml JSON_SCHEMA + !!js 标量标签）
// 读取 cordis.patch.yml，并用 DSH Loader 的求值函数验证 !!js 表达式语义。
//
// 运行：npm install && npm test
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = join(HERE, '..')
const REPO_ROOT = join(PKG_DIR, '..', '..')
const MANIFEST = join(PKG_DIR, 'package.json')
const PATCH = join(PKG_DIR, 'cordis.patch.yml')
const CLI = join(REPO_ROOT, 'skills', 'wind-mcp-skill', 'scripts', 'cli.mjs')

// ---------------------------------------------------------------------------
// DSH 的 entry-list 方言，逐字对应 @deepseek-ai/cordis-plugin-include 的实现：
//   const JsExpr = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', ... })
//   export const entryListSchema = yaml.JSON_SCHEMA.extend(JsExpr)
// ---------------------------------------------------------------------------
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
})
const entryListSchema = yaml.JSON_SCHEMA.extend(JsExpr)

// Loader 的求值器，逐字对应 @deepseek-ai/cordis-plugin-loader/src/config/utils.ts
const evaluate = new Function('ctx', 'expr', 'with (ctx) { return eval(expr) }')

const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

function loadPatch() {
  return yaml.load(readFileSync(PATCH, 'utf8'), { schema: entryListSchema })
}

function rows() {
  return loadPatch().flatMap((entry) => entry.insert ?? [])
}

/** 按 DSH 的方式求值每行的 Authorization 头。 */
function authHeader(row) {
  return evaluate({}, row.config.headers.Authorization.__jsExpr)
}

/** 临时改写环境变量（含 HOME），跑完恢复。 */
function withEnv(overrides, fn) {
  const saved = new Map()
  for (const [key, value] of Object.entries(overrides)) {
    saved.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

/** 造一个只有（或没有）~/.wind-aifinmarket/config 的临时 HOME。 */
function makeHome(configLine) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-wind-home-'))
  if (configLine !== undefined) {
    mkdirSync(join(home, '.wind-aifinmarket'), { recursive: true })
    writeFileSync(join(home, '.wind-aifinmarket', 'config'), configLine)
  }
  return home
}

describe('DSH bundle 清单', () => {
  test('package.json 声明了 dsh.bundle.patch', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
    assert.equal(manifest.private, true, 'bundle 必须是 private，避免误发布到 npm')
    assert.equal(typeof manifest.dsh?.bundle?.patch, 'string')
    assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  })

  test('声明的 patch 文件存在', () => {
    assert.ok(existsSync(PATCH), `${PATCH} 不存在`)
  })

  test('不声明任何运行时依赖：随 DSH 安装的包由 dsh 解析', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
    assert.deepEqual(manifest.dependencies ?? {}, {})
  })
})

describe('Loader patch 方言', () => {
  test('解析为顶层数组', () => {
    assert.ok(Array.isArray(loadPatch()), '顶层必须是数组')
  })

  test('插入列表非空，且每行都有唯一 id', () => {
    const list = rows()
    assert.ok(list.length > 0, '没有任何 insert 行')
    assert.equal(list.length, 7, '应覆盖 Wind 的 7 个 MCP 服务')
    const ids = list.map((row) => row.id)
    assert.equal(new Set(ids).size, ids.length, 'row id 必须唯一')
    for (const row of list) {
      assert.equal(typeof row.id, 'string')
      assert.ok(row.id.length > 0)
    }
  })
})

describe('mcp-client 行契约', () => {
  test('每行都指向 @deepseek-ai/dsh-mcp-client', () => {
    for (const row of rows()) {
      assert.equal(row.name, '@deepseek-ai/dsh-mcp-client', `${row.id} 的 name 不对`)
    }
  })

  test('serverName 合法且唯一', () => {
    const names = rows().map((row) => row.config.serverName)
    for (const name of names) {
      assert.match(name, SERVER_NAME_PATTERN, `serverName ${name} 不满足 DSH 约束`)
    }
    assert.equal(new Set(names).size, names.length, 'serverName 必须唯一')
  })

  test('transport 为 streamable-http，url 是 https 且以 /mcp/ 结尾', () => {
    for (const row of rows()) {
      const { transport, url } = row.config
      assert.equal(transport, 'streamable-http', `${row.id} 的 transport 不对`)
      assert.match(url, /^https:\/\/mcp\.wind\.com\.cn\/vserver_[a-z_]+\/mcp\/$/, `${row.id} 的 url 不是 Wind 端点：${url}`)
    }
  })

  test('超时与失败策略字段类型正确', () => {
    for (const row of rows()) {
      assert.equal(typeof row.config.toolCallTimeoutMs, 'number')
      assert.ok(row.config.toolCallTimeoutMs > 0)
      assert.equal(typeof row.config.failOnStartupError, 'boolean')
    }
  })
})

describe('凭据处理', () => {
  test('Authorization 一律是 !!js 表达式，不落明文', () => {
    for (const row of rows()) {
      const auth = row.config.headers?.Authorization
      assert.ok(auth && typeof auth === 'object' && typeof auth.__jsExpr === 'string', `${row.id} 的 Authorization 不是 !!js 表达式`)
    }
  })

  test('patch 文件里不含任何密钥字面量', () => {
    const text = readFileSync(PATCH, 'utf8')
    assert.doesNotMatch(text, /ak_[A-Za-z0-9]{8,}/, 'patch 里出现了疑似 API Key')
    assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9]{16,}/, 'patch 里出现了明文 Bearer token')
  })

  test('没有配置任何 Key 时退化为 "Bearer "，不抛异常', () => {
    const home = makeHome(undefined)
    try {
      withEnv({ HOME: home, WIND_API_KEY: undefined }, () => {
        for (const row of rows()) assert.equal(authHeader(row), 'Bearer ')
      })
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('读取 ~/.wind-aifinmarket/config（与 wind-mcp-skill CLI 同一份配置）', () => {
    const home = makeHome('# Wind key\nWIND_API_KEY=ak_test_from_file\n')
    try {
      withEnv({ HOME: home, WIND_API_KEY: undefined }, () => {
        for (const row of rows()) assert.equal(authHeader(row), 'Bearer ak_test_from_file')
      })
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('环境变量 WIND_API_KEY 优先于配置文件', () => {
    const home = makeHome('WIND_API_KEY=ak_test_from_file\n')
    try {
      withEnv({ HOME: home, WIND_API_KEY: 'ak_test_from_env' }, () => {
        for (const row of rows()) assert.equal(authHeader(row), 'Bearer ak_test_from_env')
      })
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

// DSH 侧的 serverName ←→ wind-mcp-skill 的 server_type。
// 这是本 bundle 的规格（短名便于阅读工具名），下面用 CLI 的真实服务表交叉校验，防止漂移。
const SERVER_NAME_BY_TYPE = {
  stock_data: 'wind_stock',
  fund_data: 'wind_fund',
  index_data: 'wind_index',
  bond_data: 'wind_bond',
  financial_docs: 'wind_docs',
  economic_data: 'wind_economic',
  analytics_data: 'wind_analytics',
}

/** 解析 wind-mcp-skill/scripts/cli.mjs 的 SERVERS 表（唯一真源）。 */
function cliServers() {
  const source = readFileSync(CLI, 'utf8')
  const block = source.match(/const SERVERS = \{([\s\S]*?)\n\};/)
  assert.ok(block, 'cli.mjs 里找不到 SERVERS 表')
  const entries = [...block[1].matchAll(/^[ \t]{2}(\w+):[ \t]*\{[ \t]*\r?\n[ \t]*endpoint:[ \t]*'([^']+)'/gm)]
  return new Map(entries.map((m) => [m[1], m[2]]))
}

describe('与 wind-mcp-skill CLI 的端点一致性', () => {
  test('cli.mjs 的 SERVERS 表可被解析，且与规格表的键一致', () => {
    const servers = cliServers()
    assert.equal(servers.size, 7, 'cli.mjs 的 SERVERS 表应有 7 项')
    assert.deepEqual([...servers.keys()].sort(), Object.keys(SERVER_NAME_BY_TYPE).sort(), 'CLI 的服务列表变了，bundle 规格需要同步')
  })

  test('bundle 的端点集合与 CLI 完全一致（没有臆造或拼错的 URL）', () => {
    const bundleEndpoints = new Set(rows().map((row) => row.config.url))
    assert.deepEqual([...bundleEndpoints].sort(), [...new Set(cliServers().values())].sort())
  })

  test('每行的 serverName 与规格表一一对应', () => {
    const urlToType = new Map([...cliServers()].map(([type, url]) => [url, type]))
    for (const row of rows()) {
      const serverType = urlToType.get(row.config.url)
      assert.ok(serverType, `${row.id} 的 url 不在 CLI 的 SERVERS 表里`)
      assert.equal(row.config.serverName, SERVER_NAME_BY_TYPE[serverType], `${row.id} 的 serverName 与 ${serverType} 的规格不符`)
    }
  })

  test('没有重复的 serverName（同一注册作用域内会加载失败）', () => {
    const names = rows().map((row) => row.config.serverName)
    assert.equal(new Set(names).size, names.length)
  })
})

describe('按需裁剪仍然合法', () => {
  test('只保留任意单个域时，行契约依旧成立', () => {
    for (const row of rows()) {
      assert.match(row.config.serverName, SERVER_NAME_PATTERN)
      assert.equal(row.config.transport, 'streamable-http')
      assert.equal(typeof evaluate({}, row.config.headers.Authorization.__jsExpr), 'string')
    }
  })
})

describe('线上连通性（需要 WIND_API_KEY，未配置时跳过）', () => {
  test('每个端点都能用 Bearer token 完成 initialize 握手', async (t) => {
    if (!process.env.WIND_API_KEY) {
      t.skip('未设置 WIND_API_KEY，跳过线上冒烟测试')
      return
    }
    for (const row of rows()) {
      const response = await fetch(row.config.url, {
        method: 'POST',
        headers: {
          Authorization: authHeader(row),
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dsh-integration-test', version: '1.0.0' } },
        }),
        signal: AbortSignal.timeout(30_000),
      })
      assert.equal(response.status, 200, `${row.config.serverName} 握手失败：HTTP ${response.status}`)
    }
  })
})
