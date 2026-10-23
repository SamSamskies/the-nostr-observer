import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { layoutWarnings } from '../scripts/layout.mjs'
import { check } from '../scripts/validate.mjs'
import { resolve } from '../scripts/resolve.mjs'

const css = readFileSync(new URL('../reference/house.css', import.meta.url), 'utf8')
const corpus = {
  desks: { notes: [] }, control: [],
  art: [{ id: 'art-1', url: 'https://media.example/portrait.jpg', width: 1848, height: 4096 }],
}
const page = (body, custom = '') => `<html><head><style>${css}</style><style>${custom}</style></head><body>${body}</body></html>`
const columns = '<main class="fold"><div class="col span-7">Lead</div><div class="col span-5">Sidebar</div></main>'

test('the missing seven-track span that collapsed the lead is reported once', () => {
  const warnings = layoutWarnings(page(columns + '<div class="span-7">Another</div>'), corpus)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].kind, 'SPAN')
  assert.match(warnings[0].detail, /\.span-7 has no selector/)
})

test('documented spans and explicitly styled departures do not get missing-selector warnings', () => {
  assert.deepEqual(layoutWarnings(page(columns.replace('span-7', 'span-6')), corpus), [])
  assert.deepEqual(layoutWarnings(page(columns, '.fold > .span-7 { grid-column: span 7; } @media (max-width: 1000px) { .fold > .span-7 { grid-column: span 6; } }'), corpus), [])
  assert.deepEqual(layoutWarnings(page('<div class="span-7" style="grid-column: span 7">Lead</div>'), corpus), [])
  assert.deepEqual(layoutWarnings(page('<div class="custom-editorial-group">Lead</div>'), corpus), [])
})

test('comments, attribute text and quoted CSS cannot define an absent span selector', () => {
  const decoys = `/* .span-7 { grid-column: span 7 } */
    .label::after { content: ".span-7 { grid-column: span 7 }"; }
    [data-note=".span-7"] { color: red; }
    @supports (selector(.span-7)) { .other { color: red; } }`
  assert.equal(layoutWarnings(page(columns, decoys), corpus).filter(w => w.kind === 'SPAN').length, 1)
  assert.deepEqual(layoutWarnings(page('<!-- <div class="span-99">example</div> -->', '.label::after { content: "<div class=span-99>"; }'), corpus), [])
})

test('selector extraction handles quoted braces, escaped quotes and nested media rules', () => {
  const custom = `.label::after { content: "\\\" } /* "; }
    @media (min-width: 1001px) { .fold > .span-7 { grid-column: span 7; } }`
  assert.deepEqual(layoutWarnings(page(columns, custom), corpus), [])
})

test('only used tall shortlisted pictures get dimension reminders, without fetching', () => {
  assert.deepEqual(layoutWarnings(page('<p>No picture today.</p>'), corpus), [])
  for (const src of ['art-1', corpus.art[0].url]) {
    const warnings = layoutWarnings(page(`<img src="${src}" alt="a > b">`), corpus)
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].kind, 'PORTRAIT')
    assert.match(warnings[0].detail, /1848x4096 \(2\.2 times/)
  }
  for (const dimensions of [{ width: null, height: null }, { width: 0, height: 4000 }, { width: 1000, height: 800 }]) {
    assert.deepEqual(layoutWarnings(page('<img src="art-1">'), { ...corpus, art: [{ ...corpus.art[0], ...dimensions }] }), [])
  }
})

test('portrait reminders remain factual for an intentionally cropped image', () => {
  const warnings = layoutWarnings(page('<img class="crop" src="art-1">', '.crop { max-height: 540px; object-fit: cover; }'), corpus)
  assert.equal(warnings[0].kind, 'PORTRAIT')
  assert.match(warnings[0].detail, /does not evaluate existing CSS/)
})

test('layout reminders reach validation without becoming safety violations', () => {
  const draft = page(columns + '<figure><img src="art-1" alt="Portrait"></figure>')
  const { html } = resolve(draft, corpus)
  const result = check(html, corpus)
  assert.deepEqual(result.violations, [])
  assert.deepEqual(result.layout.map(w => w.kind), ['SPAN', 'PORTRAIT'])
})

test('combining .col and .story on the same element triggers a NESTING reminder', () => {
  const badPage = page('<main class="fold"><article class="col span-8 story"><h2>Headline</h2></article></main>')
  const warnings = layoutWarnings(badPage, corpus)
  const nesting = warnings.filter(w => w.kind === 'NESTING')
  assert.equal(nesting.length, 1)
  assert.match(nesting[0].detail, /combines \.col and \.story on one element/)

  const goodPage = page('<main class="fold"><div class="col span-8"><article class="story"><h2>Headline</h2></article></div></main>')
  assert.equal(layoutWarnings(goodPage, corpus).filter(w => w.kind === 'NESTING').length, 0)
})
