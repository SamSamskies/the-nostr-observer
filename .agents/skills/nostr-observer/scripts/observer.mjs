#!/usr/bin/env node
// The daily mechanics in two calls. The writer still makes every editorial
// and layout decision; the existing scripts still own their boundaries.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { DEFAULT_RELAY, WINDOW_SECONDS } from './readiness.mjs'
import { DEFAULT_TRUST_FLOOR } from './corpus.mjs'
import { toHex, toNpub, shortNpub } from './nostr.mjs'
import { sourceIndex } from './sources.mjs'
import { loadProfile, profilePath, readerProfile, saveProfile, selectReader } from './profile.mjs'

const scripts = dirname(fileURLToPath(import.meta.url))
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

/** No shell interpolation, and the large digest goes straight to disk. */
export async function runScript (script, args, { stdout } = {}) {
  const fd = stdout ? openSync(stdout, 'wx') : null
  try {
    return await new Promise((done, reject) => {
      const child = spawn(process.execPath, [join(scripts, script), ...args], {
        stdio: ['ignore', fd ?? 'inherit', 'inherit'],
      })
      child.once('error', reject)
      child.once('exit', (code, signal) => signal ? reject(new Error(`${script} stopped by ${signal}.`)) : done(code))
    })
  } finally { if (fd !== null) closeSync(fd) }
}

function failed (message, exitCode = 3) {
  return Object.assign(new Error(message), { exitCode })
}

/** The clock is converted in code, including the edition date across midnight/DST. */
export function writerMetadata (corpus, reader) {
  const end = new Date(corpus.until * 1000)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: reader.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(end)
  const part = (type) => parts.find((p) => p.type === type).value
  const date = `${part('year')}-${part('month')}-${part('day')}`
  const dateline = new Intl.DateTimeFormat('en-US', { timeZone: reader.timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(end)
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: reader.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }).format(end)
  return {
    reader, date, dateline, code: corpus.code,
    readerLabel: reader.name || corpus.profiles?.[corpus.observer]?.name || reader.npub,
    window: { since: new Date(corpus.since * 1000).toISOString(), until: end.toISOString() },
    windowStamp: `24h to ${clock}`,
    asOfStamp: `As of ${clock}`,
    counts: {
      events: Object.values(corpus.desks || {}).flat().length,
      voices: new Set(Object.values(corpus.desks || {}).flat().map((e) => e.pubkey)).size,
    },
  }
}

function filesFor (date, code) {
  const stem = `observer-${date}-${code}`
  return {
    readiness: 'readiness.json', corpus: 'corpus.json', digest: 'digest.md', writer: 'writer.json',
    draft: 'draft.html', edition: `${stem}.html`, artifact: `${stem}.artifact.html`,
  }
}

function matchesReader (record, reader, relay) {
  return record.observer === toHex(reader.npub) && record.relay === relay
}

