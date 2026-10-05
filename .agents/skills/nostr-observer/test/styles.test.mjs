import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { applyHouseStyle } from '../scripts/styles.mjs'
import { check, attributes, toPermalink } from '../scripts/validate.mjs'
import { setAttribute } from '../scripts/html.mjs'
import { resolve } from '../scripts/resolve.mjs'

const css = readFileSync(new URL('../reference/house.css', import.meta.url), 'utf8')
const id = 'ab'.repeat(32)
const corpus = { desks: { notes: [{ id, content: 'The source sentence.' }] }, control: [], art: [] }
const page = '<!doctype html><html><head data-note="1 > 0"><title>Paper</title><style>.lead-head { font-size: 3rem; }</style></head><body><q>The source sentence.</q><a href="source:s1">source</a></body></html>'

test('the complete house stylesheet is inserted before unchanged custom styles', () => {
  const html = applyHouseStyle(page, css)
  assert.ok(html.includes(`<style id="observer-house">\n${css}\n</style>`))
  assert.ok(html.indexOf('id="observer-house"') < html.indexOf('.lead-head { font-size: 3rem; }'))
  assert.ok(html.endsWith(page.slice(page.indexOf('<body>'))))
  assert.equal(applyHouseStyle(html, css), html)
})

test('an older edition with the exact stylesheet gets no second copy', () => {
  const legacy = page.replace('<title>Paper</title>', `<title>Paper</title><style>\n${css}\n</style>`)
  const html = applyHouseStyle(legacy, css)
  assert.equal(html.split(css).length - 1, 1)
  assert.deepEqual(attributes(html, 'style', 'id'), ['observer-house'])
  assert.equal(applyHouseStyle(html, css), html)
})

test('inserting house CSS does not hide an unsafe custom stylesheet', () => {
  const unsafe = page.replace('.lead-head { font-size: 3rem; }', '@import "https://evil.example/track.css";')
  const { html } = resolve(unsafe, corpus, { houseCss: css })
  assert.ok(html.includes('@import "https://evil.example/track.css";'))
  assert.ok(check(html, corpus).violations.some((v) => v.kind === 'MARKUP'))
})

test('reserved CSS cannot be replaced silently or hidden outside the head', () => {
  assert.throws(() => applyHouseStyle(page.replace('<style>', '<style id="observer-house">'), css), /differs/)
  const valid = applyHouseStyle(page, css)
  assert.throws(() => applyHouseStyle(valid.replace('</head>', `<style id="observer-house">${css}</style></head>`), css), /More than one/)
  assert.throws(() => applyHouseStyle(`<html><head></head><body><style id="observer-house">${css}</style></body></html>`, css), /outside/)
  assert.throws(() => applyHouseStyle('<head><style id="observer-house">', css), /closing/)
})

test('a partial or ambiguous document fails before stylesheet insertion', () => {
  for (const html of ['<p>fragment</p>', '<head><title>unfinished</title>', '<head></head><head></head>']) {
    assert.throws(() => applyHouseStyle(html, css), /head/)
  }
})

test('attribute replacement handles boolean and duplicate attributes', () => {
  assert.equal(setAttribute('<a target href="source:s1">', 'target', '_blank'), '<a target="_blank" href="source:s1">')
  assert.equal(setAttribute('<a href="source:s1" href="source:s99">', 'href', 'canonical'), '<a href="canonical" href="canonical">')
})

test('resolve CLI works outside the skill directory and its output passes validation', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'observer-tokens-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const script = fileURLToPath(new URL('../scripts/resolve.mjs', import.meta.url))
  const file = join(dir, 'paper.html')
  const record = join(dir, 'corpus.json')
  writeFileSync(file, page)
  writeFileSync(record, JSON.stringify(corpus))
  const args = [script, file, '--corpus', record]
  execFileSync(process.execPath, args, { cwd: dir })
  const compiled = readFileSync(file, 'utf8')
  assert.ok(compiled.includes(css))
  assert.deepEqual(attributes(compiled, 'a', 'href'), [toPermalink(id)])
  assert.deepEqual(check(compiled, corpus).violations, [])
  execFileSync(process.execPath, args, { cwd: dir })
  assert.equal(readFileSync(file, 'utf8'), compiled)

  writeFileSync(file, '<p>unfinished paper</p>')
  assert.throws(() => execFileSync(process.execPath, args, { cwd: dir, stdio: 'pipe' }), /Resolution failed/)
  assert.equal(readFileSync(file, 'utf8'), '<p>unfinished paper</p>')
})
