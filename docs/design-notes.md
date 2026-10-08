# Design notes

Researched 2026-10-08. Sources: Apple HIG on Liquid Glass (hierarchy, harmony, consistency;
[summary](https://www.createwithswift.com/liquid-glass-redefining-design-through-hierarchy-harmony-and-consistency/)),
Material 3 Expressive (shape, spring motion, variable-font typography;
[Android Developers](https://android-developers.googleblog.com/2025/08/introducing-material-3-expressive-for-wear-os.html)),
Linear's [design refresh](https://linear.app/now/behind-the-latest-design-refresh) ("structure should be
felt, not seen"; speed as a design feature), Things (calm, one primary action), Arc (keyboard-first).

## What we take from each

| Source                | Principle                                                        | How Dhakerni applies it                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liquid Glass          | Controls float above content on translucent glass; content leads | Only the bottom dock is glass (`.glass`: blur 22px, saturate 1.6, 1px edge highlight). Lists stay opaque so text contrast is never at the mercy of what is behind it. |
| Material 3 Expressive | Springy, spatial motion; shape carries meaning                   | One spring easing (`--ease-spring`) for state changes (mic press, radio dot). Shape by role: pill = actions, 20px = cards, 12px = fields.                             |
| Material 3 Expressive | Variable fonts                                                   | Readex Pro (variable weight, Arabic + Latin in one family) so mixed Derja/French lines share rhythm.                                                                  |
| Linear                | Structure felt, not seen                                         | Hairline `--line` dividers only inside grouped lists; no card borders.                                                                                                |
| Linear / Things       | Instant, optimistic, one primary action                          | The mic is the largest, only saturated element on screen. Interactions target <100 ms.                                                                                |
| Arc                   | Keyboard-first                                                   | All controls are real buttons/links with visible focus; shortcuts arrive with the task list.                                                                          |

## Identity

Tunisian whitewash walls, a door-blue arch, a small sun. The mark is an arch with a sun dot.
Sun yellow is reserved for time and reminders so it keeps its meaning.

| Token                  | Light     | Dark      |
| ---------------------- | --------- | --------- |
| paper                  | `#f2f5f4` | `#0d1117` |
| surface                | `#ffffff` | `#161b24` |
| ink                    | `#11161d` | `#edf0f4` |
| ink-2 (secondary text) | `#465160` | `#9aa6b6` |
| door (primary)         | `#2152d1` | `#7a9dff` |
| sun (time)             | `#f0b429` | `#f2bc4b` |

Light and dark follow the system via `prefers-color-scheme`. Secondary text and primary on paper are
chosen to clear WCAG AA (4.5:1); re-verify when adding colors.

## Type scale (rem, base 16px)

12 micro · 14 small · 16 body · 20 lead (500) · 26 title (600, -0.01em). Arabic uses line-height 1.75
and no negative tracking. Line length capped near 28ch for empty states, `max-w-xl` for lists.
Mixed-script text uses `unicode-bidi: plaintext` (`data-bidi`) so each line picks its own direction.

## Spacing, layout

4 px grid. Single column, max 36rem, centered on desktop; on phones the dock sits at the bottom within
thumb reach with `env(safe-area-inset-bottom)`. All CSS uses logical properties (`ps-`, `me-`, `start`);
directional icons mirror under `rtl:`.

## Motion

120 ms (press), 220 ms (state), 360 ms (entrance). Motion answers an action; nothing animates on its
own except the first appearance of a screen. `prefers-reduced-motion` collapses all durations.
Recording waveform, task creation, chips and completion get bespoke motion in later phases.

## Avoided on purpose

Purple gradients, default shadcn styling, emoji icons, centered card on gray, same radius everywhere.
