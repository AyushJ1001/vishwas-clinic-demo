---
name: Vishwas Clinic
description: A warm, quiet clinical workspace built around paper-aware consultation workflows.
colors:
  consultation-green: "#15362f"
  preview-green: "#123930"
  warm-signal: "#d85f39"
  warm-signal-deep: "#b85a36"
  clinic-linen: "#f4f1e9"
  work-surface: "#fbfaf5"
  prescription-paper: "#fffef9"
  pure-white: "#ffffff"
  paper-ink: "#202c29"
  muted-text: "#60736c"
  soft-surface: "#ece7dc"
  chip-surface: "#e9e4d8"
  alert-surface: "#fff7f0"
typography:
  display:
    fontFamily: "Outfit, Arial, sans-serif"
    fontSize: "clamp(2.8rem, 5vw, 5.5rem)"
    fontWeight: 500
    lineHeight: 0.94
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "Outfit, Arial, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Outfit, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1.25
    letterSpacing: "0.04em"
  body:
    fontFamily: "Outfit, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Outfit, Arial, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "0.2em"
rounded:
  control-sm: "12px"
  control: "15px"
  inset: "16px"
  popover: "18px"
  decision: "24px"
  metric: "28px"
  workspace: "30px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  surface: "20px"
  lg: "24px"
  xl: "32px"
  card: "36px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.warm-signal}"
    textColor: "{colors.pure-white}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0.85rem 1.3rem"
  button-secondary:
    backgroundColor: "{colors.pure-white}"
    textColor: "{colors.consultation-green}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.625rem 1.25rem"
  nav-active:
    backgroundColor: "{colors.consultation-green}"
    textColor: "{colors.pure-white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1rem"
  input:
    backgroundColor: "{colors.pure-white}"
    textColor: "{colors.consultation-green}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.85rem 1rem"
    height: "50px"
  chip-selected:
    backgroundColor: "{colors.chip-surface}"
    textColor: "{colors.consultation-green}"
    rounded: "{rounded.pill}"
    padding: "0.35rem 0.6rem"
  workspace-card:
    backgroundColor: "{colors.work-surface}"
    textColor: "{colors.consultation-green}"
    rounded: "{rounded.workspace}"
    padding: "36px"
  preview-shell:
    backgroundColor: "{colors.preview-green}"
    textColor: "{colors.pure-white}"
    rounded: "{rounded.workspace}"
    padding: "20px"
  document-paper:
    backgroundColor: "{colors.prescription-paper}"
    textColor: "{colors.paper-ink}"
    rounded: "0"
    padding: "32px"
---

# Design system: Vishwas Clinic

## Overview

**Creative North Star: "The Calm Clinical Workbench"**

The system turns a familiar clinic desk into a focused digital workspace. Warm linen surrounds the work, paper previews stay visually literal, and deep green gives the interface a steady clinical anchor. The result should feel composed and useful during a consultation, not ornamental.

Controls are quiet and clinical. Generous type and rounded work areas keep dense form entry from feeling cramped, while rust appears only when an action or status needs attention. The interface avoids the chill and visual overload of hospital enterprise software without drifting into lifestyle branding.

**Key characteristics:**

- Warm, composed, and pragmatic.
- Desktop-first density with complete mobile usability.
- Paper-aware document previews beside structured form work.
- Quiet controls with clear selected, focused, and active states.
- No cold hospital enterprise styling or generic SaaS dashboard language.

## Colors

The palette pairs warm paper neutrals with deep clinical green and a restrained rust signal.

### Primary

- **Consultation Green** (`#15362f`): Primary text, active navigation, selected decisions, dark summary regions, and strong structural contrast.
- **Preview Green** (`#123930`): The deeper surround used behind live prescription previews.

### Secondary

- **Warm Signal** (`#d85f39`): Primary actions, focus emphasis, change indicators, and data marks that need attention.
- **Warm Signal Deep** (`#b85a36`): Eyebrows, labels, and quieter signal text where the brighter rust would pull too strongly.

### Neutral

