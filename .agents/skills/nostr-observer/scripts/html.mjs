// Just enough HTML to read a tag correctly.
//
// The first version of the boundary found attributes with a regex like
// `<img\b[^>]*?\bsrc\s*=\s*"([^"]*)"`. That is wrong in a way that FAILS OPEN,
// which is the only direction that matters here: a `>` inside any attribute
// value ends `[^>]*?` early, the tag is never matched, and the element is
// never checked. `<img alt="a > b" src="https://evil.example/x.jpg">` sailed
// through the shortlist check, and `<a title="1 > 2" href="…">` sailed through
// the link check. Captions come from the corpus, and the corpus is where the
// attacker writes.
//
// A regex cannot fix this, because knowing where a tag ends means tracking
// whether you are inside a quoted value. So: a scanner that does.
//
// Not a parser. It does not build a tree, resolve entities in names, or care
// about `<!-- -->`. It answers two questions — where does this tag end, and
// what are its attributes — and those are the two the boundary asks.

/** Every `<name …>` in `html`, with the span it occupies. */
export function tags (html, name = '[a-z][a-z0-9-]*') {
  const out = []
  const open = new RegExp(`<(${name})(?=[\\s/>])`, 'gi')
  let match
  while ((match = open.exec(html)) !== null) {
    let at = match.index + match[0].length
    let quote = null
    while (at < html.length) {
      const ch = html[at]
      if (quote) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '>') {
        break
      }
      at++
    }
    // An unterminated tag is the end of anything we can read reliably.
    if (at >= html.length) break
    out.push({ name: match[1].toLowerCase(), start: match.index, end: at + 1, raw: html.slice(match.index, at + 1) })
    open.lastIndex = at + 1
  }
  return out
}

/**
 * The attributes of one tag, read in order.
 *
 * In order, and not by searching the tag for a name, because searching finds
 * the wrong one: in `<img alt="src=evil.jpg" src="art-1">` a search for `src=`
 * hits the text inside `alt` first. Names are lowercased; values keep their
 * case.
 */
function attributeSpans (raw) {
  const out = []
  const after = /^<[a-z][a-z0-9-]*/i.exec(raw)
  if (!after) return out
  let at = after[0].length
  const end = raw.length - 1 // the closing '>'

  const skip = () => { while (at < end && /\s/.test(raw[at])) at++ }

  while (at < end) {
    skip()
    if (at >= end || raw[at] === '/') break
    const nameStart = at
    while (at < end && !/[\s=/>]/.test(raw[at])) at++
    const name = raw.slice(nameStart, at).toLowerCase()
    if (!name) { at++; continue }
    const nameEnd = at
    skip()
    if (raw[at] !== '=') { out.push({ name, value: '', start: nameStart, end: nameEnd }); continue } // boolean attribute
    at++
    skip()
    let value
    if (raw[at] === '"' || raw[at] === "'") {
      const quote = raw[at++]
      const valueStart = at
      while (at < end && raw[at] !== quote) at++
      value = raw.slice(valueStart, at)
      at++
    } else {
      const valueStart = at
      while (at < end && !/\s/.test(raw[at])) at++
      value = raw.slice(valueStart, at)
    }
    out.push({ name, value, start: nameStart, end: at })
  }
  return out
}

export function attributes (raw) {
  return Object.fromEntries(attributeSpans(raw).map(({ name, value }) => [name, value]))
}

/** Replace an actual attribute, never matching its name inside another value. */
export function setAttribute (raw, name, value) {
  const replacement = `${name}="${String(value).replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`
  const spans = attributeSpans(raw).filter((attr) => attr.name === name.toLowerCase())
  if (spans.length === 0) return raw.replace(/\s*\/?\s*>$/, (ending) => ` ${replacement}${ending}`)
  let out = raw
  // Duplicate attributes are all set alike; parser/browser disagreement must
  // not leave a second destination behind the one we resolved.
  for (const span of spans.reverse()) out = out.slice(0, span.start) + replacement + out.slice(span.end)
  return out
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

/** Text between `<name>` and its matching `</name>`, nesting handled. */
export function textIn (html, name) {
  return elements(html, name)
    .filter((el) => el.innerEnd > el.innerStart)
    .map((el) => ({ start: el.start, end: el.innerEnd, raw: html.slice(el.innerStart, el.innerEnd) }))
}

/**
 * Every element with a matching close (void and self-closing tags included).
 * `innerEnd` is the start of `</name>`; `end` is past that close tag.
 */
export function elements (html, name = '[a-z][a-z0-9-]*') {
  const found = []
  for (const tag of tags(html, name)) {
    if (VOID.has(tag.name) || tag.raw.endsWith('/>')) {
      found.push({ name: tag.name, start: tag.start, innerStart: tag.end, innerEnd: tag.end, end: tag.end })
      continue
    }
    let depth = 1
    const scan = new RegExp(`</?${tag.name}(?=[\\s/>])`, 'gi')
    scan.lastIndex = tag.end
    let close = -1
    let inner
    while ((inner = scan.exec(html)) !== null) {
      depth += inner[0][1] === '/' ? -1 : 1
      if (depth === 0) { close = inner.index; break }
    }
    if (close === -1) continue
    const closeMatch = /^<\/[a-z][a-z0-9-]*\s*>/i.exec(html.slice(close))
    found.push({
      name: tag.name,
      start: tag.start,
      innerStart: tag.end,
      innerEnd: close,
      end: close + (closeMatch ? closeMatch[0].length : 0),
    })
  }
  return found
}
