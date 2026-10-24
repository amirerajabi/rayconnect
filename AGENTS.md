# RayConnect — guide for coding agents

RayConnect is a simple V2Ray / Xray desktop client: Electron desktop app + React UI + a Node engine that runs Xray-core.
Its structure, look and conventions follow Grabbit (`C:\Users\AMIR\Desktop\DownloadManager`), which follows Rowlit.

Read [docs/STATUS.md](docs/STATUS.md) first: what works, what is unfinished.

## Layout

| Path | What |
| --- | --- |
| `engine/` | Node + TypeScript, only dependency `ws`. HTTP API under `/api` (bearer token), events on `/ws`. `src/core/Manager.ts` (servers, subscriptions, connect/disconnect, system proxy, delay tests, traffic, log), `links.ts` (share links in and out), `xrayConfig.ts` (Xray JSON), `xray.ts` (find, run and install the core, zip reader), `sysproxy.ts` (OS proxy per platform), `net.ts` (HTTP through a proxy, TCP ping). Tests: `engine/test/engine.test.ts`. |
| `ui/` | React 18 + Vite + zustand + lucide. Layout: glass top bar, icon rail (`components/layout/Rail.tsx`) and one page at a time (`src/pages/`: Home, Servers, Subscriptions, Log, Settings). The same app rendered with `#tray` is the tray panel (`components/Tray/TrayPanel.tsx`). `src/app/commands.ts` is the command registry (pages, palette, tray menu and shortcuts use it). Stores in `src/store/`. Theme tokens in `src/theme/tokens.css`. Text: `src/i18n.ts` + `src/i18n-fa.ts`. |
| `desktop/` | Electron main + preload. Starts the engine as a utility process, the main window, the tray icon (follows the connection; left click opens the panel window from `tray-panel.ts`, right click the menu), auto-updater. Packaging: `electron-builder.yml`; `desktop/core/` is shipped as `resources/core` when it holds an Xray. |
| `shared/protocol.ts` | Wire types shared by engine, UI and desktop (types only). |
| `shared/routing.ts` | How routing-rule entries are read (sites, IPs, `geosite:` …); code both the engine (Xray config) and the UI (preview) run. |
| `scripts/run.mjs` | Dev launchers (`browser`, `desktop-dev`, `desktop`). |
| `scripts/check-i18n.mjs` | `npm run check:i18n`: every UI string has a Persian translation (CI runs it). |
| `engine/scripts/fetch-core.ts` | Downloads the latest Xray-core (SHA-256 checked) into `desktop/core` for release builds. |
| `.github/workflows/` | `ci.yml` (typecheck, tests, UI build), `release.yml` (tag `v*` → installers with Xray → GitHub Release). |

Public repo: https://github.com/amirerajabi/rayconnect (MIT). Releases there are what installed copies update from.

## Commands

```bash
npm run setup / dev / dev:desktop / typecheck / test / build / dist
```

A change is done when `npm run typecheck`, `npm test`, `npm run check:i18n` and `npm run build` pass. Check UI changes
in the running app (`npm run dev`, then http://localhost:5174; the tray panel at http://localhost:5174/#tray), in
English and in Persian, not only by typechecking.

Electron smoke run with a throwaway profile (PowerShell): set `RAYCONNECT_NO_SYSPROXY=1`, `RAYCONNECT_USER_DATA=<scratch>`,
`RAYCONNECT_SMOKE_SHOT=<main.png>` and optionally `RAYCONNECT_SMOKE_TRAY_SHOT=<tray.png>`, then run
`desktop\node_modules\electron\dist\electron.exe desktop`. It captures, prints `tray: …` / `smoke: …` lines and quits.

## Rules

- [.claude/rules/release.md](.claude/rules/release.md): versions, tags, release assets, the auto-updater contract. The
  step-by-step release guide is `.claude/skills/release/SKILL.md`.

- Grabbit's code rules apply: strict TypeScript, comments say why, no hex colours outside `tokens.css`, every user
  action is a command, wire types only in `shared/protocol.ts`, no new dependencies without asking.
- **The machine's proxy is not a test bench.** The developer may run v2rayN (Xray on 10808, set as the system proxy).
  Tests use a fake `SystemProxy`; dev runs set `RAYCONNECT_NO_SYSPROXY=1`. Never point the real OS proxy at a test run, and
  never stop another client's Xray. RayConnect's default ports (10818/10819) avoid v2rayN's.
- Disconnect restores the OS proxy first, then stops Xray: the other order leaves every app without network for a moment.
  The backup of the user's proxy lives in `runtime.json` so a crash is repaired on the next start. Keep both.
- The Xray data folder must be absolute (`Manager` resolves it): Xray runs with its own folder as working directory.
- Newer Xray servers refuse private destinations; test servers need `finalRules: [{ action: 'allow', ip: [...] }]`.
- Every engine behaviour change gets a test; the real-tunnel tests run against a local Xray VLESS server.
- **Two languages.** English is the default; Persian turns the UI right-to-left. Write UI text in English through
  `t('…')` (or `useT()` in components) and add its Persian to `ui/src/i18n-fa.ts`. In CSS use logical properties
  (`margin-inline-start`, `inset-inline-end`, `text-align: start`), never left/right, except where the OS dictates
  the side (the title bar). Numbers with units get `unicode-bidi: plaintext` (`.tabular`), or "3 ms" reads "ms 3".
  Engine messages and log lines stay English.