- **Clinic Linen** (`#f4f1e9`): The page background and sticky navigation field.
- **Work Surface** (`#fbfaf5`): Main form containers, kept slightly lighter than the page.
- **Prescription Paper** (`#fffef9`): A5 documents and popovers that should feel like warm paper.
- **Pure White** (`#ffffff`): Inputs, quiet buttons, and high-contrast text on dark areas.
- **Paper Ink** (`#202c29`): Text and rules inside generated documents.
- **Muted Text** (`#60736c`): Supporting copy and non-primary labels.
- **Soft Surface** (`#ece7dc`): Hover fills and informational callouts.
- **Chip Surface** (`#e9e4d8`): Selected catalog terms.
- **Alert Surface** (`#fff7f0`): Required decisions and clinic-specific term entry.

### Named rules

**The Work-and-Paper Rule.** Clinic Linen owns the environment, Consultation Green owns structure, and Prescription Paper owns generated documents. Keep those roles stable.

**The Warm Signal Rule.** Warm Signal is reserved for actions, focus, and meaningful change. It should not become a decorative wash across a screen.

## Typography

**Display Font:** Outfit with Arial and sans-serif fallbacks  
**Body Font:** Outfit with Arial and sans-serif fallbacks  
**Label Font:** Outfit with Arial and sans-serif fallbacks

**Character:** One geometric sans-serif carries the entire workspace. Scale, weight, tracking, and case create the hierarchy, which keeps forms and printed documents visually related.

### Hierarchy

- **Display** (500, `clamp(2.8rem, 5vw, 5.5rem)`, `0.94`): Route titles and the prescription workspace statement. Tight negative tracking at `-0.055em` gives these headlines authority without adding another typeface.
- **Headline** (500, `1.875rem`, `1.2`): Major titles inside dark summary regions.
- **Title** (900, `1.5rem`, `1.25`): Clinic and document headings that need compact institutional weight.
- **Body** (400, `1rem`, `1.5`): Form content, descriptions, and interface copy. Supporting route copy rises to `1.125rem` with relaxed leading.
- **Label** (700 to 800, `0.68rem` to `0.75rem`, `0.12em` to `0.2em`, uppercase): Eyebrows, field labels, preview labels, and compact navigation.
- **Document Detail** (400 to 900, `0.375rem` to `0.6875rem`): Dense A5 prescription and certificate content. Use only inside document previews.

### Named rules

**The One-Family Rule.** Outfit carries interface text and document previews. Build hierarchy with scale and weight instead of introducing a second font family.

## Layout

The desktop shell uses a centered container capped at `1500px`, with `40px` side padding at large sizes and `20px` on smaller screens. Main work areas use a 12-column grid. The form occupies seven columns and the live document preview occupies five columns at `1024px` and above. Below that breakpoint, both span the full width and stack vertically.

Route headers use the same asymmetric desktop split as the workspace, with the title at roughly 55 percent and supporting copy at 45 percent. The spacing is intentionally generous around page-level headings and tighter inside form groups. Common gaps move through `12px`, `16px`, `20px`, `24px`, and `32px`; main card padding reaches `36px` to `40px` on desktop.

At `640px`, form groups begin moving from one or two columns into denser arrangements. At `768px`, the pill navigation moves from a horizontally scrolling mobile row into the centered desktop control. At `1024px`, the main split workspace appears. Mobile keeps every primary task available, uses horizontal overflow only for navigation, and avoids shrinking form controls below comfortable touch sizes.

## Elevation & Depth

The system is layered where work happens. Resting controls and secondary cards stay flat, using warm tonal shifts and thin green-tinted borders for separation. Soft ambient shadows lift the active form container, open catalog picker, and document preview from the linen background. Document sheets receive a stronger paper shadow inside their dark preview shell.

### Shadow vocabulary

- **Workspace Ambient** (`0 24px 70px rgba(21, 54, 47, 0.08)`): The main consultation form container.
- **Picker Ambient** (`0 22px 60px rgba(21, 54, 47, 0.18)`): Open catalog panels that float above form content.
- **Preview Ambient** (`0 30px 80px rgba(21, 54, 47, 0.20)`): The dark prescription preview shell.
- **Paper Lift** (`0 25px 50px -12px rgba(0, 0, 0, 0.25)`): A5 document sheets inside preview shells.
- **Action Glow** (`0 12px 28px rgba(216, 95, 57, 0.20)`): Warm Signal primary actions.

### Named rules

**The Working Layer Rule.** Keep resting surfaces flat. Add ambient shadow only when a surface contains active work, opens above another layer, or represents a physical document.

## Shapes

