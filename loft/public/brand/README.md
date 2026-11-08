# Stash brand kit

The mark is a ladder rising into an attic hatch. The wordmark is "Stash." in Geist 400 with a blue full stop.
Every SVG has the word converted to outlines, so it renders the same without the font installed.

## Colours
| Name | Hex | Use |
| --- | --- | --- |
| Ink | `#111111` | mark and word on light backgrounds; app icon background |
| Paper | `#fafafa` | mark and word on dark backgrounds; light backgrounds |
| Blue | `#1f45d8` | the full stop on light backgrounds |
| Blue on dark | `#7d97ff` | the full stop on dark backgrounds |

## Files
| Folder | What | When to use |
| --- | --- | --- |
| `mark/` | The icon alone: `stash-mark.svg` (takes the text colour), black, white; PNGs 64 to 1024 px tall | Avatars, small spaces, anywhere the name is already shown |
| `lockup/` | Icon + word, `horizontal` and `stacked`; default (ink + blue), `on-dark`, `mono-black`, `mono-white`; PNGs | Headers, documents, slides, partner pages |
| `app-icon/` | White mark on an ink square (square corners: iOS and Android round them). `light` is the reverse. `maskable` keeps the mark inside Android's safe circle. PNGs at 1024, 512, 192, 180, 167, 152, 120 | Home-screen icons, app stores, PWA manifest |
| `favicon/` | `favicon.svg` (bare mark, ink on light tabs, white on dark tabs); `favicon.ico` and PNGs (small ink tile, readable on any tab) | Browser tabs |
| `social/` | 1200 × 630 card with the horizontal lockup | Link previews (Open Graph, X, Slack, iMessage) |

## Wired into the site (Next.js file conventions)
- `src/app/icon.svg` = `favicon/favicon.svg`
- `src/app/favicon.ico` = `favicon/favicon.ico`
- `src/app/apple-icon.png` = `app-icon/png/stash-app-icon-180.png`
- `src/app/opengraph-image.png` = `social/stash-og-1200x630.png`
- `src/app/manifest.ts` lists the 192/512 app icons and maskable versions

## Lockup rules
- Pick a base font size F. The icon is 0.75 F tall (the full height of Geist's "S" at size F).
- The word is set at 0.85 F, centred vertically on the icon.
- The gap between icon and word is 0.26 F.
- Clear space around any lockup: at least the gap width on every side.
- Don't recolour the mark, stretch it, add effects, or set the word in another typeface.

## Mark geometry (for redrawing)
Hatch: parallelogram 50 tall, bottom edge 130 wide, skewed 60 to the right; sharp corners radius 10, blunt corners 6.
Gap 10. Ladder: 150 tall (1:3 with the hatch), top edge exactly as wide as the hatch's bottom edge, right foot under the hatch's right tip.
Rails and rungs 24 thick, two rungs centred at 30% and 70% of the ladder height; ladder corners radius 2.
