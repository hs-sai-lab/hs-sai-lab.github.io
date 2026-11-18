# SAI Lab website

SAI Lab — Signal Augmented Intelligence, Hanshin University.
Site: https://hs-sai-lab.github.io/ · Organization: https://github.com/hs-sai-lab

**Read `guideline.md` first.** It covers design rules, content formats, the management screen, review checklist and handover.

## Layout
| What | Where |
| --- | --- |
| All page content (lab, professor, members, research areas, publications, seminars, news, notices, poem, album, home photos) | `content/` (written by the management screen; do not edit by hand) |
| Pages (Next.js App Router, static export) | `src/app/` |
| Shared components | `src/components/` |
| Content loaders, menus, text marks | `src/lib/` |
| Management screen (Apps Script web app) | `admin/` |
| Checks | `scripts/check-site.py`, `scripts/check-admin.mjs`, `scripts/check-text-marks.mjs` |

Photos and PDFs (seminars, publications, members, album, home, figures, notices) are not kept in this repository.
`content/media-delivery.json` is in `pages_artifact` mode: the Pages build checks out the private repository
`hs-sai-lab/SAI_Pages_Media` and copies the files listed in its manifest for this commit (`scripts/stage-private-media.mjs`).

## Develop
Node 22.
```sh
npm ci
npm run dev                        # http://localhost:3000 (media files are not local; pages still render)
npm run build                      # static export to out/
npm run check                      # local links and personal-information patterns in out/
npm run check:admin-types          # type-check the management screen
npm run check:admin                # management screen routes, forms and texts
npm run check:marks                # notice text marks (**bold**, {blue|…}, {red|…})
npm run build:admin:apps-script    # management screen files for Apps Script → admin/gas-dist/
```

## Deploy
GitHub Actions (`.github/workflows/pages.yml`) checks every pull request and builds every push to `main`;
pushes to `main` deploy `out/` to GitHub Pages (Settings → Pages → Source: GitHub Actions). The workflow needs the
`MEDIA_PAGES_READ_TOKEN` secret (read access to `SAI_Pages_Media`). `draft: true` in `content/lab.yml` keeps the site
out of search engines and adds a footer note.

### Management screen
The management screen runs as a Google Apps Script web app (the intake project of the management repository
`hs-sai-lab/Signal-Augmented-Intelligence-sai-lab-admin`). To update it after changing `admin/`:
1. `npm run build:admin:apps-script`. It writes `admin/gas-dist/Admin.html` (a small shell) and `AdminCode1.html` …
   `AdminCodeN.html` (the screen code in parts), plus `mock.html` for a local look with fake data (not uploaded).
2. `npm run copy:admin:apps-script` opens a local page that copies each file to the clipboard. In the intake Apps
   Script project, replace `Admin` and every `AdminCode*` file with them, and delete leftover `AdminCode*` files if
   the number of parts went down.
3. Deploy → Manage deployments → edit the existing deployment → New version. A new deployment would change the address.

### Media failover (manual)
If the Pages build cannot read `SAI_Pages_Media`, `node scripts/prepare-media-fallback.mjs PATH_TO_SAI_Pages_Media_CHECKOUT`
copies the verified files into `public/` and switches `content/media-delivery.json` to `github` mode. It never pushes;
review, build and check before committing. CI does not run it.

Fonts (SIL Open Font License, via npm): Instrument Sans, Pretendard, STIX Two Text.
