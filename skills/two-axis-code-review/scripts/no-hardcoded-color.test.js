const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const script = path.join(__dirname, 'no-hardcoded-color.mjs')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-review-'))

function check(name, content) {
  const file = path.join(dir, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  return spawnSync(process.execPath, [script, file], { encoding: 'utf8' })
}

try {
  const hardcoded = check('Color.tsx', 'export const x = <span style={{ color: "#ffffff" }}>x</span>\n')
  assert.strictEqual(hardcoded.status, 1)
  assert.match(hardcoded.stderr, /#ffffff/)

  assert.strictEqual(check('Comment.tsx', '// PR #246\nexport const x = <span>x</span>\n').status, 0)
  assert.strictEqual(check('Token.tsx', 'export const x = <span style={{ color: token.colorPrimary }}>x</span>\n').status, 0)
  assert.strictEqual(check('mixed.css', '.x { color: var(--text); background: #fff; }\n').status, 1)
  assert.strictEqual(check('Color.test.tsx', 'export const x = "#ffffff"\n').status, 0)
  const missing = spawnSync(process.execPath, [script, path.join(dir, 'missing.tsx')], { encoding: 'utf8' })
  assert.strictEqual(missing.status, 2)
  assert.match(missing.stderr, /文件不存在/)

  const list = path.join(dir, 'changed-files.txt')
  fs.writeFileSync(list, `${path.join(dir, 'deleted.tsx')}\n`)
  const deleted = spawnSync(process.execPath, [script, '--changed-files', list], { encoding: 'utf8' })
  assert.strictEqual(deleted.status, 0)
  assert.match(deleted.stderr, /跳过不存在/)
  console.log('ok - 硬编码色值脚本只报告生产代码候选项')
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}
