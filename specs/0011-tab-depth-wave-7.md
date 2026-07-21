# 0011 — Depth wave 7: native-theme icons, outline gap, saved portfolio

## Motivation

Direct feedback on wave 5: the tinted icon-chip squares "look vibe coded"
against the app's original design. The app's native icon language is plain
muted lucide glyphs (`text-base-content/45`, sizes 3.5–4) beside text — no
background chips. This wave restyles the shared components (which fixes
every tab at once) and continues the depth program with two free features.

## Features

### 1. Native-theme icon restyle (feedback fix)

`InsightIcon` becomes a bare muted icon; `InsightTile` moves its icon to
the right of the uppercase label as a small quiet glyph — no chip
backgrounds anywhere. Tones color only the icon (and keep the warning/
error border accents that predate wave 5). Tiles return to `rounded-lg`.
Propagates to SERP Overview, Page Explorer, Local Rank Grid, Local SEO,
GSC branded split, gap overview tiles, and all card headers.

### 2. Content Optimizer — competitor outline gap (free)

The brief already loads each competitor's H2 outline, and the draft grader
already parses a pasted draft. New pure helper clusters competitor
headings into recurring themes (significant-word overlap, theme = appears
in ≥2 competitors) and checks which themes the draft covers. The grader
gains an "Outline coverage" list: `✓/○ theme — in N of M competitors`,
sorted by how many competitors use it. Without a draft it reads as the
consensus outline blueprint.

### 3. Saved Keywords — portfolio strip (free)

The saved list is server-paginated, so page rows can't feed honest totals —
but `exportSavedKeywords` already returns the full filtered set. A new
strip above the table queries it (same filters, invalidated with the same
`["savedKeywords", projectId]` prefix) and shows: saved count, total
volume, average KD, quick wins (KD < 30), plus an intent-mix bar using the
intent badge palette. Reuses `computeKeywordTotals`.

## Non-goals

- Audit issue deltas (history rows carry no issue counts; needs schema
  work — future wave).
- No layout changes this wave beyond the icon restyle.

## Testing

Pure helpers (`outlineGap`, `savedPortfolio`) unit-tested; standard gates
before deploy; live verify on production.