export async function prepare ({ reader, relay = DEFAULT_RELAY, out = 'editions' }, run = runScript) {
  reader = readerProfile(reader)
  const url = new URL(relay)
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Relay must be a ws:// or wss:// URL.')
  const root = resolve(out)
  mkdirSync(root, { recursive: true })
  // Each attempt starts empty. An old READY file cannot authorize this pull.
  const directory = mkdtempSync(join(root, 'run-'))
  const readinessPath = join(directory, 'readiness.json')
  const code = await run('readiness.mjs', [reader.npub, '--relay', relay, '--json', readinessPath])
  if (code !== 0) throw failed(`Preparation stopped at readiness. Reports: ${directory}`, code || 3)
  const readiness = json(readinessPath)
  if (readiness.ready !== true || readiness.state !== 'ready' || !matchesReader(readiness, reader, relay)) {
    throw failed(`Readiness did not confirm this reader and relay. Reports: ${directory}`, 1)
  }

  const corpusPath = join(directory, 'corpus.json')
  const pullCode = await run('corpus.mjs', [reader.npub, '--relay', relay, '--floor', String(DEFAULT_TRUST_FLOOR), '--out', corpusPath], { stdout: join(directory, 'digest.md') })
  if (pullCode !== 0) throw failed(`Corpus pull failed. Reports: ${directory}`, pullCode || 3)
  const corpus = json(corpusPath)
  if (!matchesReader(corpus, reader, relay) || corpus.floor !== DEFAULT_TRUST_FLOOR
      || !Number.isInteger(corpus.until) || !Number.isInteger(corpus.since)
      || corpus.until - corpus.since !== WINDOW_SECONDS || !/^[0-9A-F]{6}$/.test(corpus.code)) {
    throw failed(`Corpus does not match this reader, relay, floor, or 24-hour window. Reports: ${directory}`)
  }
  const writer = writerMetadata(corpus, reader)
  const files = filesFor(writer.date, corpus.code)
  writeJson(join(directory, files.writer), writer)
  const manifest = {
    version: 1, reader, relay, floor: corpus.floor, since: corpus.since, until: corpus.until,
    date: writer.date, code: corpus.code, corpusSha256: hash(corpusPath), files,
  }
  const manifestPath = join(directory, 'run.json')
  writeJson(manifestPath, manifest)
  return { manifestPath, directory, manifest }
}

/** Checks for accidentally mixing runs or editing evidence after preparation. */
export function loadRun (path) {
  if (!path) throw new Error('Provide --run /absolute/path/to/run.json from prepare.')
  const manifestPath = resolve(path)
  const directory = dirname(manifestPath)
  const manifest = json(manifestPath)
  if (manifest.version !== 1) throw new Error('Unsupported run manifest.')
  const reader = readerProfile(manifest.reader)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.date) || !/^[0-9A-F]{6}$/.test(manifest.code)) throw new Error('Invalid edition date or code.')
  const files = filesFor(manifest.date, manifest.code)
  if (Object.entries(files).some(([key, name]) => manifest.files?.[key] !== name)) throw new Error('Run file names have changed; prepare a new run.')
  const corpusPath = join(directory, files.corpus)
  if (hash(corpusPath) !== manifest.corpusSha256) throw new Error('The saved corpus has changed; prepare a new run rather than editing evidence.')
  const corpus = json(corpusPath)
  const readiness = json(join(directory, files.readiness))
  if (readiness.ready !== true || readiness.state !== 'ready' || !matchesReader(readiness, reader, manifest.relay)
      || !matchesReader(corpus, reader, manifest.relay) || corpus.floor !== DEFAULT_TRUST_FLOOR
      || manifest.floor !== corpus.floor || manifest.code !== corpus.code
      || manifest.since !== corpus.since || manifest.until !== corpus.until || corpus.until - corpus.since !== WINDOW_SECONDS
      || writerMetadata(corpus, reader).date !== manifest.date) {
    throw new Error('Run provenance does not match the prepared corpus and readiness check.')
  }
  return { manifestPath, directory, manifest, corpus }
}

