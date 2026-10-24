// The OS proxy setting ("System proxy" mode). Before pointing it at RayConnect we keep what was there, and we put that back
// on disconnect, so a user who had another proxy (or none) gets exactly that again. The backup is persisted by the
// manager, so after a crash the next start can still restore it.
//
//   Windows  HKCU\...\Internet Settings (ProxyEnable / ProxyServer / ProxyOverride), then WinINet is told to reload.
//   macOS    networksetup, for every network service (web, secure web and SOCKS proxy).
//   Linux    GNOME's gsettings (org.gnome.system.proxy); other desktops are not touched.
//
// RAYCONNECT_NO_SYSPROXY=1 turns every call into a no-op (tests and development runs on a machine whose proxy is in use).
import { execFile } from 'node:child_process';

export interface ProxySnapshot {
  platform: NodeJS.Platform;
  enabled: boolean;
  server: string;
  override: string;
  /** Linux: org.gnome.system.proxy mode. */
  mode?: string;
}

export interface SystemProxy {
  readonly available: boolean;
  /** Why it is not available. */
  readonly reason?: string;
  read(): Promise<ProxySnapshot | null>;
  set(host: string, httpPort: number, socksPort: number, bypass: string[]): Promise<void>;
  restore(snapshot: ProxySnapshot | null): Promise<void>;
  /** Is the OS proxy currently ours (pointing at host:httpPort)? */
  isOurs(host: string, httpPort: number): Promise<boolean>;
}

function run(cmd: string, args: string[], timeout = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).toString().trim().split('\n')[0]));
      else resolve(stdout.toString());
    });
  });
}

const WIN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

