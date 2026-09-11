# Challenge log

Framing challenges raised before or during substantive work, and what came of
them. See the `/challenge` skill.

---

## 2026-09-09 — "Stop the sync PRs that only change `synced_at`"

**Test that fired:** MECHANISM. The ask named a mechanism (update the
`synced_at` field) rather than an outcome.

**Outcome restated:** Leo stops getting daily noise from the Notion content
sync, *and* the sync actually keeps leothesen.com's content current.

**The case that this was the wrong problem:**

Suppressing the `syncedAt` bump treats a symptom of a pipeline that is already
dead. The pull requests Leo was annoyed by stopped arriving four months ago:
the last one is #78, dated 2026-05-07. What actually lands in his inbox now is a
daily *failure* notification from a workflow that has not completed a successful
sync since then. Deduplicating the manifest write would have been the right fix
in April; on its own, today, it repairs a code path that never executes. Ship
only that and the daily email keeps arriving, the site keeps serving four-month-
old Notion content, and the change looks like it worked — because the PR noise
had already stopped for an unrelated reason. The real problem was an unpinned
`pnpm` version in CI (`version: latest`, which has since floated from 10 to
12.3.4, where `ERR_PNPM_IGNORED_BUILDS` became fatal) breaking the pipeline with
no repo change, and nothing distinguishing "sync is quiet because nothing
changed" from "sync is quiet because it is broken".

**Resolution:** Did both, root cause first. Pinned the toolchain via
`packageManager` so CI cannot float again, declared `onlyBuiltDependencies` to
clear the hard failure, *then* made `writeManifest` stamp `syncedAt` only on a
real content change — because once the sync runs again, the daily noise PR comes
straight back.

**Still open:** the 14 stale `sync/notion-*` PRs (#65–#78) are unreviewed noise
and should be closed; nothing distinguishes a quiet sync from a broken one.

---

## 2026-09-12 — "Use all the Notion data available and present it as is"

**Test that fired:** MECHANISM. The ask paired an outcome ("slightly more
modern, clean and professional") with a mechanism ("use all the Notion data
available"), and the mechanism does not serve the outcome.

**Outcome restated:** leothesen.com should look like something Leo designed
rather than a Notion export, without changing a word of what is on it.

**The case that this was the wrong problem:**

There is almost no unused Notion data to surface, so a redesign organised
around "use all the data" would spend its effort on the wrong half of the
problem and pad the page with noise. Counted across all 217 pages: `description`
is set on 5, `published` on 0, `author` on 0, and `order` on 6. The fields that
are fully populated — `title`, `icon`, `cover`, `lastEdited`, `created` — were
already on screen with one exception. Chase the mechanism literally and you end
up rendering an author byline that is null everywhere, a description that is
absent on 212 pages, and a `lastEdited` that is actively misleading: 50 pages
share 2026-03-13 from a single bulk edit. The actual gap was never data. It was
that every visual decision on the site was Notion's default — Notion's ink
`rgb(55,53,47)`, Notion's dark `#2f3437`, the system font stack, a centred emoji
above a centred title — and that 1,038 photographs, most of them 4,032px
originals, were being drawn into a 720px column with 740px of empty gutter
either side. That is a typography and layout problem, and no amount of extra
metadata fixes it.

A second framing was worth stating and rejecting: the site had no analytics for
181 days, so polishing the chrome of a site with no measured audience could be
the wrong work entirely, and distribution the right work. Rejected because
PostHog went live this week, and because a personal site being good is a
legitimate end in itself.

**Resolution:** Did the design work, and took exactly one thing from the data
half — the `created` date. It is populated on all 217 pages, spans 2021-2026,
and had never been rendered; it replaced `lastEdited` in the page header, which
`archive.tsx` had already argued for in a comment and which the header had never
caught up with. Page-level photo counts and collection totals are also counted
rather than stored, from blocks that were already on disk. Nothing invented,
nothing padded.

**Still open:** `description` is the one field that would genuinely earn its
place on a card if it were filled in — it is written on 5 of 217 pages, and the
gallery has a slot waiting for it.