The interface uses a nested radius hierarchy. Workspace regions use `30px` corners, decision panels use `24px`, popovers use `18px`, inset cards use `16px`, and form controls use `15px`. Small icon controls use `12px`, while navigation, chips, and primary actions use full pills. Paper previews are the exception: their square edges preserve the silhouette of a printed A5 sheet.

Borders are usually one-pixel Consultation Green at 10 to 15 percent opacity. Required actions use Warm Signal Deep at roughly 25 percent opacity. Rounded containers should nest from larger outer radii to smaller inner radii rather than repeating one radius everywhere.

## Components

### Buttons

- **Shape:** Primary actions and navigation use pill geometry (`999px`). Compact icon controls use `12px` corners.
- **Primary:** Warm Signal background, white text, `0.85rem 1.3rem` padding, and heavy label weight. It appears only for the next meaningful action.
- **Hover / Focus:** Existing buttons use short `0.2s` transitions. Focusable form controls shift to Warm Signal and add a `3px` translucent focus ring. New button focus states should use the same signal color and remain visible against both linen and green surfaces.
- **Secondary:** White or transparent surfaces with Consultation Green text. Selected decision buttons invert to Consultation Green with white text.

### Chips

- **Style:** Selected clinical terms use Chip Surface, Consultation Green text, a full pill, compact `0.35rem 0.6rem` padding, and a small remove icon.
- **State:** Selected chips are quiet and persistent. Catalog option rows use Consultation Green with white text only on hover or selection.

### Cards / Containers

- **Corner style:** `30px` for workspace regions, `28px` for summary metrics, `24px` for required decisions, and `16px` for inset form rows.
- **Background:** Work Surface for form cards, Pure White for metrics and rows, and Consultation Green or Preview Green for high-contrast summary and document regions.
- **Shadow strategy:** Follow the Working Layer Rule. Summary metric cards are flat until their slow hover lift.
- **Border:** Consultation Green at 10 to 15 percent opacity.
- **Internal padding:** `24px` on compact cards and `36px` to `40px` for desktop workspaces.

### Inputs / Fields

- **Style:** Pure White fill, `15px` radius, a one-pixel translucent green border, `50px` minimum height, and `0.85rem 1rem` padding.
- **Focus:** Warm Signal border with a `3px` ring at 10 percent opacity.
- **Compact fields:** Vital signs and medication directions use `12px` corners with reduced padding while keeping clear labels and practical touch targets.
- **Error / Disabled:** Error copy uses an explicit dark red only where persistence fails. Disabled actions reduce opacity but keep their label legible.

### Navigation

The navigation is sticky on Clinic Linen at 92 percent opacity with backdrop blur and a faint bottom border. The active route is a Consultation Green pill with white text. Inactive routes stay transparent and gain Soft Surface on hover. On mobile, the route list becomes a horizontally scrolling row of white pills beneath the main bar.

### Catalog picker

The picker matches input dimensions at rest. When open, it becomes a warm Prescription Paper panel with an `18px` radius and Picker Ambient shadow. Search occupies a simple bordered header. Category rows use tracked uppercase labels, while item rows stay sentence case for fast scanning.

### Document preview

The signature composition places a square A5 Prescription Paper sheet inside a dark Preview Green shell. The shell carries the preview label and print action; the document itself uses compact type, strict rules, and the real clinic identity. Do not soften the paper with large radii or merge its layout language with the surrounding form.

## Do's and Don'ts

### Do:

- **Do** keep Clinic Linen visible around major work areas so the interface retains warmth.
- **Do** use Consultation Green for structure, selections, and dependable contrast.
- **Do** reserve Warm Signal for primary actions, focus, warnings, and meaningful change.
- **Do** maintain the seven-column form and five-column preview relationship on desktop.
- **Do** preserve square A5 document sheets inside rounded dark preview shells.
- **Do** keep every consultation workflow usable on a phone without hiding core actions.

### Don't:

- **Don't** turn the interface into cold hospital enterprise software with blue-gray chrome, cramped tables, or dense toolbars.
- **Don't** use generic SaaS dashboard patterns when the clinic workflow and paper document are the clearer organizing ideas.
- **Don't** spread Warm Signal across large decorative areas or use it as a second background system.
- **Don't** add shadows to every card or control. Depth belongs where work happens.
- **Don't** introduce another font family merely to create hierarchy.
- **Don't** round the A5 paper previews or make them look like ordinary interface cards.
