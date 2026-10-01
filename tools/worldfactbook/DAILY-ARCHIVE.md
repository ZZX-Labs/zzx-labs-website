# World Factbook daily preservation

`recover_daily_facts.py` handles historical **Fact of the Day** records. It does
not republish source photos, equate a daily fact photo with **Image of the Day**,
or derive leaders and flags from unrelated fact prose.

The included public index begins with **32 source-backed facts**: 31 consecutive
days from 2025-12-15 through 2026-01-14 in the supplied January 15 Wayback
PDF, plus the 2026-02-03 homepage PDF. The supplied pasted transcription
matches all 31 PDF date/title/body pairs. Nineteen days between the two PDF
captures remain unobserved. The first-ever and final publication dates are
not yet established. `api/daily-archive/coverage.json` lists every gap.

## Local backfill

Run the commands from the site checkout root. The store is **private working
material**, and should be placed outside a public Pages checkout.
PDF seeding uses `pdftotext` when available, or the installed `pypdf` or
`PyMuPDF` Python package on systems such as Windows.

```sh
python tools/worldfactbook/recover_daily_facts.py --store /private/daily-store seed \
  --archive-pdf '/incoming/Daily Fact Archive - The World Factbook.pdf' \
  --homepage-pdf '/incoming/The World Factbook - The World Factbook.pdf' \
  --transcription '/incoming/Pasted text.txt'
python tools/worldfactbook/recover_daily_facts.py --store /private/daily-store recover \
  --first-year 1994 --final-year 2026 --max-captures 200
python tools/worldfactbook/recover_daily_facts.py --store /private/daily-store export \
  --api worldfactbook/api/daily-archive \
  --training /private/daily-store/training/cia_daily_facts.jsonl
python tools/worldfactbook/recover_daily_facts.py --store /private/daily-store verify
```

`recover` queries the Internet Archive CDX capture index for the modern
30-day archive and old and new homepages, then examines dated content newest
first. Repeat it until `more_captures_pending` is false. Its per-year CDX
queries, per-capture checkpoints, source HTML hashes, compressed raw captures,
and unresolved failures are retained in the private store. Failed captures
are retried after a cooldown while older captures continue. An empty CDX
response means **no Wayback capture found**, not proof that the CIA published
no feature. The tool never assigns a publication date from the capture date.

The training JSONL is a **source-cited style-study corpus**. Competing source
versions are excluded until reviewed. A future model must retrieve and cite
verified current facts; this tool does not train a model or produce synthetic
CIA quotations. CIA historical text and independent ZZX continuations should
remain labeled separately.

`seed` copies the supplied PDF bytes into the private store by SHA-256. The
public shards retain only source URLs and hashes; no PDFs or private paths.

## Backtest and completion gate

`verify` reports each missing date and conflicting version. `verify --strict`
fails until every date in the reviewed publication range has a dated record,
the full 1994–2026 CDX scan finishes without errors, and a reviewer has
cited independent evidence for both publication endpoints:

```sh
python tools/worldfactbook/recover_daily_facts.py --store /private/daily-store certify-bounds \
  --first-date YYYY-MM-DD --last-date YYYY-MM-DD \
  --first-source 'https://...' --last-source 'https://...' --reviewer 'Name'
python tools/worldfactbook/recover_daily_facts.py --store /private/daily-store verify --strict
```

Do not use the earliest or latest recovered snapshot as proof of an endpoint.
The public `complete_historical_run` flag stays false until all gates pass.

## Browser contracts

- `api/daily-archive/index.json` contains only dated availability, not every
  fact body. `months/YYYY-MM.json` stays below 900 kB per file.
- Every fact carries the exact date label, title, body, source capture URL,
  evidence kind, and source digest. The private HTML stays in the private repo.
- `api/images-of-the-day/index.json`: `records` need an explicit published date
  basis, title/caption, source URL, and an `asset` with locally packaged path,
  alt text, credit, and redistribution status before image bytes render.
- `api/leaders/index.json`: each record needs country, person, office,
  `term_start`, `term_end` (or a bounded `as_of_date`), and a source URL.
  The chosen leader is a clearly labeled ZZX daily selection from verified
  terms, never represented as an original CIA daily choice.
- `api/flags/index.json`: each record needs country, `valid_from`, `valid_to`
  (or bounded `as_of_date`), source URL, and a cleared local `asset` to show
  a flag image. Historic symbols mentioned in the daily facts are not
  automatically a historic Flag of the Day.

The workflow `.github/workflows/zzx-worldfactbook-daily-recovery.yml` runs
this backfill daily after a private-repository credential is configured. Set
the Actions secret `WORLDFACTBOOK_PRIVATE_DATA_TOKEN` to a GitHub token that
can create a private repository in the site owner's account or organization
and read/write its Contents. GitHub documents the organization creation
permission as Repository creation (write) or Administration (write) for a
fine-grained token; a classic personal access token with `repo` scope can
create a private repository. The token must also have access to the newly
created repository. The default name is
`<site-owner>/zzx-worldfactbook-daily-part-0001`. Optionally set the Actions
variable `WORLDFACTBOOK_DAILY_STORE_REPO` to another private `owner/repo`.

The job checks the configured repository's visibility and refuses to clone
or push if it is public. If the name does not exist, it creates a **private**
repository, then loads checkpoints from its actual default branch. With no
private token, the scheduled job records a visible skipped notice before
checkout and does no recovery; a green workflow in that case does **not**
mean the historical corpus is complete. The workflow copies the small public
seed into a private checkpoint store on the first run, pushes raw evidence
and the JSONL corpus only to the private repository, then publishes only the
bounded static JSON to Pages. The existing private chain rollover tool should
govern that repository when it approaches its capacity. The public output
contains no private URL or token.

Run the focused checks with `python tests/test_daily_fact_recovery.py` and
`python tests/test_private_daily_repo.py`.
