// An explicit reader choice, kept in the working directory rather than the
// installed skill. This never stores relay facts or a readiness verdict.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { toHex, toNpub } from './nostr.mjs'

export function profilePath (cwd = process.cwd()) {
  return resolve(cwd, '.nostr-observer/reader.json')
}

export function readerProfile ({ npub, timezone = 'UTC', name } = {}) {
  if (typeof npub !== 'string' || !/^npub1/i.test(npub.trim())) {
    throw new Error('Choose a reader explicitly with --npub npub1…; no default reader has been inferred.')
  }
  const canonical = toNpub(toHex(npub.trim().toLowerCase()))
  if (typeof timezone !== 'string' || !timezone.trim()) throw new Error('Provide an IANA timezone, such as America/Chicago.')
  let zone
  try { zone = new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone } catch {
    throw new Error(`Unknown timezone: ${timezone}`)
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 160 || /[\x00-\x1f\x7f<>]/.test(name))) {
    throw new Error('Reader name must be one plain-text line, at most 160 characters.')
  }
  return { version: 1, npub: canonical, timezone: zone, ...(name !== undefined ? { name: name.trim() } : {}) }
}

export function loadProfile (path = profilePath()) {
  if (!existsSync(path)) return null
  const saved = JSON.parse(readFileSync(path, 'utf8'))
  if (saved?.version !== 1) throw new Error(`Unsupported reader profile in ${path}.`)
  return readerProfile(saved)
}

export function saveProfile (path, input) {
  const profile = readerProfile(input)
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(profile, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  renameSync(temporary, path)
  return profile
}

/** Overrides apply to this run; using another reader never changes the saved one. */
export function selectReader (saved, overrides = {}) {
  // A display name belongs to the saved identity, not to an override npub.
  const input = overrides.npub === undefined ? undefined : String(overrides.npub).trim().toLowerCase()
  const changed = input && toHex(input) !== toHex(saved?.npub || input)
  return readerProfile({
    ...saved,
    ...(changed ? { name: undefined } : {}),
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
  })
}
