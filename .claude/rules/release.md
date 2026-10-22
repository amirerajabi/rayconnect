# Release rules (Grabbit's, for Raylit)

- **One version for everything:** `package.json`, `engine/`, `ui/`, `desktop/` (all via `npm version <v>
  --no-git-tag-version` so the lock files follow) and `ENGINE_VERSION` in `engine/src/http/server.ts`.
- **The tag is `v<version>`** and must match `desktop/package.json`; the release workflow refuses anything else. Every
  release needs `docs/release-notes/v<version>.md` (the workflow uses it as the release body).
- **Release assets have no spaces in their names** (GitHub would rename them and break `latest*.yml`). The
  `artifactName` patterns in `desktop/electron-builder.yml` set this; keep them.
- **The auto-updater contract:** installed copies read `latest.yml` (Windows), `latest-mac.yml` and `latest-linux.yml`
  from the newest release of `amirerajabi/raylit` (`publish:` in `electron-builder.yml`). The release workflow checks
  that all three exist, name this version and point at uploaded files. Never remove those checks.
- **A version that shipped is never rebuilt under the same number.** Installed copies compare versions, not checksums.
  Fix forward with the next patch version.
- **Xray ships inside every build:** the release workflow runs `engine/scripts/fetch-core.ts` (latest Xray-core release,
  SHA-256 checked) into `desktop/core` before packaging. Locally, `desktop/core` stays empty unless you fill it.
- **Unsigned builds:** SmartScreen warns on Windows and macOS cannot auto-install (the updater only announces). The
  release notes say how to get past the warnings.
- **Publishing is public:** push, tag and release only when the user asked in this session. A release can be hidden with
  `gh release edit <tag> --draft=true`; ask before deleting a release or a tag.
