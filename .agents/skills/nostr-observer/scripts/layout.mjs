import { tags, attributes, textIn } from './html.mjs'

// Advisory, not a CSS parser or a rendered proof. Find span names in selector
// headers without mistaking comments, quoted content or declaration values
// for selectors. A matching selector still says nothing about the cascade.
function definedSpans (css) {
  const spans = new Set()
  let header = ''
  let parentheses = 0
  for (let at = 0; at < css.length; at++) {
    const ch = css[at]
    if (ch === '/' && css[at + 1] === '*') {
      const end = css.indexOf('*/', at + 2)
      at = end < 0 ? css.length : end + 1
    } else if (ch === '"' || ch === "'") {
      const quote = ch
      while (++at < css.length) {
        if (css[at] === '\\') at++
        else if (css[at] === quote) break
      }
      header += '""'
    } else if (ch === '(') {
      parentheses++
      header += ch
    } else if (ch === ')') {
      parentheses = Math.max(0, parentheses - 1)
      header += ch
    } else if (!parentheses && ch === '{') {
      if (!header.trim().startsWith('@')) {
        const selector = header.replace(/\[[^\]]*\]/g, '')
        for (const match of selector.matchAll(/\.(span-\d+)(?![\w-])/g)) spans.add(match[1])
      }
      header = ''
    } else if (!parentheses && (ch === '}' || ch === ';')) {
      header = ''
    } else {
      header += ch
    }
  }
  return spans
}

/** Cheap layout reminders from this edition alone; never fetch art or block it. */
export function layoutWarnings (html, corpus) {
  const page = html.replace(/<!--[\s\S]*?-->/g, '')
  const styles = textIn(page, 'style')
  const spans = definedSpans(styles.map((block) => block.raw).join('\n'))
  let markup = page
  for (const block of [...styles].reverse()) markup = markup.slice(0, block.start) + markup.slice(block.end)
  const warnings = []
  const missing = new Set()
  const usedImages = new Set()
  for (const tag of tags(markup)) {
    const attrs = attributes(tag.raw)
    const classes = (attrs.class || '').split(/\s+/)
    if (classes.includes('col') && classes.includes('story')) {
      warnings.push({
        kind: 'NESTING',
        detail: `<${tag.name} class="${attrs.class}"> combines .col and .story on one element. In house.css, .col > * + * injects margin-top: 18px between all story elements (kicker, headline, dek, paragraphs), breaking vertical spacing. Nest .story inside .col instead.`,
      })
    }
    if (!/(?:^|;)\s*grid-column(?:-start|-end)?\s*:/i.test(attrs.style || '')) {
      for (const cls of classes) {
        if (/^span-\d+$/.test(cls) && !spans.has(cls)) missing.add(cls)
      }
    }
    if (tag.name === 'img') usedImages.add(attrs.src)
  }
  for (const cls of missing) {
    warnings.push({
      kind: 'SPAN',
      detail: `.${cls} has no selector in the embedded styles; it may collapse to one grid track. Use a documented span or define its desktop and tablet rules.`,
    })
  }
  for (const art of corpus.art || []) {
    if (!usedImages.has(art.url) && !usedImages.has(art.id)) continue
    if (!Number.isFinite(art.width) || !Number.isFinite(art.height) || art.width <= 0 || art.height <= 0 || art.height <= art.width * 2) continue
    warnings.push({
      kind: 'PORTRAIT',
      detail: `${art.id}: declared size ${art.width}x${art.height} (${(art.height / art.width).toFixed(1)} times as tall as wide). Check its display height and neighbouring column; a deliberate crop or narrow placement may help. This reminder does not evaluate existing CSS.`,
    })
  }
  return warnings
}
