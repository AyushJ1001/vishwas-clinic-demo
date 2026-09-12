---
target: prescription workspace in app/ClinicApp.tsx
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:/home/ayush/.t3/worktrees/vishwas-clinic-demo/t3code-dbdd7968/app/ClinicApp.tsx"
target_fingerprint: "sha256:ee699946a4a6fe82c8accf5efbed974df18574685fef02671bb77b35b8d298c8"
target_path: /home/ayush/.t3/worktrees/vishwas-clinic-demo/t3code-dbdd7968/app/ClinicApp.tsx
timestamp: 2026-09-12T17-39-29Z
slug: app-clinicapp-tsx
---
## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 2 | The preview updates, but the consultation has no saved, draft, or completed state. |
| 2 | Match between system and real world | 3 | The clinical vocabulary and document model fit the clinic, but follow-up copy promises history linking that does not exist. |
| 3 | User control and freedom | 2 | Chips and picker states can be cleared, but consultation edits have no undo or draft recovery. |
| 4 | Consistency and standards | 3 | The visual system is coherent, but visit type appears twice and custom pickers lack standard selection semantics. |
| 5 | Error prevention | 1 | Required visit type does not gate progress, vital inputs accept unconstrained text, and document demographics remain fixed. |
| 6 | Recognition rather than recall | 2 | Searchable catalogs help, but several controls do not expose their field identity or visible labels. |
| 7 | Flexibility and efficiency | 1 | Catalog search speeds entry, but there are no templates, recent prescriptions, draft recovery, or keyboard accelerators. |
| 8 | Aesthetic and minimalist design | 2 | The form and paper pairing works. The large introduction and duplicate visit controls consume working space. |
| 9 | Error recovery | 1 | Custom catalog save errors can be retried, but catalog loading fails silently and lost consultation work cannot be recovered. |
| 10 | Help and documentation | 1 | A catalog note exists, but the interface does not explain how to finish, save, print, share, or resume. |
| **Total** | | **18/40** | **Poor. Major workflow gaps remain.** |

## Design specificity verdict

The design feels authored for this clinic where it matters most. The real letterhead, A5 paper proportions, clinical labels, searchable catalogs, warm linen, and deep green all support the doctors' familiar workflow.

The shell is less specific. The oversized line "Write the prescription. See the paper take shape.", pill navigation, and large rounded work areas resemble a product introduction. A repeat-use consultation tool should spend more of the first viewport on patient context, current work, and document completion.

The detector found 19 font-size advisories in `app/ClinicApp.tsx`. Fifteen are false positives because the documented design system permits 6 to 11px type inside A5 documents. Four are valid: 10px interface labels or supporting text at lines 359, 392, 414, and 747 fall below the interface type scale.

No reliable browser overlay is visible. The shared browser accepted DOM mutation, but it could not load the detector script from the healthy local server. The fallback evidence is the detector JSON and recorded browser network failures.

## Overall impression

The product has a strong form-and-paper concept, but several controls promise outcomes the implementation cannot deliver. The biggest opportunity is to make prescription completion dependable before adding more visual refinement.

## What's working

- The square A5 document inside the dark preview shell gives doctors a familiar artifact to check.
- Catalog search, clinical grouping, and removable selected chips reduce typing while keeping chosen terms visible.
- Weight, temperature, pulse, blood pressure, and SpO2 place units beside their inputs. Splitting systolic and diastolic blood pressure also reduces ambiguity.

## Priority issues

### P0. The prescription has no working completion action

The printer icon beside "A5 prescription preview" has no handler or accessible name at line 903. There is no save, export, print, or send action elsewhere.

Why it matters: this blocks the product's main job, including urgent phone use.

Fix: add a labeled completion action, validate the document before completion, and show an explicit result such as saved, printed, downloaded, or shared.

Suggested command: `$impeccable harden`

### P1. Visit controls promise records and history that do not exist

"New prescription" claims it creates a consultation record. "Follow-up prescription" claims it links prior clinical history. Both only change local `visitType` state. Navigation also reloads the page, while form data lives only in component state.

