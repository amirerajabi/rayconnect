// Release builds: put the latest Xray-core for this machine (checked against its SHA-256) into desktop/core, which
// electron-builder ships as resources/core. Each release job runs on the platform it packages, so "this machine" is
// the target. Usage: npx tsx scripts/fetch-core.ts [dir]
import * as path from 'node:path';
import { coreVersion, installCore, releaseAsset } from '../src/core/xray';

const dir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', '..', 'desktop', 'core'));
let last = -1;
const exe = await installCore(dir, (p) => {
  if (p >= last + 25) {
    last = p;
    console.log(`  ${releaseAsset()}: ${p}%`);
  }
});
console.log(`Xray ${(await coreVersion(exe)) ?? '(version unknown)'} in ${dir}`);
