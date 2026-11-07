#!/usr/bin/env node

import fs from 'node:fs'

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.scss', '.css']
const colorPattern = /(?<![\w-])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])|\brgba?\([^)]+\)|\bhsla?\([^)]+\)/g

function readInputs(argv) {
  const files = []
  const listedMissing = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--changed-files') {
      const list = argv[index + 1]
      if (!list) throw new Error('--changed-files 缺少文件路径')
      const listed = fs.readFileSync(list, 'utf8').split(/\r?\n/).map((file) => file.trim()).filter(Boolean)
      files.push(...listed.filter((file) => fs.existsSync(file)))
      listedMissing.push(...listed.filter((file) => !fs.existsSync(file)))
      index += 1
    } else if (argv[index].startsWith('--')) {
      throw new Error(`不支持参数：${argv[index]}`)
    } else {
      if (!fs.existsSync(argv[index])) throw new Error(`文件不存在：${argv[index]}`)
      files.push(argv[index])
    }
  }
  listedMissing.forEach((file) => console.error(`[CODE-REVIEW:hardcoded-color] 跳过不存在的 changed file：${file}`))
  return files
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => fs.existsSync(file))
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .filter((file) => !/(^|\/)(e2e|testing|__tests__|test|tests|mock)(\/|$)/.test(file))
    .filter((file) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file))
}

function commentRanges(content) {
  const ranges = []
  let quote = null
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    const next = content[index + 1]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
    } else if (char === '/' && next === '/') {
      const end = content.indexOf('\n', index + 2)
      ranges.push([index, end === -1 ? content.length : end])
      index = (end === -1 ? content.length : end) - 1
    } else if (char === '/' && next === '*') {
      const close = content.indexOf('*/', index + 2)
      const end = close === -1 ? content.length : close + 2
      ranges.push([index, end])
      index = end - 1
    }
  }
  return ranges
}

function lineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0) throw new Error('请传入 changed code 文件，或使用 --changed-files <文件清单>')
  const files = readInputs(argv)

  const findings = []
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const ranges = file.endsWith('.scss') || file.endsWith('.css') ? [] : commentRanges(content)
    for (const match of content.matchAll(colorPattern)) {
      const index = match.index ?? 0
      if (ranges.some(([start, end]) => index >= start && index < end)) continue
      findings.push(`${file}:${lineNumber(content, index)} 候选硬编码色值 ${match[0]}`)
    }
  }

  findings.forEach((finding) => console.error(`[CODE-REVIEW:hardcoded-color] ${finding}`))
  if (findings.length > 0) process.exitCode = 1
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 2
}