Why it matters: doctors cannot trust whether the visit is linked or whether their work will survive navigation.

Fix: make each choice trigger a real workflow, preserve the draft, and expose saved or unsaved status. Until then, rewrite the claims to match the demo.

Suggested commands: `$impeccable shape`, `$impeccable harden`

### P1. The preview can contradict the form

"Age/Sex: 32/F" and "Date: 30/08/26" are fixed values. Examination findings are editable but never passed to the prescription preview. Medicines without explicit directions receive the same fallback values.

Why it matters: a polished document can appear complete while containing unconfirmed or omitted clinical information.

Fix: drive form and preview from one consultation model. Make demographics and date editable, include examination findings, and require confirmation of medicine instructions.

Suggested command: `$impeccable harden`

### P1. The layout favors introduction over consultation and checking

The page header uses a 44.8 to 88px title and up to 160px of combined vertical padding. Visit type then appears twice. Below 1024px, the entire form precedes the preview, whose document text can be as small as 6px without zoom.

Why it matters: repeat desktop use wastes prime space, while mobile users must scroll between entry and review and remember what changed.

Fix: compress the recurring header, keep one visit selector, add a persistent review action, and provide a readable expanded document view.

Suggested commands: `$impeccable layout`, `$impeccable adapt`

### P1. Core controls lack accessible names and state

Catalog triggers announce values such as "2 selected" without naming the clinical field. They omit expanded and selection semantics. Medicine removal and print controls are icon-only. Visit cards communicate selection visually but do not expose radio or pressed state.

Why it matters: keyboard and screen-reader users cannot reliably identify or operate core prescription controls.

Fix: associate labels with controls, expose picker and selection state, use radio semantics for visit type, and name every icon action.

Suggested commands: `$impeccable audit`, `$impeccable harden`

## Cognitive load

Four of eight checks fail, which makes this a high-load workflow under the critique rubric.

- Chunking fails because patient details, vitals, and clinical selections have weak section hierarchy.
- Visual hierarchy fails because introductory copy dominates while the final action is a small unnamed icon.
- Minimal choices fails when expanded clinical categories show many options at once. The catalog should keep search and grouping, but disclose categories more deliberately.
- Working memory fails on mobile because entry and preview are far apart and there is no persistent patient summary or review mode.

Single focus, grouping, one-thing-at-a-time behavior, and progressive disclosure pass.

## Emotional journey

The clinic letterhead and live paper preview establish confidence early. That confidence drops when "required" choices do not enforce anything, follow-up history never appears, and the final print control does nothing. The workflow ends without proof that the prescription was saved or produced.

## Persona red flags

- Jordan, a first-time user, sees visit type twice and cannot tell whether these are separate requirements. Follow-up promises a next step that never appears. The only apparent output control is an unlabeled icon.
- Sam, a keyboard or screen-reader user, hears values such as "2 selected" without knowing which field they belong to. Several remove and print controls have no names, and visit selection has no programmatic state.
- Casey, a distracted mobile user, reaches the preview only after the full form. There is no persistent draft, reachable completion action, or document zoom. Some removal targets are also smaller than the main form controls.

## Minor observations

- "Select doctor" removes the outline without supplying a replacement focus indicator.
- Catalog fetch errors are swallowed, so a failed request looks like an empty custom catalog.
- The catalog note explains data terminology instead of helping the doctor complete the consultation.
- Scroll-linked preview scale and opacity can make a checking surface unstable, and the code has no reduced-motion handling.
- Long documents have no pagination or overflow warning.
- Four 10px interface labels sit below the documented type scale. The other 15 detector findings correctly use the smaller document-detail range.

## Questions to consider

- Should repeat visits open directly on patient identity and the active consultation, with the introductory statement reduced or removed?
- What should appear immediately after selecting "Follow-up prescription" to prove the prior visit is linked?
- Which details must the doctor explicitly review before printing, downloading, or sharing the prescription?
