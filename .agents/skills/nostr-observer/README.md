# The Nostr Observer, as a Claude Code skill

A taster of [the Nostr Observer](../README.md) that runs entirely inside your
own Claude Code: it reads the last 24 hours of Nostr through your web of trust,
writes a newspaper front page, checks its own work, and hands you the page.

Nothing here talks to a server of ours. There is no account, no API key and no
credential of any kind — your Claude Code makes the model call, on your own
plan, the same way it does for everything else you use it for.

## Install

Node 22 or newer is required (the scripts use the built-in `WebSocket`, so
there is nothing to `npm install`).

Two ways in. Open the repository in an agent harness and the skill is already
loaded — it lives in this repo's own `.agents/skills/` (`.claude/skills/` is a
symlink to the same tree for Claude Code):

```bash
git clone https://github.com/NosFabrica/the-nostr-observer
cd the-nostr-observer && claude
```

Or install it globally, so it works in any directory:

```bash
git clone https://github.com/NosFabrica/the-nostr-observer
mkdir -p ~/.agents/skills ~/.claude/skills
cp -r the-nostr-observer/.agents/skills/nostr-observer ~/.agents/skills/
ln -sfn "$HOME/.agents/skills/nostr-observer" "$HOME/.claude/skills/nostr-observer"
```

