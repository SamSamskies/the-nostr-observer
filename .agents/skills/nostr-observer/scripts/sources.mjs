// Short references belong to one full corpus, never to a trimmed digest.
// Both the writer's digest and resolve derive this map from the same record;
// no alias or destination supplied by a post gets onto it.

export const SOURCE_SCHEME = /^(source|watch|listing|calendar|app|repo):/i
export const SOURCE_LINK = /^(source|watch|listing|calendar|app|repo):(s[1-9][0-9]*)$/
export const CITATION_LABEL = /^(?:(?:watch|listing|calendar|app|repo):)?s[1-9][0-9]*$/i

/**
 * Link text that is already a bracketed source id, such as `[s42]` or
 * `[watch:s42]`. Writers cite "[s42]" and also wrap the tag in brackets, which
 * prints [[s42]]. Null if the inner text is anything else — including a bare
 * `s42`, which is the house form inside `[<a>s42</a>]`.
 */
export function citationLinkText (inner) {
  const wrapped = /^\s*\[([^\]]+)\]\s*$/.exec(inner)
  return wrapped && CITATION_LABEL.test(wrapped[1]) ? wrapped[1] : null
}

export function sourceIndex (corpus) {
  const byId = new Map()
  const byAlias = new Map()
  for (const events of Object.values(corpus.desks || {})) {
    for (const event of events) {
      const id = String(event.id || '').toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(id) || byId.has(id)) continue
      const alias = `s${byId.size + 1}`
      byId.set(id, alias)
      byAlias.set(alias, id)
    }
  }
  return { byId, byAlias }
}