async function winRead(name: string): Promise<string | null> {
  try {
    const out = await run('reg', ['query', WIN_KEY, '/v', name]);
    const m = new RegExp(`${name}\\s+REG_\\w+\\s+(.*)$`, 'm').exec(out);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function winWrite(name: string, type: 'REG_DWORD' | 'REG_SZ', value: string): Promise<string> {
  return run('reg', ['add', WIN_KEY, '/v', name, '/t', type, '/d', value, '/f']);
}

/** Tell WinINet (and the apps listening to it) that the settings changed, so nobody waits for a restart. */
function winRefresh(): Promise<void> {
  const script =
    '$t=Add-Type -PassThru -Name W -Namespace R -MemberDefinition \'[DllImport("wininet.dll")] public static extern bool InternetSetOption(System.IntPtr h,int o,System.IntPtr b,int l);\';' +
    '$t::InternetSetOption(0,39,0,0)|Out-Null;$t::InternetSetOption(0,37,0,0)|Out-Null';
  return run('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]).then(
    () => undefined,
    () => undefined,
  );
}

const windows: SystemProxy = {
  available: true,
  async read() {
    const enable = await winRead('ProxyEnable');
    return {
      platform: 'win32',
      enabled: enable === '0x1',
      server: (await winRead('ProxyServer')) ?? '',
      override: (await winRead('ProxyOverride')) ?? '',
    };
  },
  async set(host, httpPort, _socksPort, bypass) {
    await winWrite('ProxyServer', 'REG_SZ', `${host}:${httpPort}`);
    await winWrite('ProxyOverride', 'REG_SZ', [...bypass, '<local>'].filter((v, i, a) => a.indexOf(v) === i).join(';'));
    await winWrite('ProxyEnable', 'REG_DWORD', '1');
    await winRefresh();
  },
  async restore(s) {
    await winWrite('ProxyEnable', 'REG_DWORD', s?.enabled ? '1' : '0');
    if (s) {
      await winWrite('ProxyServer', 'REG_SZ', s.server);
      await winWrite('ProxyOverride', 'REG_SZ', s.override);
    }
    await winRefresh();
  },
  async isOurs(host, httpPort) {
    return (await winRead('ProxyEnable')) === '0x1' && (await winRead('ProxyServer')) === `${host}:${httpPort}`;
  },
};

async function macServices(): Promise<string[]> {
  const out = await run('networksetup', ['-listallnetworkservices']);
  // The first line is a note; a leading '*' marks a disabled service.
  return out.split('\n').slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith('*'));
}

const mac: SystemProxy = {
  available: true,
  async read() {
    const [svc] = await macServices();
    if (!svc) return null;
    const out = await run('networksetup', ['-getwebproxy', svc]);
    const enabled = /^Enabled: Yes/m.test(out);
    const server = `${/^Server: (.*)$/m.exec(out)?.[1] ?? ''}:${/^Port: (\d+)/m.exec(out)?.[1] ?? ''}`;
    return { platform: 'darwin', enabled, server, override: '' };
  },
  async set(host, httpPort, socksPort, bypass) {
    for (const svc of await macServices()) {
      await run('networksetup', ['-setwebproxy', svc, host, String(httpPort)]);
      await run('networksetup', ['-setsecurewebproxy', svc, host, String(httpPort)]);
      await run('networksetup', ['-setsocksfirewallproxy', svc, host, String(socksPort)]);
      await run('networksetup', ['-setproxybypassdomains', svc, ...bypass]);
    }
  },
  async restore(s) {
    for (const svc of await macServices()) {
      const [h, p] = (s?.server ?? '').split(':');
      if (s?.enabled && h && p) {
        await run('networksetup', ['-setwebproxy', svc, h, p]);
        await run('networksetup', ['-setsecurewebproxy', svc, h, p]);
      } else {
        await run('networksetup', ['-setwebproxystate', svc, 'off']);
        await run('networksetup', ['-setsecurewebproxystate', svc, 'off']);
      }
      await run('networksetup', ['-setsocksfirewallproxystate', svc, 'off']);
    }
  },
  async isOurs(host, httpPort) {
    const s = await this.read();
    return !!s?.enabled && s.server === `${host}:${httpPort}`;
  },
};

const gsettings = (...args: string[]) => run('gsettings', args).then((s) => s.trim());

const gnome: SystemProxy = {
  available: true,
  async read() {
    try {
      const mode = (await gsettings('get', 'org.gnome.system.proxy', 'mode')).replace(/'/g, '');
      const h = (await gsettings('get', 'org.gnome.system.proxy.http', 'host')).replace(/'/g, '');
      const p = await gsettings('get', 'org.gnome.system.proxy.http', 'port');
      return { platform: 'linux', enabled: mode === 'manual', server: `${h}:${p}`, override: '', mode };
    } catch {
      return null;
    }
  },
  async set(host, httpPort, socksPort, bypass) {
    await gsettings('set', 'org.gnome.system.proxy.http', 'host', host);
    await gsettings('set', 'org.gnome.system.proxy.http', 'port', String(httpPort));
    await gsettings('set', 'org.gnome.system.proxy.https', 'host', host);
    await gsettings('set', 'org.gnome.system.proxy.https', 'port', String(httpPort));
    await gsettings('set', 'org.gnome.system.proxy.socks', 'host', host);
    await gsettings('set', 'org.gnome.system.proxy.socks', 'port', String(socksPort));
    await gsettings('set', 'org.gnome.system.proxy', 'ignore-hosts', `[${bypass.map((b) => `'${b.replace(/'/g, '')}'`).join(', ')}]`);
    await gsettings('set', 'org.gnome.system.proxy', 'mode', 'manual');
  },
  async restore(s) {
    await gsettings('set', 'org.gnome.system.proxy', 'mode', s?.mode && s.mode !== 'manual' ? s.mode : 'none');
  },
  async isOurs(host, httpPort) {
    const s = await this.read();
    return !!s?.enabled && s.server === `${host}:${httpPort}`;
  },
};

function disabled(reason: string): SystemProxy {
  return {
    available: false,
    reason,
    read: async () => null,
    set: async () => undefined,
    restore: async () => undefined,
    isOurs: async () => false,
  };
}

export function systemProxy(): SystemProxy {
  if (process.env.RAYCONNECT_NO_SYSPROXY === '1') return disabled('The system proxy is turned off for this run (RAYCONNECT_NO_SYSPROXY).');
  if (process.platform === 'win32') return windows;
  if (process.platform === 'darwin') return mac;
  if (process.platform === 'linux') return gnome;
  return disabled('Setting the system proxy is not supported on this system.');
}
