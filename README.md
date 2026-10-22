# Raylit

A simple V2Ray / Xray client for the desktop. Paste a share link or a subscription, press the big button, and you are
connected. Built like [Grabbit](https://github.com/amirerajabi/grabbit): Electron + React UI + a Node engine.

- **Protocols:** VMess, VLESS (REALITY, XTLS Vision), Trojan and Shadowsocks over TCP, WebSocket, gRPC, HTTPUpgrade,
  XHTTP, HTTP/2, mKCP and QUIC, read from the usual share links (`vmess://`, `vless://`, `trojan://`, `ss://`).
- **Subscriptions:** add the link from your provider; it updates on its own and shows data used and days left when the
  provider sends them.
- **System proxy or Proxy only:** System proxy points your computer's proxy at Raylit while connected and puts your own
  setting back afterwards (also after a crash). Proxy only just opens HTTP `10819` and SOCKS `10818`.
- **Real delay tests:** each server is tested with a real request through Xray, so "works" means it actually works.
- **Routing:** everything through the server, or Iranian / Chinese / Russian sites direct; optional ad blocking.
- Live speed graph, the core's log, tray icon with Connect / Disconnect, light and dark themes, command palette (Ctrl+K).

Raylit runs [Xray-core](https://github.com/XTLS/Xray-core) (MPL-2.0), which the release builds include unmodified.
Settings → Xray core can download a newer one (checked against the release's SHA-256) or use an `xray` executable you
already have.

## Download

Get the latest version from [Releases](https://github.com/amirerajabi/raylit/releases/latest): `Raylit-Setup-<version>.exe`
for Windows, a DMG for macOS (Apple silicon) and an AppImage for Linux. Xray-core is included. Raylit updates itself
afterwards (Settings → Updates).

The builds are not code-signed yet. On Windows, SmartScreen may warn on first run: choose **More info → Run anyway**. On
macOS, right-click the app and choose **Open** the first time.

## Use

| | |
| --- | --- |
| Add servers | Copy a share link or subscription link, then press **Ctrl+V** in the window (or **Paste**). |
| Connect | The big power button, **Ctrl+Enter**, double-click a server, or the tray menu. |
| Find a fast server | **Test** (Ctrl+T), then **Fastest** to sort by delay. |
| Routing, ad blocking | The **Mode** tab on the left. |

## Development

```bash
npm run setup        # npm install in engine, ui, desktop
npm run dev          # engine on 7330 (token "dev", data in .dev-data/) + UI on http://localhost:5174
npm run dev:desktop  # Vite + Electron
npm run typecheck
npm test             # engine tests; the real-tunnel ones need Xray (RAYLIT_TEST_XRAY=<path>, or v2rayN's copy)
npm run build
npm run dist         # Windows installer into desktop/release/
```

Development runs never change the OS proxy setting (`RAYLIT_NO_SYSPROXY=1` is set for them); set `RAYLIT_SYSPROXY=1`
to test System proxy mode for real. To ship Xray inside the installer, put `xray.exe`, `geoip.dat` and `geosite.dat`
in `desktop/core/` before `npm run dist`.

See [AGENTS.md](AGENTS.md) for the layout and conventions.

## License

MIT
