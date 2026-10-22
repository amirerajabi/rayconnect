# Raylit — guide for coding agents

Raylit is a simple V2Ray / Xray desktop client: Electron desktop app + React UI + a Node engine that runs Xray-core.
Its structure, look and conventions follow Grabbit (`C:\Users\AMIR\Desktop\DownloadManager`), which follows Rowlit.

Read [docs/STATUS.md](docs/STATUS.md) first: what works, what is unfinished.

## Layout

| Path | What |
| --- | --- |
| `engine/` | Node + TypeScript, only dependency `ws`. HTTP API under `/api` (bearer token), events on `/ws`. `src/core/Manager.ts` (servers, subscriptions, connect/disconnect, system proxy, delay tests, traffic, log), `links.ts` (share links in and out), `xrayConfig.ts` (Xray JSON), `xray.ts` (find, run and install the core, zip reader), `sysproxy.ts` (OS proxy per platform), `net.ts` (HTTP through a proxy, TCP ping). Tests: `engine/test/engine.test.ts`. |
| `ui/` | React 18 + Vite + zustand + lucide. `src/app/commands.ts` is the command registry (toolbar, menus, palette, tray and shortcuts use it). Stores in `src/store/`. Theme tokens in `src/theme/tokens.css`. |
| `desktop/` | Electron main + preload. Starts the engine as a utility process, window, tray (icon follows the connection), auto-updater. Packaging: `electron-builder.yml`; `desktop/core/` is shipped as `resources/core` when it holds an Xray. |
| `shared/protocol.ts` | Wire types shared by engine, UI and desktop (types only). |
| `scripts/run.mjs` | Dev launchers (`browser`, `desktop-dev`, `desktop`). |
| `engine/scripts/fetch-core.ts` | Downloads the latest Xray-core (SHA-256 checked) into `desktop/core` for release builds. |
| `.github/workflows/` | `ci.yml` (typecheck, tests, UI build), `release.yml` (tag `v*` → installers with Xray → GitHub Release). |

Public repo: https://github.com/amirerajabi/raylit (MIT). Releases there are what installed copies update from.

## Commands

```bash
npm run setup / dev / dev:desktop / typecheck / test / build / dist
```

A change is done when `npm run typecheck`, `npm test` and `npm run build` pass. Check UI changes in the running app
(`npm run dev`, then http://localhost:5174), not only by typechecking.

## Rules

- [.claude/rules/release.md](.claude/rules/release.md): versions, tags, release assets, the auto-updater contract. The
  step-by-step release guide is `.claude/skills/release/SKILL.md`.

- Grabbit's code rules apply: strict TypeScript, comments say why, no hex colours outside `tokens.css`, every user
  action is a command, wire types only in `shared/protocol.ts`, no new dependencies without asking.
- **The machine's proxy is not a test bench.** The developer may run v2rayN (Xray on 10808, set as the system proxy).
  Tests use a fake `SystemProxy`; dev runs set `RAYLIT_NO_SYSPROXY=1`. Never point the real OS proxy at a test run, and
  never stop another client's Xray. Raylit's default ports (10818/10819) avoid v2rayN's.
- Disconnect restores the OS proxy first, then stops Xray: the other order leaves every app without network for a moment.
  The backup of the user's proxy lives in `runtime.json` so a crash is repaired on the next start. Keep both.
- The Xray data folder must be absolute (`Manager` resolves it): Xray runs with its own folder as working directory.
- Newer Xray servers refuse private destinations; test servers need `finalRules: [{ action: 'allow', ip: [...] }]`.
- Every engine behaviour change gets a test; the real-tunnel tests run against a local Xray VLESS server.
