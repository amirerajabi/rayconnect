# Status

Version 0.1.0: first release, published from https://github.com/amirerajabi/raylit (tag v0.1.0).

## Works (verified on Windows with Xray 26.9.30)

- Import of vmess / vless / trojan / ss links and base64 blocks; subscriptions with usage info and auto-update.
- Connect / disconnect through Xray; System proxy mode with backup and restore (tested against a fake OS proxy);
  Proxy only mode; switching modes while connected.
- Real delay tests through a batch Xray process (TCP ping when no core is installed).
- UI: connection panel, server list, groups and subscriptions dock, Mode panel, details and log, settings, palette,
  light and dark themes. Checked in the browser build.
- The Electron app with a throwaway profile (`RAYLIT_USER_DATA`, `RAYLIT_SMOKE_SHOT`): window renders, the engine
  starts, auto-connect works, the tray switches to "Connected" with the green icon and back, and quitting stops Xray.
  The tray logs each state as `tray: …` on stdout.
- Ports Windows has reserved (Hyper-V / WinNAT ranges) give their own error instead of "used by another program".
- "Download Xray": `engine/scripts/fetch-core.ts` uses the same code and fetched, checked and unpacked Xray 26.3.27.
- `npm run typecheck`, `npm test` (22 tests) and `npm run build` pass.

## Not verified yet

- Clicking through the tray menu, launch at login and the file picker (need a person at the desktop).
- Running the installer itself. `npm run dist` builds `desktop/release/Raylit-Setup-0.1.0.exe` (unsigned, ~79 MB) with
  `latest.yml` matching it, and the packaged `win-unpacked/Raylit.exe` starts and shows the first-run screen.
- System proxy mode against the real Windows registry (dev runs disable it on purpose).
- macOS and Linux builds (built by the release workflow, never run by hand); System proxy there uses networksetup /
  gsettings and may ask for a password on macOS.
- Live traffic numbers through a real server (the metrics endpoint is read correctly; the local test server had no
  internet to carry traffic).

## Ideas

- TUN mode (route all apps, not only proxy-aware ones), QR codes for share links, Hysteria2 and WireGuard links.
