# House layout guide

The press inserts `house.css` unchanged before checking the page. Do not read
or reproduce that asset. Write a complete HTML document with a `<head>` and
choose the layout in your markup. Add custom CSS only for a departure the
house primitives cannot express, with a `<!-- restyle: ... -->` reason.
Custom `<style>` blocks follow the inserted house CSS and take precedence.
The id `observer-house` belongs to the press; do not use it yourself.

The paper is light cream newsprint. Use these custom properties in any custom
CSS: `--paper`, `--paper-2`, `--ink`, `--ink-2`, `--ink-3`, `--rule`,
`--rule-soft`, `--accent`, `--spot`. The reverse panel uses `--reverse-bg`,
`--reverse-ink`, `--reverse-ink-2`, `--reverse-spot`. Font stacks are `--serif`
(headlines), `--body` (prose), `--util` (labels), `--mono` (numbers).
Never add a dark theme or override `color-scheme: light`.

| Primitive | Markup and effect |
|---|---|
| Page | `.sheet` is the centred page, max width 1240px, with padding. |
| Furniture | Direct children `.folio`, `.masthead`, `.dateline`. The folio is ordered first. Each row has three spans: left, centre, right. `.masthead h1` is the nameplate; `.the` is its small upper word; `.motto` the standing line. |
| Main grid | `.fold` has 12 tracks. Its `.col` children use `.span-3`, `.span-4`, `.span-5`, `.span-6`, `.span-8`, `.span-12`. Choose widths adding to 12 per row; columns carry rules and spacing. |
| Section bands | `.band` wraps a section; `.band-head` its title row. `.cols2`, `.cols3`, `.cols4` contain `.cell` children with column rules and spacing. |
| Stories | `.story` spaces its paragraphs and separates neighbouring stories. `p.first` adds a drop cap inside a story. |
| Headlines | `.lead-head` is largest, then `.main-head`, `.sub-head`, `.small-head`. |
| Supporting text | `.kicker` is an uppercase accent label, `.byline` a small credit, `.dek` an italic subheadline, `.note` a smaller italic aside. |
| Pictures | `<figure><img ...><figcaption>...</figcaption></figure>`. Images fill their column, keeping aspect ratio. `.credit` inside the caption is a separate small photographer credit. |
| Boxes and wires | `.box` is a bordered tinted panel; `.box-head` its label. `.wire-item` separates brief listings with dotted rules. |
| Emphasis | `.reverse` is a dark panel within the light paper, with its own contrasting headline, label, and dek colours. |
| Quotations | `<blockquote>` is a larger serif pull quote; `<q>` supplies quotation marks. Both are verbatim-checked. |
| Tables | `.tablewrap` scrolls horizontally if needed. Tables have dotted row rules; `td.num` aligns numeric cells right in the mono stack. |

At 1000px, narrow main columns widen to half the grid and `.cols4` becomes two
columns. At 720px, story grids and band columns stack; their rules and padding
adjust automatically. Folio and dateline have their own smaller breakpoints.
Keep these responsive primitives instead of rebuilding them for each edition.

## Nesting: columns vs stories

`.col` and `.story` serve different layout roles and must not be combined on
the same element. In `house.css`, `.col > * + *` adds an 18px top margin to
every direct child inside a column. Combining `.col` and `.story` causes that
rule to match `.story`'s inner children (kicker, headline, dek, paragraphs)
alongside `.story`'s own flex gap, blowing out the vertical rhythm.

Always nest a `.story` (or multiple stories) inside a `.col`:

```html
<!-- Correct -->
<div class="col span-8">
  <article class="story">
    <div class="kicker">...</div>
    <h2 class="lead-head">...</h2>
    <p class="dek">...</p>
    <p class="first">...</p>
  </article>
</div>

<!-- Avoid: combining .col and .story breaks vertical spacing -->
<article class="col span-8 story"> ... </article>
```

The same class of mistake happens with `.cell`. `.story + .story` adds a top
margin, padding and rule to a following story, which is correct when two
stories stack in one column and wrong when they sit in neighbouring cells of
`.cols2`/`.cols3`/`.cols4` — document order is then the next column, not the
next piece. Nest the story inside the cell; do not combine the classes.

```html
<!-- Correct -->
<div class="cell">
  <article class="story">...</article>
</div>

<!-- Avoid: combining .cell and .story drops the next column -->
<div class="cell story">...</div>
```

## Balance the rows

Use the documented span classes; a name such as `span-7` has no built-in rule.
If the day needs another width, define it in custom CSS and account for the
1000px breakpoint. Even built-in widths can wrap there: `span-8` stays eight
tracks while `span-4` becomes six. A desktop total of twelve is not proof that
the same pair stays on one row at tablet widths.

Balance the content of each row, not just its column widths. Two independent
stacks of stories share the height of the taller stack and can leave a large
blank below the shorter one. When that happens, split the page into shorter
rows or move a readings box into its own full-width band. Do not stretch text
or add filler to make the bottoms meet.

Use the shortlist's dimensions when planning art. At a 460px display width,
an 1848x4096 portrait is roughly 1020px tall before its caption. Give unusually
tall art a narrower placement or a deliberate display-height limit. A CSS crop
can help when the subject is visible and the crop preserves it; do not guess
a focal point from the caption. Keep the original image URL and bytes.

Static checks cannot judge column balance. When a browser is available, inspect
the complete finished page at phone, tablet and desktop widths (for example
390px, 900px and 1280px), including below the fold. Check overflow, unexpected
row wrapping, long empty column tails and images dominating a row. An available
embedded artifact avoids depending on remote image hosts. If rendering cannot
run, report that limit; source validation is not visual verification.
