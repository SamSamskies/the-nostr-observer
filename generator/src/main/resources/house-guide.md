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