Either way it is Claude Code, which is the terminal, the desktop app, or
[claude.ai/code](https://claude.ai/code) in a browser — no terminal required.
Plain Claude chat will not do: its sandbox reaches an allowlist that does not
include the relay, and the ranked query is a websocket with no HTTP form to
fall back to.

Then start `claude` **in whatever directory you want your paper to land in**
and ask for it:

```
> print my Nostr Observer
```

It uses your explicitly saved reader, or asks which npub to read for, checks
that your lens actually resolves, and stops with a specific remedy if it does
not. Each attempt gets its own folder under `editions/`. A completed run gives
you an `observer-<date>-<code>.html` file and an artifact link.

Everything runs locally. You are not signing in to anything of ours, and no
key of yours goes anywhere — the skill reads public relay data and writes a
file.

## What it does

| Step | |
|---|---|
| 1 | Uses an explicitly chosen npub, optionally from the local reader profile |
| 2 | `observer.mjs prepare` — live readiness, then fourteen desks plus control in a fixed 24-hour window; digest and writer metadata saved to disk |
| 3 | Writes the complete draft against `reference/editorial.md` and `reference/layout.md` |
| 4 | `observer.mjs finish` — house CSS and source resolution, validation, then the separate artifact copy |
| 5 | Delivers the hotlinked edition and publishes the embedded copy as an artifact |

## Saved reader and workflow commands

These commands work from the directory where your paper should land. Substitute
the absolute path to your installed skill for `<skill>`:

```bash
node <skill>/scripts/observer.mjs profile set --npub <chosen-npub> --timezone America/Chicago
node <skill>/scripts/observer.mjs prepare
```

The profile lives in `.nostr-observer/reader.json` in that working directory,
outside the skill and ignored by this repository. It contains only your chosen
npub, IANA timezone and optional `--name`. It never caches readiness. Inspect it
with `profile show`; choose another location with `--profile /path/to/reader.json`.
Passing `--npub` or `--timezone` to prepare changes one run, leaving the profile
alone. Without a profile, prepare requires an explicit `--npub` and uses UTC
unless a timezone is supplied.

Prepare reports an absolute `run.json` path, the two files the writer should read
(`writer.json` and `digest.md`), and where to write `draft.html`. It always runs
readiness first and stops before pulling a corpus on failure. Each attempt starts
in a fresh `editions/run-…/` folder, so yesterday's evidence cannot become today's
paper accidentally. `--out` chooses another output root and `--relay` another
search relay. The profile does not store relay settings.

The writer metadata supplies the local date and labelled clock, including DST,
edition code, reader label and exact event/voice counts. The reader name comes
from the same kind-0 batch as the bylines unless the profile overrides it. Source
timestamps stay UTC, and the window remains exactly 24 hours.

For a selected story's complete content or structured tags, avoid opening the
whole corpus:

```bash
node <skill>/scripts/observer.mjs sources s42 s57 --run <reported-run.json>
```

After writing the draft, finish in one command:

```bash
node <skill>/scripts/observer.mjs finish --run <reported-run.json>
```

Finish checks that the corpus still matches the run, resolves into a temporary
candidate, and validates before any image fetch or final-file replacement. A
rejected draft stays editable; an existing valid edition stays intact. On success
it reports the edition and artifact paths, saved directly in the output root
so the existing `observer-pages` commands can discover the finished paper.
The draft and evidence remain in the run folder. Read all resolution and embedding
warnings before delivery. The separate readiness/corpus/resolve/validate/embed
scripts remain available for diagnostics.

The commands make no model calls. They reduce repeated agent orchestration and
large raw-file reads; this phase does not change digest selection or introduce
local semantic decisions. Token savings still need measurement on a real print.

The digest gives each ranked source a short id, such as `s42`. The writer cites
it with `href="source:s42"`; desk links use the printed `watch:`, `listing:`,
`calendar:`, `app:` or `repo:` reference. `resolve.mjs` derives the final URL
from the full ranked corpus and checks the event type. An unknown reference
loses its link and is reported; a reference left unresolved fails validation.
Older hex writer URLs and canonical citations still resolve.

The fixed stylesheet is an asset, rather than text the model reads and copies
into every edition. The writer chooses the whole layout using the guide's
primitives and can add custom CSS. Resolve inserts the exact house CSS first,
preserves custom styles after it, and does not duplicate its block on a second
pass. The final HTML is still self-contained.

Measured offline on the saved **2026-10-05 edition E4414D**: the same 597-event
corpus produced a 151,579-character digest instead of about 197,162 (**23.1%
smaller**). Replacing its 29 citations with short references and leaving the
fixed CSS for the script reduced the draft the model would write from 36,443 to
20,719 characters (**43.1% smaller**). Resolving that draft reproduced the
original body, quotes, picture URLs and link destinations, and passed the
boundary. These are character measurements, not tokenizer or billing results;
no relay read or model call was needed for the comparison.

## If it says NOT READY

That is the skill working. The relay ranks through a lens built from NIP-85
trust assertions, and `observer:<pk> sort:rank` with an unresolvable observer
does not error — it silently becomes the anonymous global ranking. So the check
is a gate: a paper without a lens looks right and is not the product.

The most common answer is that you have no `kind 10040` naming a `30382:rank`
service. Get a lens minted at [brainstorm.world](https://brainstorm.world).

## Testing

Four layers, and only the first two can run in CI.

**1. Unit and boundary tests — no network, under a second.**

```bash
node --test ".agents/skills/nostr-observer/test/*.test.mjs"
```

Tests cover bech32 against the NIP-19 worked example, the readiness chain in
every state it can reach, query construction, the relay auth gate, socket
sharing, the digest budget, source aliases, stylesheet insertion, saved profiles,
timezone labels, the workflow commands, the artifact embed step, and the boundary from
both sides.

**2. The relay client against a relay that misbehaves on purpose.**

`test/fakerelay.mjs` is a dependency-free WebSocket server that reproduces the
hazards recorded in `AGENTS.md` — the AUTH challenge sent before an answer, a
`NOTICE` mid-stream, a subscription that says nothing, a `CLOSED` with a
reason. Each of those fails *silently* against a real relay: the symptom is an
empty list, which looks exactly like a quiet day. Reproducing them locally is
the only way they stay caught.

**3. The golden edition — does the boundary leave a good page alone?**

The adversarial tests answer "does it stop the bad things". This answers the
likelier way to ship something broken. It takes the 56 KB prototype broadsheet
from `generator/src/test/resources/`, derives a corpus from what the page
itself cites, and asserts that `resolve` + `validate` return it untouched and
clean. A checker that quietly rejects a real broadsheet passes every
adversarial test and prints nothing every morning. (Skipped automatically if
you installed the skill on its own, without the repository.)

**4. Live, against the relay — needs a reader with a working lens.**

```bash
node <skill>/scripts/observer.mjs prepare --npub <chosen-npub> --relay <search-relay>
```

This is the layer CI cannot have, because the workflow's rule is that nothing
in it talks to a relay. Run it by hand against an npub whose `kind 10040` names
a `30382:rank` service with cards on the search relay. Two things to look at:
the **Instrument** line in the digest — a low overlap between the ranked notes
and the unranked control is the product working — and whether the desks
returned anything at all.

Useful check with a *broken* lens, which is easier to find: the desks should
return nothing while the control run returns hundreds. That is the trust floor
biting. It does not make the readiness gate redundant — the readiness probe
deliberately sends no floor, precisely so it can still see the silent
degradation to anonymous ranking.

**And then the part no test covers.** Whether the paper is any *good* is a
human read. Run the whole skill, open the file, and ask whether a person would
want it tomorrow. That judgement is the actual product and there is no
assertion for it.

## What it does not do

Put a paper on the public web — that is the sibling skill `observer-pages`.
This prints today's paper into `editions/` and stops. It also does not
publish to your Blossom servers as an nsite, carry the masthead forward from
yesterday, or run on a schedule. Those are the full Observer.

Also: the artifact viewer blocks remote images, and this paper hotlinks art
where its authors published it rather than re-hosting anyone's photographs.
The artifact therefore gets its own copy, built by `embed.mjs`, with each
shortlist picture inlined as a `data:` URI; the saved HTML file stays
hotlinked. A picture the embed step cannot fetch shows in the artifact as its
caption and alt, and the run says which.

## Editing it

`reference/editorial.md`, `reference/house.css` and `reference/layout.md` are
**generated**. Edit `system-prompt.md`, `house.css` or `house-guide.md` in
`generator/src/main/resources/` and run `tools/sync-skill.sh`. The harness
corrections in the editorial banner are maintained in that sync script.
