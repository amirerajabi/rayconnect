// Version 0.3.0 renamed Raylit to RayConnect. Electron keeps each app's data in a folder named after the product
// (%APPDATA%\Raylit on Windows), so an updated copy would start with no servers, no settings and no record of a system
// proxy it may have to restore. Move the old folder to the new name once, before anything opens it.
import * as fs from 'node:fs';
import * as path from 'node:path';

const OLD_NAME = 'Raylit';

export function migrateUserData(appDataDir: string, userDataDir: string): 'moved' | 'copied' | 'skipped' | 'failed' {
  const old = path.join(appDataDir, OLD_NAME);
  if (path.resolve(old) === path.resolve(userDataDir) || !fs.existsSync(old) || fs.existsSync(userDataDir)) return 'skipped';
  try {
    fs.renameSync(old, userDataDir);
    console.log(`moved ${old} to ${userDataDir}`);
    return 'moved';
  } catch {
    // A file held open (an antivirus scan, a stray old process): copy instead and leave the old folder behind.
    try {
      fs.cpSync(old, userDataDir, { recursive: true });
      console.log(`copied ${old} to ${userDataDir}`);
      return 'copied';
    } catch (e) {
      console.error(`could not move ${old}: ${e instanceof Error ? e.message : String(e)}`);
      return 'failed';
    }
  }
}