export async function finish (path, run = runScript) {
  const { directory, manifest } = loadRun(path)
  const files = manifest.files
  const draft = join(directory, files.draft)
  if (!existsSync(draft)) throw new Error(`Write the complete HTML document to ${draft} first.`)
  const temporary = mkdtempSync(join(directory, '.finish-'))
  const candidate = join(temporary, 'edition.html')
  const artifact = join(temporary, 'artifact.html')
  const corpus = join(directory, files.corpus)
  try {
    for (const [script, args] of [
      ['resolve.mjs', [draft, '--corpus', corpus, '--out', candidate]],
      ['validate.mjs', [candidate, '--corpus', corpus]],
      ['embed.mjs', [candidate, '--corpus', corpus, '--out', artifact]],
    ]) {
      const code = await run(script, args)
      if (code !== 0) throw failed(`Finish stopped at ${script}; fix ${draft} and run finish again.`, code || 3)
    }
    // Keep finished papers on the existing flat shelf. observer-pages discovers
    // only these names; drafts and evidence stay inside the private run folder.
    const editionPath = join(dirname(directory), files.edition)
    const artifactPath = join(dirname(directory), files.artifact)
    renameSync(candidate, editionPath)
    renameSync(artifact, artifactPath)
    return { editionPath, artifactPath }
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}

export function selectedSources (path, aliases) {
  if (aliases.length === 0) throw new Error('Provide source ids from the digest, such as s42 s57.')
  const { corpus } = loadRun(path)
  const { byAlias } = sourceIndex(corpus)
  const events = new Map(Object.values(corpus.desks).flat().map((e) => [e.id.toLowerCase(), e]))
  return aliases.map((alias) => {
    const event = events.get(byAlias.get(alias))
    if (!event) throw new Error(`Unknown ranked source: ${alias}`)
    return {
      source: alias, byline: corpus.profiles[event.pubkey]?.name || shortNpub(event.pubkey), author: toNpub(event.pubkey),
      event: { id: event.id, pubkey: event.pubkey, kind: event.kind, created_at: event.created_at, tags: event.tags, content: event.content },
    }
  })
}

const HELP = `Usage: node observer.mjs <command>
  profile set --npub npub1… [--timezone America/Chicago] [--name Reader] [--profile path]
  profile show [--profile path]
  prepare [--npub npub1…] [--timezone UTC] [--relay wss://…] [--out editions] [--profile path]
  sources s42 [s57 …] --run /absolute/path/to/run.json
  finish --run /absolute/path/to/run.json

The default profile is .nostr-observer/reader.json in the working directory.
prepare always checks readiness live before pulling a fixed 24-hour corpus.
Write draft.html in the reported run folder, then finish resolves, validates,
and builds the separate artifact copy. No model call or public deployment.`

async function main () {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0] === '--help') { console.log(HELP); return }
  const command = args.shift()
  const action = command === 'profile' ? args.shift() : null
  const allowed = command === 'prepare' ? ['npub', 'timezone', 'relay', 'out', 'profile']
    : command === 'profile' && action === 'set' ? ['npub', 'timezone', 'name', 'profile']
      : command === 'profile' && action === 'show' ? ['profile']
        : ['finish', 'sources'].includes(command) ? ['run'] : null
  if (!allowed) throw new Error(HELP)
  const { values, positionals } = parseArgs({ args, options: Object.fromEntries(allowed.map((name) => [name, { type: 'string' }])), allowPositionals: command === 'sources' })
  const savedPath = resolve(values.profile || profilePath())
  if (command === 'profile') {
    const profile = action === 'set' ? saveProfile(savedPath, values) : loadProfile(savedPath)
    if (!profile) throw new Error(`No saved reader at ${savedPath}. Use profile set with an explicitly chosen npub.`)
    console.log(JSON.stringify({ path: savedPath, ...profile }, null, 2))
  } else if (command === 'prepare') {
    const reader = selectReader(loadProfile(savedPath), { npub: values.npub, timezone: values.timezone })
    const { manifestPath, directory, manifest } = await prepare({ reader, relay: values.relay, out: values.out })
    console.log(JSON.stringify({ run: manifestPath, reader: reader.npub, timezone: reader.timezone,
      read: [join(directory, manifest.files.writer), join(directory, manifest.files.digest)],
      write: join(directory, manifest.files.draft),
      finish: [process.execPath, join(scripts, 'observer.mjs'), 'finish', '--run', manifestPath],
    }, null, 2))
  } else if (command === 'sources') {
    console.log(JSON.stringify(selectedSources(values.run, positionals), null, 2))
  } else {
    console.log(JSON.stringify(await finish(values.run), null, 2))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = error.exitCode || 2 })
}
