# Rocket Rally Design System

Brand system for **Red Hill Elementary PTA's "Rocket Rally"** — the school's premier fall fundraiser (2026 edition). One campaign. One ask. One celebration. The visual identity is a mission-control / rocket-launch metaphor rendered in a stark print-poster style: black, white, and one red.

**Source material:** `uploads/mood.jpg` — a brand moodboard covering palette, typography, campaign voice tiles, t-shirt merch, yard sign, progress thermometer, sponsor recognition, and event-day photography. No codebase, Figma, or font binaries were provided.

## Campaign facts (from moodboard)
- Timeline: 09.08 Launch → 10.06 Mission Close (5:00 PM) → 10.07 Liftoff (Rocket Rally event day)
- The ask: "Your mission: $100. 4 people. $25 each. Every student. Every class."
- The experience: Walk to School, Rocket Gathering, Final Total Reveal, Field Sessions, Popsicle Party
- Six funding priorities: Student Support Staff, STEM Lab, Organized Sports at Lunch Recess, School Garden, Arts & Cultural Enrichment, Campus Safety & Facility Upgrades
- Hashtag: #ROCKETRALLY2026 · Tagline: "One school. One community. One rally."

## CONTENT FUNDAMENTALS
- **ALL CAPS, short, declarative.** Sentences are 2–5 words and end with a period, even fragments: "HEY RED HILL." / "WE HAVE LIFTOFF." / "MISSION ACCOMPLISHED."
- **Direct address to the community as a collective**: "Hey Red Hill", "Red Hill, you rallied." Second person plural; the PTA speaks as mission control.
- **Mission-control vocabulary**: liftoff, countdown, T-minus (T-05 DAYS), mission, rally status, final countdown, ready for takeoff, launch.
- **One red word per line.** Emphasis = the key word set in Red Hill Red, rest black/white: "IT'S TIME TO **RALLY**." / "KEEP IT **MOVING**."
- **Numbers are heroes.** Dollar amounts, percentages, countdown digits get display scale: "$100", "82%", "T-05".
- **Dates in dot format**: 09.08.26, 10.07.26. Deadlines stated flatly: "5:00 PM DEADLINE".
- **No emoji.** No exclamation points except sparing use ("Thank you to our sponsors!"). Periods do the emphatic work.
- Small metadata lines (labels, dates, attributions) set in Montserrat caps, letterspaced, tiny.

## VISUAL FOUNDATIONS
- **Palette**: exactly three colors — Black #000000, White #FFFFFF (page tone reads as warm off-white #F4F2ED in print contexts), Red Hill Red #E31E24. Red is an accent, never a field for long copy; roughly 5–10% of any composition.
- **Type**: Bebas Neue for headlines/numerals (tight, condensed, always caps); Montserrat for body copy and labels (600–800 weights, caps + letterspacing for labels). No italics.
- **Layout**: poster/editorial grid. Tiles and panels butt against each other; heavy contrast between black panels and white panels. Max 1–2 background colors per composition.
- **Backgrounds**: solid black or solid white/off-white. Photography is high-contrast B&W documentary shots of kids/event, used full-bleed in tiles with white type over dark areas.
- **Graphic elements**: registration crosshairs, plus marks (+), dashed trajectory arrows, barcode strips, diagonal hatching, boxed caps labels ("MISSION CONTROL"). Used as small print-shop marks in corners and margins — decoration is sparse and technical.
- **Corners**: square. Radius = 0 everywhere. No rounded cards.
- **Borders**: 2px solid black (or white on black). Boxed labels use 1–2px borders.
- **Shadows**: none. Flat print aesthetic; hierarchy comes from scale and inversion, not elevation.
- **Cards/tiles**: flat color blocks (black or white), square corners, generous padding, headline + one red accent word + small metadata line.
- **Hover**: invert (black↔white) or shift to red; underline for text links. **Press**: no shrink — color deepens (#A31419).
- **Motion**: minimal and mechanical — hard cuts, step-wise counters (countdown/percentage ticking), no bounces or springs. Ease: linear or ease-out, fast (150–200ms).
- **Transparency/blur**: none. Photography sits behind solid-black protection panels, not gradients.
- **Imagery color vibe**: black & white, high contrast, slight grain; documentary energy (kids running, event arches, crowds).
- **Data displays**: rocket-shaped progress thermometer with red fill; big percentage numerals; tick-mark scales (T-10…T-01 countdown rails).

## ICONOGRAPHY
- No icon font or SVG set was provided. The moodboard uses **thin single-weight line pictograms** (walking figure, megaphone, popsicle, plant, shield) for "experience" and "funding priorities" rows, plus geometric print marks (crosshair, plus, arrow, barcode).
- **Recommendation (substitution, flagged below): Lucide via CDN** — closest match to the thin line style. Keep stroke-width ~1.5, render in black or white only, never red.
- Unicode/geometry is acceptable for print marks: +, →, ▸, tick rails. No emoji, ever.
- **No logo asset was provided.** The moodboard shows an "R" roundel mark, but it cannot be cleanly extracted from a JPG and has not been reconstructed. Wherever a mark would go, render "RED HILL ELEMENTARY" or "ROCKET RALLY." in Bebas Neue. Ask the user for the real logo file.

## Accessibility floor (WCAG 2.2)
- Text: 4.5:1 minimum. Muted text is rgba(0,0,0,.72) on paper / rgba(255,255,255,.78) on black. Red #E31E24 passes on white (4.6:1) and black (4.5:1) — use it for words at 13px+, never for long copy.
- Non-text (1.4.11): borders and meter fills are black or red on white/paper — ≥3:1.
- Sizes: body 16px minimum; labels, hints, captions 13px minimum; icons 40px.
- Leading: body 1.55; display headlines .9 (large text only).

## Index
- `styles.css` — global entry; imports everything below
- `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/fonts.css`
- `guidelines/` — foundation specimen cards (Design System tab)
- `components/core/` — Button, Badge, Input, Card
- `components/campaign/` — CountdownTile, ProgressMeter, StatTile, SponsorBoard
- `ui_kits/rally-site/` — campaign microsite recreation (interactive)
- `thumbnail.html` — project tile
- `SKILL.md` — agent skill entry point

## Intentional additions
- CountdownTile, ProgressMeter, StatTile, SponsorBoard — no component source existed; these are lifted directly from moodboard tiles (countdown panel, thermometer, rally-status tile, sponsor recognition board).

## Caveats / substitutions
- **Fonts**: no font files provided. Bebas Neue and Montserrat loaded from Google Fonts (exact family matches). Both are licensed under the SIL Open Font License 1.1 — free for commercial use, web embedding, print, and merchandise; may be self-hosted and redistributed but not sold standalone. Download the OFL binaries from Google Fonts to self-host.
- **Icons**: Lucide (CDN) substituted for the moodboard's thin line pictograms.
- **Logo**: none provided; brand name rendered in type. Provide the "R" roundel SVG if it exists.
- **Photography**: moodboard photos not extractable; UI kit uses black panels where B&W photos belong, labeled as photo slots.
