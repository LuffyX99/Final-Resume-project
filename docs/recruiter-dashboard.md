# Recruiter Dashboard — Implementation Notes

## Plan

### Goal

Give a recruiter one workspace to post a role, manage its lifecycle, review
applicants ranked by a blended final score, and open an individual application.
All server data is read from the API when a screen opens and re-read after every
action.

### User flow

1. `/recruiter` — dashboard with the **My Jobs** table (status, applicants,
   shortlisted, edit/close actions), status filter, pagination, and refresh.
2. `/jobs/new` — post a job with title, company, description, and a tag-style
   required-skills input.
3. `/jobs/:id/edit` — edit the same fields. The page fetches the job live and
   checks ownership before rendering the form.
4. `/jobs/:id/applicants` — applicants ranked by **Final Score**, with
   Similarity, Trust, matched/missing skills, shortlist toggle, and links to
   each application. Empty state offers **Find matches**.
5. `/jobs/:jobId/applicants/:matchId` — one application: MatchCard summary,
   score breakdown, skill alignment, resume, shortlist action.

### Data-freshness contract

- `useLiveResource(key, loader)` owns the single in-screen copy of a resource.
  A key change fetches fresh data; `refresh()` re-fetches after mutations.
- No server response is optimistically patched into the UI:
  - create/edit → navigate to a page that fetches on mount;
  - close/shortlist → `await` the mutation, then `refresh()`;
  - compute matches → `await` compute, then `refresh()`.
- Mutations never throw into a stale local copy: failures keep the current
  row/page and show an alert with a retry.
- Stale responses are ignored (request-id guard), so a slow request cannot
  overwrite newer data.

### Score semantics

The API exposes semantic `similarity_score` and each side's skills. The
recruiter score is derived in one pure module (`src/lib/matchInsight.ts`):

- **Required skills** = recruiter-entered `required_skills`, or extracted
  `skills` when no requirements were entered.
- **Matched** = required skills present in `candidate_skills`, case-insensitive.
- **Missing** = required skills not present.
- **Trust** = matched / required (falls back to similarity when no skills are
  listed).
- **Final** = `0.65 × similarity + 0.35 × trust`.

If the API later returns `final_score`, `trust_score`, `matched_skills`, or
`missing_skills`, those values take precedence; the derivation is only a
compatibility layer. Ranking is by Final Score (ties: similarity, then name)
and is recalculated from the fetched payload on every load.

### API addition

`GET /api/jobs/{job_id}/applicants/{match_id}` returns the job, match, and
resume for a recruiter who owns the job (admins included). Candidate-owned
resumes stay private to the candidate; access is authorized through the
job/match relationship. No migration is required.

### Reused / extended components

| Component | Use |
|---|---|
| `DataTable` | My Jobs, ranked applicants; optional cell wrapping, row class, pagination toggle |
| `ScoreBadge` | Final Score and score cards |
| `MatchCard` | Application summary; optional score/subtitle override and non-link mode |
| `StatusBadge` | Open/closed job state |
| `ScoreMeter` | Compact similarity/trust bars |
| `SkillAlignment` | Matched/missing chips |
| `SkillTagInput` | Required-skills tag editor |
| `JobForm` | Shared create/edit form |

## Automated verification

```bash
# Frontend
cd apps/web
npm run lint
npx tsc -b
npm run test
npm run build

# Backend
cd apps/api
python -m pytest -q
```

Last run: frontend 83 tests passing, backend 72 tests passing, lint/typecheck
clean, production build succeeds.

## Test checklist

### Post a job

- [ ] `/jobs/new` shows title, company, description, and tag input.
- [ ] Enter and comma both add a tag; duplicates are ignored
      case-insensitively; paste splits comma/newline values.
- [ ] Backspace on an empty draft removes the last tag; each tag has an
      accessible remove button.
- [ ] Submitting empty required fields shows inline errors and does not call
      the API.
- [ ] Valid submit posts `required_skills`, then lands on `/recruiter` where
      the table is fetched fresh and the new job appears.
- [ ] API failure keeps the form values and shows the server message.

### My Jobs

- [ ] Table shows role/company, status pill, applicant count, shortlisted
      count, posted date, and edit/applicants/close actions.
- [ ] All/Open/Closed filters call `/jobs/mine?status=…` and reset to page 1.
- [ ] Next/Previous request the correct `skip`/`limit` page from the API.
- [ ] Close asks for confirmation; confirming calls the API and re-fetches the
      list; the row becomes Closed and the close action is disabled.
- [ ] A failed close keeps the row and shows an alert.
- [ ] Edit opens the live job, prefilled; saving returns to a freshly fetched
      dashboard.
- [ ] A recruiter who is not the owner cannot edit another recruiter's job.
- [ ] Empty state and Post a job CTA are visible when there are no jobs.

### Applicants

- [ ] Empty job shows “No ranked applicants yet”; Find matches calls
      `/matches/compute` and re-fetches job + matches.
- [ ] Candidates are ordered by Final Score, not the API's similarity order.
- [ ] Each row shows rank, candidate, Final Score, Similarity, Trust, matched
      (+) and missing (−) skills, shortlist state, and an application link.
- [ ] With no required skills, the view says ranking uses similarity.
- [ ] Shortlist toggle calls `PATCH /matches/:id`, then re-fetches both the
      list and job counts; no optimistic flip.
- [ ] Failed toggle/shortlist refresh shows an alert.
- [ ] Refresh button re-reads the API; browser back from a detail page
      re-fetches on mount.
- [ ] Another recruiter/candidate opening the URL gets an error state
      (backend 403).

### Application details

- [ ] Candidate name, job title/company, status, submission date, and file name
      are shown.
- [ ] MatchCard summary renders with the Final Score (no broken resume link).
- [ ] Final, Similarity, and Trust values match the list ranking.
- [ ] Matched/missing skills and “N of M required skills matched” are shown.
- [ ] Full resume content and candidate skills are read live from the
      job-scoped endpoint.
- [ ] Shortlist toggle re-fetches the application and job shortlisted count.
- [ ] Missing/inaccessible application shows a retry state with the API detail.
- [ ] Back link returns to the job's applicants.

### Regression / UI

- [ ] `DataTable`, `ScoreBadge`, and `MatchCard` existing tests still pass.
- [ ] Dark neon theme, glass cards, mono numerals, and responsive table scroll
      match the rest of the app.
- [ ] Keyboard: form inputs, tag removal, filters, close confirmation, and
      shortlist buttons are reachable and labelled.
- [ ] `npm run lint`, `npx tsc -b`, both test suites, and `npm run build` pass.

## Known boundaries

- Applicant matches are limited to the API's top 100 by similarity before the
  client re-ranks them; the existing matcher stores the top 10 for a job.
- Recomputing matches replaces saved scores and clears existing shortlist flags
  (existing API behavior), so the UI only offers Find matches when none exist.
- The 65/35 weights live in `src/lib/matchInsight.ts`; adjust there if the
  product weighting changes.
