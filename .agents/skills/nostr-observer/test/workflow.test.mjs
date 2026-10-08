import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProfile, profilePath, readerProfile, saveProfile, selectReader } from '../scripts/profile.mjs'
import { loadRun, prepare, selectedSources, writerMetadata } from '../scripts/observer.mjs'
import { toNpub } from '../scripts/nostr.mjs'
import { event, fakeRelay } from './fakerelay.mjs'

const OBSERVER = 'aa'.repeat(32)
const SERVICE = 'bb'.repeat(32)
const AUTHOR = 'cc'.repeat(32)
const NPUB = toNpub(OBSERVER)
const READER = readerProfile({ npub: NPUB, timezone: 'America/Chicago' })
const cli = fileURLToPath(new URL('../scripts/observer.mjs', import.meta.url))
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value))

function temporary (t) {
  const directory = mkdtempSync(join(tmpdir(), 'observer workflow '))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function command (args, cwd) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code) => done({ code, stdout, stderr }))
  })
}

function fixtureCorpus () {
  const until = Date.parse('2026-10-07T04:30:00Z') / 1000
  return {
    observer: OBSERVER, observerNpub: NPUB, relay: 'wss://test.example', floor: 20,
    until, since: until - 86400, code: 'ABC123',
    desks: { notes: [event('11'.repeat(32), { pubkey: AUTHOR })] },
    profiles: { [OBSERVER]: { name: 'Reader' }, [AUTHOR]: { name: 'Reporter' } },
    art: [], control: [event('22'.repeat(32), { pubkey: SERVICE, content: 'Control text is not a source.' })], overlap: 0,
  }
}

test('profile is an explicit, canonical reader choice stored outside the skill', (t) => {
  const directory = temporary(t)
  const path = profilePath(directory)
  assert.equal(loadProfile(path), null)
  assert.throws(() => selectReader(null), /Choose a reader explicitly/)
  const saved = saveProfile(path, { npub: ` ${NPUB.toUpperCase()} `, timezone: 'America/Chicago', name: ' Reader ' })
  assert.deepEqual(loadProfile(path), { version: 1, npub: NPUB, timezone: 'America/Chicago', name: 'Reader' })
  assert.deepEqual(Object.keys(saved), ['version', 'npub', 'timezone', 'name'])
  assert.equal(readdirSync(join(directory, '.nostr-observer')).length, 1)
})

test('profile rejects private keys, a bad checksum, invalid zones and markup names', () => {
  for (const npub of [OBSERVER, 'nsec1abc', NPUB.slice(0, -1) + 'x']) assert.throws(() => readerProfile({ npub }))
  assert.throws(() => readerProfile({ npub: NPUB, timezone: 'Mars/Olympus' }), /Unknown timezone/)
  assert.throws(() => readerProfile({ npub: NPUB, name: '<b>Reader</b>' }), /plain-text/)
})

test('reader overrides never transfer a saved name to a different identity or alter storage', (t) => {
  const path = profilePath(temporary(t))
  const saved = saveProfile(path, { npub: NPUB, timezone: 'America/Chicago', name: 'Reader' })
  const other = selectReader(saved, { npub: toNpub(AUTHOR) })
  assert.equal(other.npub, toNpub(AUTHOR))
  assert.equal(other.name, undefined)
  assert.deepEqual(loadProfile(path), saved)
  assert.equal(selectReader(saved, { timezone: 'UTC' }).name, 'Reader')
  assert.equal(selectReader(saved, { npub: NPUB.toUpperCase() }).name, 'Reader')
})

test('a corrupt or unsupported saved profile is refused rather than silently choosing a reader', (t) => {
  const path = join(temporary(t), 'reader.json')
  writeFileSync(path, 'not json')
  assert.throws(() => loadProfile(path))
  writeJson(path, { version: 2, npub: NPUB })
  assert.throws(() => loadProfile(path), /Unsupported/)
})

