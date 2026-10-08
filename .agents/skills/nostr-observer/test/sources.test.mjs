import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sourceIndex } from '../scripts/sources.mjs'
import { digest } from '../scripts/corpus.mjs'
import { resolve } from '../scripts/resolve.mjs'
import { check, attributes, toPermalink, toStreamLink, toListingLink, toCalendarLink, toAppLink, toGitLink } from '../scripts/validate.mjs'

const event = (n, kind, content = '') => ({
  id: n.toString(16).padStart(64, '0'), pubkey: 'ab'.repeat(32), kind,
  created_at: 1_786_900_000, content, tags: [['d', `entry-${n}`]],
})
const note = event(1, 1, 'A source sentence, exactly as it was posted.')
const stream = event(2, 30311)
const listing = event(3, 30402)
const calendar = event(4, 31923)
const app = event(5, 32267)
const repo = event(6, 30617)
const corpus = {
  observerNpub: 'reader', relay: 'relay', floor: 20, since: 0, until: 86400, code: 'ABCDEF', overlap: 0,
  desks: { notes: [note], live: [stream], classifieds: [listing], calendar: [calendar], apps: [app], git: [repo] },
  profiles: { [note.pubkey]: { name: 'A writer' } },
  art: [{ id: 'art-1', eventId: note.id, byline: 'A writer', url: 'https://media.example/one.jpg' }],
  control: [event(7, 1, 'Only the control saw this.')],
}

test('aliases survive serialization and refer only to the ranked corpus', () => {
  const first = sourceIndex(corpus)
  const second = sourceIndex(JSON.parse(JSON.stringify(corpus)))
  assert.deepEqual(first, second)
  assert.equal(first.byAlias.get('s1'), note.id)
  assert.equal(first.byAlias.get('s6'), repo.id)
  assert.equal(first.byId.has(corpus.control[0].id), false)
  assert.equal(first.byAlias.has('s7'), false)
})

test('duplicate and mixed-case ids get one alias; post-supplied mappings are ignored', () => {
  const lower = { ...note, id: 'ab'.repeat(32) }
  const duplicate = { ...lower, id: lower.id.toUpperCase() }
  const index = sourceIndex({ desks: { notes: [lower, duplicate] }, sources: { s1: corpus.control[0].id } })
  assert.equal(index.byAlias.size, 1)
  assert.equal(index.byAlias.get('s1'), lower.id)
})

test('digest metadata uses short references without changing source prose', () => {
  const text = digest(corpus)
  assert.match(text, /\[s1\] kind 1/)
  assert.match(text, /source: source:s1/)
  for (const [type, n] of [['watch', 2], ['listing', 3], ['calendar', 4], ['app', 5], ['repo', 6]]) {
    assert.ok(text.includes(`${type}: ${type}:s${n}`))
  }
  assert.ok(text.includes(note.content))
  for (const id of sourceIndex(corpus).byId.keys()) assert.ok(!text.includes(id))
  assert.ok(!text.includes(corpus.control[0].content))
})

test('trimming does not renumber later desks or change the full-corpus measurement', () => {
  const notes = Array.from({ length: 301 }, (_, i) => event(i + 1, 1, 'x'.repeat(700)))
  const large = { ...corpus, desks: { notes, live: [{ ...stream, id: 'f'.repeat(64) }] }, art: [] }
  const full = digest(large, 1_000_000)
  const trimmed = digest(large, 1)
  assert.ok(full.includes('[s301] kind 1'))
  assert.ok(!trimmed.includes('[s301] kind 1'))
  assert.ok(full.includes('watch: watch:s302'))
  assert.ok(trimmed.includes('watch: watch:s302'))
  assert.ok(trimmed.includes('notes: showing 300 of 301'))
  assert.ok(trimmed.includes('301 ranked notes'))
})

const links = [
  ['source:s1', toPermalink(note.id)],
  ['watch:s2', toStreamLink(stream)],
  ['listing:s3', toListingLink(listing)],
  ['calendar:s4', toCalendarLink(calendar)],
  ['app:s5', toAppLink(app)],
  ['repo:s6', toGitLink(repo)],
]

test('every short reference expands to the same verified destination as a legacy citation', () => {
  const page = links.map(([href]) => `<a href="${href}">source</a>`).join('')
  const { html, changes } = resolve(page, corpus)
  assert.deepEqual(attributes(html, 'a', 'href'), links.map(([, href]) => href))
  assert.equal(changes.length, links.length)
  assert.ok(attributes(html, 'a', 'target').every((value) => value === '_blank'))
  assert.deepEqual(check(html, corpus).violations, [])
  assert.equal(resolve(html, corpus).html, html)
})

test('a calendar cited as a source still uses its replaceable address', () => {
  const { html } = resolve('<a href="source:s4">meetup</a>', corpus)
  assert.deepEqual(attributes(html, 'a', 'href'), [toCalendarLink(calendar)])
  assert.deepEqual(check(html, corpus).violations, [])
})

test('unresolved references fail the boundary, including encoded or padded schemes', () => {
  for (const href of [...links.map(([href]) => href), 'source:s99', 'source:garbage', 'SOURCE:S1', ' source:s1', '&#115;ource:s1']) {
    assert.deepEqual(check(`<a href="${href}">source</a>`, corpus).violations.map((v) => v.kind), ['LINK'], href)
  }
})

test('unknown ids and wrong desk types are unwrapped and reported', () => {
  for (const href of ['source:s7', 'source:s999', 'source:s01', 'source:s1?url=evil', 'watch:s1', 'listing:s2', 'calendar:s3', 'app:s4', 'repo:s5']) {
    const { html, changes } = resolve(`<p><a href="${href}">keep this text</a></p>`, corpus)
    assert.equal(html, '<p>keep this text</p>', href)
    assert.deepEqual(changes.map((c) => c.kind), ['unwrapped'], href)
  }
})

test('a desk alias needs the same address fields as a legacy desk link', () => {
  const missing = { ...corpus, desks: { live: [{ ...stream, tags: [] }] }, art: [] }
  const { html, changes } = resolve('<a href="watch:s1">stream</a>', missing)
  assert.equal(html, 'stream')
  assert.equal(changes[0].kind, 'unwrapped')
})

test('resolution changes actual attributes, leaving href/src text inside captions alone', () => {
  const page = `<a title='href="watch:s2" and 1 > 0' href=source:s1>source</a>
    <img alt='src="art-9" and 1 > 0' src="art-1">`
  const { html } = resolve(page, corpus)
  assert.deepEqual(attributes(html, 'a', 'href'), [toPermalink(note.id)])
  assert.deepEqual(attributes(html, 'a', 'title'), ['href="watch:s2" and 1 > 0'])
  assert.deepEqual(attributes(html, 'img', 'src'), [corpus.art[0].url])
  assert.deepEqual(attributes(html, 'img', 'alt'), ['src="art-9" and 1 > 0'])
  assert.deepEqual(check(html, corpus).violations, [])
})
