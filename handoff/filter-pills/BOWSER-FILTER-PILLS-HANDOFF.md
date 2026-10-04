# Bowser — Filter Pills (bordered ovals)

A reusable filter control for Bowser. Not a page redesign: this spec defines **one component** you can drop in wherever a filter is being replaced. Prototype: `prototype/Bowser Filter Pills.dc.html`.

## 1. Design idea
The pill is a **ring, not a fill**. State lives entirely in the border color; the inside stays the page background. Label color never changes. This keeps a row of pills quiet until one is on, then the green ring reads instantly.

## 2. Spec
| Property | Default (40px) | Small (32px) |
|---|---|---|
| Height | 40px | 32px |
| Padding | 0 20px | 0 14px |
| Radius | 999px | 999px |
| Border | 2px solid | 2px solid |
| Font | Poppins 14px / 500 | Poppins 12.5px / 500 |
| Gap between pills | 10px | 8px |
| Fill | `#0E0E0E` (page bg) — on a `#181818` panel use `#181818` | same |

| State | Ring | Label |
|---|---|---|
| Off | `#3A3A3A` | `#EDEDED` |
| Hover | `#EDEDED` | `#EDEDED` |
| On | `#3ECF8E` | `#EDEDED` |
| Disabled | `#262626` | `#4A4A4A`, `cursor: not-allowed` |
| Focus-visible | On ring + `outline: 2px solid rgba(62,207,142,.35); outline-offset 2px` | — |

No shadows, no gradients, no fill change on state. Transition `border-color 120ms`.

### Optional inner parts
- **Count**: trailing span, 12px/600, `#3ECF8E` when on, `#8A8A8A` when off, 8px gap. Omit when zero/empty.
- **Caret** (dropdown pill): 10×6 chevron `#8A8A8A`, 10px gap, right padding reduces to 16px.

## 3. Variants
1. **Toggle pill (multi-select)** — each pill is independent on/off. Use for "Game Lines / Top 25"-style modifiers.
2. **Segmented pills (single-select)** — exactly one pill on at a time. Use for ranges (This week / Season / Last 4 / Last 8), position groups, etc. Same visual, exclusive logic.
3. **Dropdown pill** — opens a popover of checkboxes. Ring is green while ≥1 option is chosen; count shows how many. Popover: `#181818`, `1px solid #2E2E2E`, radius 12px, padding 8px, shadow `0 12px 32px rgba(0,0,0,.5)`, items 32px rows with 16px checkbox (green fill + dark check when on).

## 4. Where it can replace existing controls
- Gray segmented controls in app/status bars (Teams, Pos, Leagues, Status) → **dropdown pill**.
- Underlined text toggles like "All (30) / Offense (28) / K-DST (2)" → **segmented pills** with counts.
- Checkbox-style modifiers ("Hide players with 0 snaps") → **toggle pill**.
Replace only what the prompt asks for; the component is a template, not a mandate.

## 5. Implementation notes
- Render as `<button type="button" aria-pressed={on}>`; dropdown pill uses `aria-haspopup="listbox" aria-expanded`.
- Keep pill rows in a flex container with `gap`, `flex-wrap: wrap`.
- Labels are sentence case ("Game lines"), not uppercase; never truncate — let the row wrap.
- Font: inherit the app's Poppins stack; numbers inside pills stay Poppins (mono is for data cells only).

## 6. Acceptance
- [ ] Off/hover/on/disabled rings match hex values above; label stays `#EDEDED`.
- [ ] 40px and 32px sizes both available.
- [ ] Count and caret slots render correctly and vanish when unused.
- [ ] Single-select variant enforces exclusivity; toggle variant does not.
- [ ] Dropdown pill ring goes green when ≥1 option is checked.
- [ ] Keyboard: Tab focus ring visible, Space/Enter toggles.