test('writer metadata uses the reader date across UTC midnight and computes counts', () => {
  const writer = writerMetadata(fixtureCorpus(), READER)
  assert.equal(writer.date, '2026-10-06')
  assert.equal(writer.dateline, 'Tuesday, October 6, 2026')
  assert.equal(writer.windowStamp, '24h to 23:30 CDT')
  assert.equal(writer.asOfStamp, 'As of 23:30 CDT')
  assert.equal(writer.readerLabel, 'Reader')
  assert.deepEqual(writer.counts, { events: 1, voices: 1 })
  assert.equal(writerMetadata(fixtureCorpus(), { ...READER, name: 'Chosen name' }).readerLabel, 'Chosen name')
})

test('writer clock labels distinguish both occurrences of the DST hour', () => {
  const corpus = fixtureCorpus()
  const before = writerMetadata({ ...corpus, until: Date.parse('2026-11-01T06:30:00Z') / 1000 }, READER)
  const after = writerMetadata({ ...corpus, until: Date.parse('2026-11-01T07:30:00Z') / 1000 }, READER)
  assert.equal(before.date, after.date)
  assert.equal(before.windowStamp, '24h to 01:30 CDT')
  assert.equal(after.windowStamp, '24h to 01:30 CST')
})

test('prepare stops before corpus on a failed gate, even beside an older READY file', async (t) => {
  const out = temporary(t)
  writeJson(join(out, 'readiness.json'), { ready: true, state: 'ready' })
  const calls = []
  await assert.rejects(prepare({ reader: READER, out }, async (script) => { calls.push(script); return 1 }), /stopped at readiness/)
  assert.deepEqual(calls, ['readiness.mjs'])
  const run = readdirSync(out).find((name) => name.startsWith('run-'))
  assert.equal(existsSync(join(out, run, 'run.json')), false)
})

test('exit zero with another reader readiness record cannot authorize a pull', async (t) => {
  let pulls = 0
  await assert.rejects(prepare({ reader: READER, out: temporary(t) }, async (script, args) => {
    if (script === 'readiness.mjs') writeJson(args.at(-1), { ready: true, state: 'ready', observer: AUTHOR, relay: 'wss://search.brainstorm.world' })
    else pulls++
    return 0
  }), /did not confirm this reader/)
  assert.equal(pulls, 0)
})

async function savedRun (t) {
  const corpus = fixtureCorpus()
  return prepare({ reader: READER, relay: corpus.relay, out: temporary(t) }, async (script, args, options) => {
    if (script === 'readiness.mjs') writeJson(args.at(-1), { ready: true, state: 'ready', observer: OBSERVER, relay: corpus.relay })
    else { writeJson(args.at(-1), corpus); writeFileSync(options.stdout, 'digest') }
    return 0
  })
}

test('prepared run retrieves selected full ranked sources without including control evidence', async (t) => {
  const { manifestPath, directory } = await savedRun(t)
  const [source] = selectedSources(manifestPath, ['s1'])
  assert.equal(source.byline, 'Reporter')
  assert.equal(source.event.content, 'hello')
  assert.deepEqual(source.event.tags, [])
  assert.equal(source.event.sig, undefined)
  assert.throws(() => selectedSources(manifestPath, ['s2']), /Unknown ranked source/)
  assert.equal(json(join(directory, 'writer.json')).date, '2026-10-06')
})

test('changed corpus and redirected manifest file paths are refused', async (t) => {
  const { manifestPath, directory } = await savedRun(t)
  const manifest = json(manifestPath)
  writeJson(manifestPath, { ...manifest, files: { ...manifest.files, draft: '../other.html' } })
  assert.throws(() => loadRun(manifestPath), /file names have changed/)
  writeJson(manifestPath, manifest)
  writeFileSync(join(directory, manifest.files.corpus), '\n', { flag: 'a' })
  assert.throws(() => loadRun(manifestPath), /saved corpus has changed/)
})

