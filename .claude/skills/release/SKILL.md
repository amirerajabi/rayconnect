---
name: release
description: Publish a new Raylit version to GitHub Releases (bump every package, write release notes, tag, watch the release workflow, verify installers and auto-update metadata). Use when the user asks to release, publish, ship or tag a version.
---

# Release Raylit

Publishing is public and installed copies update to it: only release when the user asked in this session. Read
`.claude/rules/release.md` first.

## 1. Check the starting point

```bash
git status --short && git log --oneline -1 && git log --oneline "$(git describe --tags --abbrev=0)"..HEAD
```

The tree must be clean and `main` pushed. The last command lists what goes into the release notes. Confirm the version
number if the user did not give one (patch for fixes, minor for features). Then:

```bash
npm run typecheck && npm test
```

## 2. Bump the version everywhere

```bash
V=0.1.1   # the new version
npm version $V --no-git-tag-version >/dev/null
for p in desktop engine ui; do (cd $p && npm version $V --no-git-tag-version >/dev/null); done
sed -i "s/export const ENGINE_VERSION = '[^']*';/export const ENGINE_VERSION = '$V';/" engine/src/http/server.ts
grep -n '"version"' package.json */package.json | head -4; grep -n ENGINE_VERSION engine/src/http/server.ts | head -1
```

## 3. Write `docs/release-notes/v$V.md`

Follow the shape of the previous notes: a one-line summary, the "updates itself" line, Downloads with exact file names,
New / Fixes written for users, and the unsigned-builds note. Update `docs/STATUS.md`.

## 4. Commit, tag, push

```bash
git add -A && git commit -m "Release $V" && git tag -a v$V -m "Raylit $V"
git push origin main && git push origin v$V
```

## 5. Watch the release workflow (in the background, 6 to 12 minutes)

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"; R=amirerajabi/raylit
ID=$("$GH" run list --repo $R --workflow Release --limit 1 --json databaseId --jq '.[0].databaseId')
"$GH" run watch $ID --repo $R --interval 30 --exit-status > /dev/null; echo "exit $?"
```

On failure: `"$GH" run view $ID --repo $R --log-failed`. Job states can lag; judge by the assets.

## 6. Verify what was published

```bash
"$GH" release view v$V --repo $R --json isDraft,assets --jq '"draft=\(.isDraft)", (.assets[] | "\(.name) \(.size)")'
```

Expect these 10 assets:

| Platform | Files |
| --- | --- |
| Windows | `Raylit-Setup-$V.exe`, `Raylit-Setup-$V.exe.blockmap`, `latest.yml` |
| macOS | `Raylit-$V-mac-arm64.dmg`, `.dmg.blockmap`, `Raylit-$V-mac-arm64.zip`, `.zip.blockmap`, `latest-mac.yml` |
| Linux | `Raylit-$V-x86_64.AppImage`, `latest-linux.yml` |

Check that installed copies will accept it (newest tag, installer SHA-512 equals `latest.yml`):

```bash
D=$(mktemp -d); cd $D
curl -s https://api.github.com/repos/amirerajabi/raylit/releases/latest | grep -m1 '"tag_name"'
curl -sL -o latest.yml https://github.com/amirerajabi/raylit/releases/download/v$V/latest.yml && grep -E '^(version|sha512):' latest.yml
curl -sL -o setup.exe https://github.com/amirerajabi/raylit/releases/download/v$V/Raylit-Setup-$V.exe
openssl dgst -sha512 -binary setup.exe | base64 -w0; echo; cd - >/dev/null; rm -rf $D
```

## 7. Report

The release URL, what is in it, and that installed copies pick it up on their next update check.

## If something went wrong

- Wrong content in a release nobody installed yet: hide it with `"$GH" release edit v$V --repo $R --draft=true`, fix,
  then ask the user before deleting the draft and moving the tag.
- Installed copies may already have it: never rebuild the same version; fix forward with the next patch version.
