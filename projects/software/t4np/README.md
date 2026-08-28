# T4NP — The 4 Noble Pillars

`/projects/software/t4np/`

T4NP is a preventative source-code protection suite built around transparent, jurisdiction-aware defensive release controls. The root controller coordinates eight operator-defined jurisdiction profiles for source inventory, provenance, checksum manifests, license/build gates, human review, and explicit distribution policy.

## Root controller

The T4NP root page is the family controller and shared policy workbench. It provides:

- local source-file SHA-256 inventory;
- eight jurisdiction-profile selectors;
- family/route inventory from `FAMILY.json`;
- checksum and provenance planning;
- signed/reviewed release-manifest controls;
- license and build gates;
- human-review and fail-closed release controls;
- machine-readable distribution-policy output;
- guard-status inspection;
- JSON protection-plan export.

The implementation is deliberately transparent and defensive. It does **not** damage source code, execute on remote systems, collect credentials, deploy persistence, hide payloads, or silently modify a host.

## T4NP jurisdiction modules

- **RedPanda** — PRC / China (`CN`) — `/projects/software/t4np/redpanda/`
- **AmurTiger** — Russia (`RU`) — `/projects/software/t4np/amurtiger/`
- **ManchurianTiger** — DPRK / North Korea (`KP`) — `/projects/software/t4np/manchuriantiger/`
- **PersianLeopard** — Iran (`IR`) — `/projects/software/t4np/persianleopard/`
- **NubianIbex** — Israel (`IL`) — `/projects/software/t4np/nubianibex/`
- **MarkhorSheep** — Pakistan (`PK`) — `/projects/software/t4np/markhorsheep/`
- **ArabianLeopard** — Saudi Arabia (`SA`) — `/projects/software/t4np/arabianleopard/`
- **WestAfricanLion** — Nigeria (`NG`) — `/projects/software/t4np/westafricanlion/`

## Reserved / not assigned

- **Syria** remains unassigned in `FAMILY.json`. No codename or module route is fabricated.

## Family schema

- Schema: `zzx.t4np.family.v2`
- Root: `/projects/software/t4np/`
- Modules: `8`
- Destructive actions: `false`
- Remote execution: `false`
- Credential collection: `false`

## Files

- `index.html` — root project/workbench page
- `t4np.js` — root family controller and protection-plan logic
- `t4np.css` — project-specific root styling
- `FAMILY.json` — canonical T4NP family map
- `manifest.json` — root project metadata
- `style.css`, `script.js`, `hook.css`, `hook.js` — standardized ZZX-Labs project shell
- `logo.png` — existing deployment-owned project logo; unchanged by this update

Version: `0.1.0-alpha`  
License: `MIT`