test('real commands prepare through the live gate and finish only validated editions', { timeout: 30000 }, async (t) => {
  const cwd = temporary(t)
  let broken = false
  let deskReads = 0
  const relay = await fakeRelay((filters, sub) => {
    const filter = filters[0]
    const kind = filter.kinds?.[0]
    let events = []
    if (kind === 10002) events = [event('01'.repeat(32), { tags: [['r', 'wss://outbox.example']] })]
    if (kind === 10040 && !broken) events = [event('02'.repeat(32), { tags: [['30382:rank', SERVICE, 'wss://scores.example']] })]
    if (kind === 30382) events = [event('03'.repeat(32), { pubkey: SERVICE })]
    if (kind === 1) events = [event(filter.search.includes('observer:') ? '11'.repeat(32) : '22'.repeat(32), { pubkey: AUTHOR, content: 'The relay is working again.' })]
    if (kind === 0) events = [event('04'.repeat(32), { kind: 0, content: JSON.stringify({ name: 'Reader' }) }), event('05'.repeat(32), { kind: 0, pubkey: AUTHOR, content: JSON.stringify({ name: 'Reporter' }) })]
    if (filter.until) {
      deskReads++
      if (filter.search.includes('observer:')) assert.ok(filter.search.includes('filter:rank:gte:20'))
      else assert.equal(filter.search, 'include:spam sort:rank')
      assert.equal(filter.until - filter.since, 86400)
    }
    return [...events.map((e) => ['EVENT', sub, e]), ['EOSE', sub]]
  })
  t.after(() => relay.close())
  const configured = await command(['profile', 'set', '--npub', NPUB, '--timezone', 'America/Chicago'], cwd)
  assert.equal(configured.code, 0, configured.stderr)
  const prepared = await command(['prepare', '--relay', relay.url], cwd)
  assert.equal(prepared.code, 0, prepared.stderr)
  const out = join(cwd, 'editions')
  const firstRun = readdirSync(out)[0]
  const manifestPath = join(out, firstRun, 'run.json')
  const { directory, manifest, corpus } = loadRun(manifestPath)
  assert.equal(corpus.profiles[OBSERVER].name, 'Reader')
  assert.ok(readFileSync(join(directory, 'digest.md'), 'utf8').includes('[s1]'))
  assert.equal(deskReads, 15)
  const draft = join(directory, manifest.files.draft)
  writeFileSync(draft, '<!doctype html><html><head><title>Paper</title></head><body><q>The relay is working again.</q><a href="source:s1">Reporter</a></body></html>')
  const finished = await command(['finish', '--run', manifestPath], cwd)
  assert.equal(finished.code, 0, finished.stderr)
  const editionPath = join(out, manifest.files.edition)
  const edition = readFileSync(editionPath, 'utf8')
  assert.ok(edition.includes('id="observer-house"'))
  assert.ok(edition.includes('https://jumble.social/notes/nevent1'))
  assert.equal(readFileSync(draft, 'utf8').includes('source:s1'), true, 'finish preserves the editable draft')
  assert.equal(readFileSync(join(out, manifest.files.artifact), 'utf8'), edition)
  const shelfScript = new URL('../../observer-pages/scripts/site.mjs', import.meta.url)
  if (existsSync(shelfScript)) {
    const { catalog, add } = await import(shelfScript.href)
    const dist = join(cwd, 'dist')
    assert.equal(catalog(out, dist).printed.length, 1, 'the public shelf must find the finished paper, excluding its artifact and run folder')
    add(out, dist, [manifest.files.edition])
    assert.equal(existsSync(join(dist, manifest.files.edition)), true)
    assert.equal(existsSync(join(dist, 'corpus.json')), false)
    assert.equal(existsSync(join(dist, firstRun)), false)
  }

  writeFileSync(draft, '<html><head></head><body><script>alert(1)</script><q>Invented quote.</q></body></html>')
  const refused = await command(['finish', '--run', manifestPath], cwd)
  assert.equal(refused.code, 1)
  assert.ok(refused.stdout.includes('MARKUP'))
  assert.equal(readFileSync(editionPath, 'utf8'), edition, 'a refused draft cannot overwrite a good edition')
  assert.equal(readdirSync(directory).some((name) => name.startsWith('.finish-')), false)

  broken = true
  const blocked = await command(['prepare', '--relay', relay.url], cwd)
  assert.equal(blocked.code, 1)
  assert.ok(blocked.stdout.includes('NOT READY'))
  assert.equal(deskReads, 15, 'the second attempt must run readiness again and stop before desks')
  assert.equal(readdirSync(out).filter((name) => name.startsWith('run-')).length, 2, 'each attempt has independent evidence')
})
