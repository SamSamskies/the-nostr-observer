import { tags, attributes, textIn, setAttribute } from './html.mjs'

// The fixed house CSS is copied by the press, not written by the model.
// It goes first so a day's custom styles still take precedence. The reserved
// block is checked on another pass rather than silently replacing arbitrary
// CSS: that would hide a forbidden import before validate could report it.
export function applyHouseStyle (html, css) {
  const heads = tags(html, 'head')
  if (heads.length !== 1) throw new Error('House CSS needs a complete document with one <head>.')
  const head = heads[0]
  const closing = /<\/head\s*>/gi
  closing.lastIndex = head.end
  const end = closing.exec(html)?.index
  if (end === undefined) throw new Error('House CSS needs a closing </head>.')

  const styles = tags(html, 'style')
  const bodies = new Map(textIn(html, 'style').map((block) => [block.start, block]))
  const reserved = styles.filter((tag) => attributes(tag.raw).id === 'observer-house')
  if (reserved.length > 1) throw new Error('More than one reserved observer-house style block.')
  if (reserved.length === 1) {
    const tag = reserved[0]
    const body = bodies.get(tag.start)
    if (tag.start < head.end || !body || body.end >= end || body.raw.trim() !== css.trim()) {
      throw new Error('The reserved observer-house style block differs from house.css or is outside <head>.')
    }
    return html
  }

  // An edition written before scripted insertion may already have the exact
  // stylesheet. Adopt it instead of doubling it; leave every other style alone.
  const existing = styles.find((tag) => tag.start >= head.end && bodies.get(tag.start)?.end < end
    && bodies.get(tag.start).raw.trim() === css.trim())
  if (existing) {
    return html.slice(0, existing.start) + setAttribute(existing.raw, 'id', 'observer-house') + html.slice(existing.end)
  }
  return html.slice(0, head.end) + `\n<style id="observer-house">\n${css}\n</style>` + html.slice(head.end)
}
