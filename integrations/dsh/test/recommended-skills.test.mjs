// 对 integrations/dsh/recommended-skills.json 的契约测试。
//
// 设计意图：DSH 的数据取数走 MCP 原生工具，不再叠加 wind-mcp-skill 的 CLI 路由守则；
// 只挑"带资产（references/scripts）、属于方法论/流程"的 skill 进 DSH 的 skill 目录。
// 这些断言把该意图固定下来，避免以后被"顺手全量安装"改回去。
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = join(HERE, '..')
const REPO_ROOT = join(PKG_DIR, '..', '..')
const SKILLS_DIR = join(REPO_ROOT, 'skills')
const MANIFEST = join(PKG_DIR, 'recommended-skills.json')

function manifest() {
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}

/** 取出 SKILL.md 的 YAML frontmatter。 */
function frontmatter(skillName) {
  const text = readFileSync(join(SKILLS_DIR, skillName, 'SKILL.md'), 'utf8')
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  assert.ok(match, `${skillName}/SKILL.md 缺少 YAML frontmatter`)
  return yaml.load(match[1])
}

describe('recommended-skills.json 结构', () => {
  test('存在且是合法 JSON', () => {
    assert.ok(existsSync(MANIFEST), 'recommended-skills.json 不存在')
    assert.ok(Array.isArray(manifest().recommended))
    assert.ok(Array.isArray(manifest().excluded))
  })

  test('推荐列表非空，每项都有 name 和 reason', () => {
    const { recommended } = manifest()
    assert.ok(recommended.length > 0)
    for (const item of recommended) {
      assert.equal(typeof item.name, 'string')
      assert.ok(item.name.length > 0, 'name 不能为空')
      assert.equal(typeof item.reason, 'string')
      assert.ok(item.reason.length > 0, `${item.name} 缺少 reason`)
    }
  })

  test('推荐与排除不重叠', () => {
    const { recommended, excluded } = manifest()
    const overlap = recommended.map((i) => i.name).filter((n) => excluded.some((e) => e.name === n))
    assert.deepEqual(overlap, [], '同一个 skill 不能既推荐又排除')
  })
})

describe('DSH skill-filesystem 兼容性', () => {
  test('每个被引用的 skill 都真实存在', () => {
    const { recommended, excluded } = manifest()
    for (const item of [...recommended, ...excluded]) {
      assert.ok(existsSync(join(SKILLS_DIR, item.name, 'SKILL.md')), `skills/${item.name}/SKILL.md 不存在`)
    }
  })

  test('推荐 skill 的 frontmatter 满足 DSH 的 name/description 要求', () => {
    for (const item of manifest().recommended) {
      const meta = frontmatter(item.name)
      assert.equal(meta.name, item.name, `${item.name} 的 frontmatter name 与目录名不一致`)
      assert.equal(typeof meta.description, 'string')
      assert.ok(meta.description.trim().length > 0, `${item.name} 的 description 为空`)
    }
  })

  test('只推荐带资产（references/ 或 scripts/）的 skill，不推纯提示词', () => {
    for (const item of manifest().recommended) {
      const dir = join(SKILLS_DIR, item.name)
      const hasAssets = ['references', 'scripts'].some((sub) => {
        const path = join(dir, sub)
        return existsSync(path) && statSync(path).isDirectory()
      })
      assert.ok(hasAssets, `${item.name} 没有 references/ 或 scripts/，不该进推荐列表`)
    }
  })

  test('推荐数量保持克制（≤ 8 个），避免目录过长导致路由歧义', () => {
    assert.ok(manifest().recommended.length <= 8, '推荐列表过长会让模型在 skill 目录里选错')
  })
})

describe('设计意图的不变量', () => {
  test('wind-mcp-skill 必须被排除：DSH 用 MCP 原生工具，不叠加 CLI 路由守则', () => {
    const names = manifest().excluded.map((i) => i.name)
    assert.ok(names.includes('wind-mcp-skill'), 'wind-mcp-skill 必须显式排除并写明理由')
  })

  test('被排除的项必须写明理由', () => {
    for (const item of manifest().excluded) {
      assert.equal(typeof item.reason, 'string')
      assert.ok(item.reason.trim().length > 0, `${item.name} 缺少排除理由`)
    }
  })
})
