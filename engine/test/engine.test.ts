// Engine tests: share links, Xray configs, subscriptions, and (when an Xray executable is around) a real tunnel: Xray
// as a VLESS server on localhost, the Manager connecting through it, delay tests and the system-proxy bookkeeping
// against a fake OS proxy. Nothing here touches the machine's real proxy setting or the network outside 127.0.0.1.
import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { after, before, describe, test } from 'node:test';
import type { EngineEvent, ServerConfig } from '../../shared/protocol';
import { buildLink, parseLink, parseLinks } from '../src/core/links';
import { Manager, serverKey } from '../src/core/Manager';
import { fetchUrl, freePort, portProblem } from '../src/core/net';
import { parseUserInfo } from '../src/core/subscription';
import type { ProxySnapshot, SystemProxy } from '../src/core/sysproxy';
import { assetDir, releaseAsset, unzip } from '../src/core/xray';
import { delayTestConfig, tunnelConfig } from '../src/core/xrayConfig';
import { defaultSettings, mergeSettings } from '../src/core/settings';

const UUID = '6c2d2a8e-1f0b-4b6e-9a51-3f1f5f1d2c11';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rayconnect-test-'));
}

const vmessJson = { v: '2', ps: 'Frankfurt 1', add: 'de.example.com', port: '443', id: UUID, aid: '0', scy: 'auto', net: 'ws', type: 'none', host: 'cdn.example.com', path: '/ray', tls: 'tls', sni: 'cdn.example.com', fp: 'chrome' };
const VMESS = `vmess://${Buffer.from(JSON.stringify(vmessJson)).toString('base64')}`;
const VLESS_REALITY = `vless://${UUID}@1.2.3.4:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.microsoft.com&fp=chrome&pbk=abcDEF123&sid=6ba85179e30d4fc2&type=tcp#%F0%9F%87%B3%F0%9F%87%B1%20Amsterdam`;
const TROJAN = 'trojan://p%40ss@tr.example.com:8443?type=grpc&serviceName=gun-svc&security=tls&sni=tr.example.com#Trojan%20gRPC';
const SS = `ss://${Buffer.from('chacha20-ietf-poly1305:secret').toString('base64')}@5.6.7.8:8388#SS%20one`;
const SS_LEGACY = `ss://${Buffer.from('aes-256-gcm:pw@9.9.9.9:1234').toString('base64')}#Legacy`;

describe('share links', () => {
  test('vmess (v2rayN JSON)', () => {
    const p = parseLink(VMESS)!;
    assert.equal(p.name, 'Frankfurt 1');
    assert.equal(p.config.protocol, 'vmess');
    assert.equal(p.config.address, 'de.example.com');
    assert.equal(p.config.port, 443);
    assert.equal(p.config.uuid, UUID);
    assert.equal(p.config.network, 'ws');
    assert.equal(p.config.path, '/ray');
    assert.equal(p.config.host, 'cdn.example.com');
    assert.equal(p.config.tls, 'tls');
    assert.equal(p.config.fingerprint, 'chrome');
  });

  test('vless with REALITY and Vision', () => {
    const p = parseLink(VLESS_REALITY)!;
    assert.equal(p.name, '🇳🇱 Amsterdam');
    assert.equal(p.config.protocol, 'vless');
    assert.equal(p.config.flow, 'xtls-rprx-vision');
    assert.equal(p.config.tls, 'reality');
    assert.equal(p.config.publicKey, 'abcDEF123');
    assert.equal(p.config.shortId, '6ba85179e30d4fc2');
    assert.equal(p.config.sni, 'www.microsoft.com');
  });

  test('trojan over gRPC, password with an @', () => {
    const p = parseLink(TROJAN)!;
    assert.equal(p.config.password, 'p@ss');
    assert.equal(p.config.network, 'grpc');
    assert.equal(p.config.serviceName, 'gun-svc');
    assert.equal(p.config.port, 8443);
  });

  test('shadowsocks, SIP002 and legacy', () => {
    const a = parseLink(SS)!;
    assert.deepEqual([a.config.method, a.config.password, a.config.address, a.config.port], ['chacha20-ietf-poly1305', 'secret', '5.6.7.8', 8388]);
    const b = parseLink(SS_LEGACY)!;
    assert.deepEqual([b.config.method, b.config.password, b.config.address, b.config.port, b.name], ['aes-256-gcm', 'pw', '9.9.9.9', 1234, 'Legacy']);
  });

  test('garbage is rejected, not thrown', () => {
    for (const bad of ['', 'hello', 'vmess://notbase64!', 'vless://@:0', 'ss://xx', 'http://example.com']) assert.equal(parseLink(bad), null, bad);
  });

  test('build -> parse keeps every detail', () => {
    for (const link of [VMESS, VLESS_REALITY, TROJAN, SS]) {
      const p = parseLink(link)!;
      const again = parseLink(buildLink(p.name, p.config))!;
      assert.equal(again.name, p.name);
      assert.deepEqual(again.config, p.config, link);
    }
  });

  test('a base64 subscription body with junk lines', () => {
    const body = Buffer.from([VMESS, 'not a link', VLESS_REALITY, '', TROJAN].join('\n')).toString('base64');
    const r = parseLinks(body);
    assert.equal(r.links.length, 3);
    assert.equal(r.skipped, 1);
  });

  test('subscription-userinfo header', () => {
    assert.deepEqual(parseUserInfo('upload=10; download=20; total=100; expire=1700000000'), { upload: 10, download: 20, total: 100, expire: 1700000000000 });
    assert.equal(parseUserInfo(undefined), undefined);
  });
});

describe('xray config', () => {
  test('tunnel: inbounds, REALITY outbound, routing per mode', () => {
    const c = parseLink(VLESS_REALITY)!.config;
    const s = { ...defaultSettings(), routing: 'iran-direct' as const, blockAds: true };
    const cfg = tunnelConfig(c, s, 12345) as any;
    assert.deepEqual(cfg.inbounds.map((i: any) => [i.protocol, i.port, i.listen]), [
      ['socks', s.socksPort, '127.0.0.1'],
      ['http', s.httpPort, '127.0.0.1'],
      ['dokodemo-door', 12345, '127.0.0.1'],
    ]);
    const out = cfg.outbounds[0];
    assert.equal(out.tag, 'proxy');
    assert.equal(out.settings.vnext[0].users[0].flow, 'xtls-rprx-vision');
    assert.equal(out.streamSettings.security, 'reality');
    assert.equal(out.streamSettings.realitySettings.publicKey, 'abcDEF123');
    const rules = JSON.stringify(cfg.routing.rules);
    assert.match(rules, /geoip:ir/);
    assert.match(rules, /category-ads-all/);
    assert.match(rules, /geoip:private/);
    const global = JSON.stringify((tunnelConfig(c, defaultSettings(), 1) as any).routing.rules);
    assert.doesNotMatch(global, /geoip:ir|ads-all/);
  });

  test('allowLan listens everywhere; mux skipped for Vision', () => {
    const c = parseLink(VLESS_REALITY)!.config;
    const cfg = tunnelConfig(c, { ...defaultSettings(), allowLan: true, mux: true }, 1) as any;
    assert.equal(cfg.inbounds[0].listen, '0.0.0.0');
    assert.equal(cfg.outbounds[0].mux, undefined);
    const vm = tunnelConfig(parseLink(VMESS)!.config, { ...defaultSettings(), mux: true }, 1) as any;
    assert.equal(vm.outbounds[0].mux.enabled, true);
    assert.equal(vm.outbounds[0].streamSettings.wsSettings.host, 'cdn.example.com');
  });

  test('delay test: one inbound per server, each routed to its outbound', () => {
    const configs = [VMESS, TROJAN, SS].map((l) => parseLink(l)!.config);
    const cfg = delayTestConfig(configs, [1001, 1002, 1003]) as any;
    assert.deepEqual(cfg.inbounds.map((i: any) => i.port), [1001, 1002, 1003]);
    assert.deepEqual(cfg.routing.rules.map((r: any) => [r.inboundTag[0], r.outboundTag]), [['in0', 'out0'], ['in1', 'out1'], ['in2', 'out2']]);
    assert.equal(cfg.outbounds[2].protocol, 'shadowsocks');
  });
});

describe('settings and core helpers', () => {
  test('mergeSettings coerces and validates', () => {
    const s = mergeSettings(defaultSettings(), { socksPort: 99999, routing: 'nope' as never, dns: [' 9.9.9.9 ', '', '9.9.9.9'] });
    assert.equal(s.socksPort, 65535);
    assert.equal(s.routing, 'global');
    assert.deepEqual(s.dns, ['9.9.9.9']);
    assert.throws(() => mergeSettings(defaultSettings(), { socksPort: 2000, httpPort: 2000 }));
    // English unless the user picks Persian.
    assert.equal(defaultSettings().language, 'en');
    assert.equal(mergeSettings(defaultSettings(), { language: 'fa' }).language, 'fa');
    assert.equal(mergeSettings(defaultSettings(), { language: 'de' as never }).language, 'en');
  });

  test('a port Windows has reserved is told apart from one in use', { skip: process.platform !== 'win32' }, async (t) => {
    const out = await new Promise<string>((resolve) => execFile('netsh', ['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'], (_e, so) => resolve(String(so))));
    const port = [...out.matchAll(/^\s*(\d+)\s+\d+\s*$/gm)].map((m) => Number(m[1])).find((p) => p >= 1024);
    if (!port || port < 1024) return t.skip('no reserved port range on this machine');
    assert.equal(await portProblem(port), 'reserved');
    const blocker = http.createServer();
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
    assert.equal(await portProblem((blocker.address() as { port: number }).port), 'in-use');
    blocker.close();
  });

  test('release asset names', () => {
    assert.equal(releaseAsset('win32', 'x64'), 'Xray-windows-64.zip');
    assert.equal(releaseAsset('darwin', 'arm64'), 'Xray-macos-arm64-v8a.zip');
    assert.equal(releaseAsset('linux', 'x64'), 'Xray-linux-64.zip');
  });

  test('unzip reads stored and deflated entries', () => {
    const zip = makeZip([
      { name: 'xray.exe', data: Buffer.from('binary!'), deflate: false },
      { name: 'geoip.dat', data: Buffer.from('g'.repeat(5000)), deflate: true },
      { name: 'docs/readme.md', data: Buffer.from('skip me'), deflate: false },
    ]);
    const files = unzip(zip);
    assert.deepEqual(files.map((f) => f.name), ['xray.exe', 'geoip.dat']);
    assert.equal(files[0].data.toString(), 'binary!');
    assert.equal(files[1].data.length, 5000);
  });

  test('geo files are found next to the core or one folder up', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'xray'));
    fs.writeFileSync(path.join(dir, 'geoip.dat'), '');
    assert.equal(assetDir(path.join(dir, 'xray', 'xray.exe')), dir);
  });
});

/** A minimal zip writer for the unzip test. */
function makeZip(entries: { name: string; data: Buffer; deflate: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const body = e.deflate ? deflateRawSync(e.data) : e.data;
    const name = Buffer.from(e.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(e.deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Records what the Manager does to the OS proxy instead of doing it. */
class FakeProxy implements SystemProxy {
  readonly available = true;
  current: ProxySnapshot = { platform: 'win32', enabled: true, server: 'user-proxy:3128', override: '<local>' };
  calls: string[] = [];
  async read() {
    return { ...this.current };
  }
  async set(host: string, httpPort: number) {
    this.calls.push(`set ${host}:${httpPort}`);
    this.current = { platform: 'win32', enabled: true, server: `${host}:${httpPort}`, override: '' };
  }
  async restore(s: ProxySnapshot | null) {
    this.calls.push(`restore ${s?.server ?? 'none'}`);
    this.current = s ? { ...s } : { platform: 'win32', enabled: false, server: '', override: '' };
  }
  async isOurs(host: string, port: number) {
    return this.current.enabled && this.current.server === `${host}:${port}`;
  }
}

function events(m: Manager): EngineEvent[] {
  const list: EngineEvent[] = [];
  m.on('event', (e: EngineEvent) => list.push(e));
  return list;
}

describe('subscriptions', () => {
  let server: http.Server;
  let url = '';
  let body = '';
  before(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'subscription-userinfo': 'upload=1; download=2; total=1000; expire=0', 'profile-title': 'base64:' + Buffer.from('My VPN').toString('base64') });
      res.end(body);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}/sub`;
  });
  after(() => server.close());

  test('add, then update keeping the ids of servers that stayed', async () => {
    const m = new Manager(tmpDir(), new FakeProxy());
    await m.load();
    body = Buffer.from([VMESS, TROJAN].join('\n')).toString('base64');
    const sub = await m.addSubscription('', url);
    assert.equal(sub.name, 'My VPN');
    assert.equal(sub.usage?.total, 1000);
    const first = m.state().servers;
    assert.equal(first.length, 2);
    const trojanId = first.find((s) => s.protocol === 'trojan')!.id;
    m.select(trojanId);

    body = [TROJAN, SS].join('\n');
    const r = await m.updateSubscription(sub.id);
    assert.equal(r.count, 2);
    const second = m.state().servers;
    assert.deepEqual(second.map((s) => s.protocol).sort(), ['shadowsocks', 'trojan']);
    assert.equal(second.find((s) => s.protocol === 'trojan')!.id, trojanId);
    assert.equal(m.state().selectedId, trojanId);

    await m.deleteSubscription(sub.id);
    assert.equal(m.state().servers.length, 0);
    await m.shutdown();
  });

  test('manual import skips duplicates and junk, survives a restart', async () => {
    const dir = tmpDir();
    const m = new Manager(dir, new FakeProxy());
    await m.load();
    assert.deepEqual(m.importText(`${VMESS}\n${VMESS}\nnope\n${SS}`), { added: 2, duplicates: 1, skipped: 1 });
    assert.deepEqual(m.importText(SS), { added: 0, duplicates: 1, skipped: 0 });
    const id = m.state().servers[0].id;
    m.updateServer(id, { name: 'Renamed' });
    await m.shutdown();
    const again = new Manager(dir, new FakeProxy());
    await again.load();
    assert.equal(again.state().servers.length, 2);
    assert.equal(again.getServer(id)?.name, 'Renamed');
    assert.equal(serverKey(again.getServer(id)!), serverKey(parseLink(VMESS)!.config as ServerConfig));
    await again.shutdown();
  });
});

/** Xray to test with: RAYCONNECT_TEST_XRAY, or the copy v2rayN installs. */
function testCore(): string | null {
  const candidates = [process.env.RAYCONNECT_TEST_XRAY ?? '', 'C:\\Program Files\\v2rayN-windows-64\\bin\\xray\\xray.exe', '/usr/local/bin/xray', '/usr/bin/xray'];
  return candidates.find((c) => c && fs.existsSync(c)) ?? null;
}

const core = testCore();

describe('a real tunnel through Xray', { skip: core ? false : 'no Xray executable (set RAYCONNECT_TEST_XRAY)' }, () => {
  let xrayServer: ChildProcess;
  let target: http.Server;
  let serverPort = 0;
  let targetUrl = '';
  const dir = tmpDir();

  before(async () => {
    // The page the tests fetch through the tunnel.
    target = http.createServer((_req, res) => res.writeHead(204).end());
    await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
    targetUrl = `http://127.0.0.1:${(target.address() as { port: number }).port}/generate_204`;
    // Xray as a VLESS server on localhost.
    serverPort = await freePort();
    const cfg = {
      log: { loglevel: 'warning' },
      inbounds: [{ listen: '127.0.0.1', port: serverPort, protocol: 'vless', settings: { clients: [{ id: UUID }], decryption: 'none' } }],
      // Newer Xray servers refuse private destinations unless allowed; the test target is on loopback.
      outbounds: [{ protocol: 'freedom', settings: { finalRules: [{ action: 'allow', ip: ['127.0.0.0/8'] }] } }],
    };
    const file = path.join(dir, 'server.json');
    fs.writeFileSync(file, JSON.stringify(cfg));
    xrayServer = spawn(core!, ['run', '-c', file], { windowsHide: true });
    const until = Date.now() + 10_000;
    while (Date.now() < until) {
      try {
        await fetchUrl(`http://127.0.0.1:${serverPort}/`, { timeoutMs: 300, headOnly: true });
        break;
      } catch (e) {
        // Anything but "refused" means it is listening.
        if (!/refused/i.test(String(e))) break;
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  });
  after(() => {
    xrayServer?.kill();
    target?.close();
  });

  test('connect, measure, switch proxy, disconnect and restore the user proxy', async (t) => {
    const proxy = new FakeProxy();
    const m = new Manager(path.join(dir, 'data'), proxy);
    await m.load();
    t.after(() => m.shutdown());
    const [socksPort, httpPort] = [await freePort(), await freePort()];
    await m.updateSettings({ corePath: core!, socksPort, httpPort, testUrl: targetUrl, proxyMode: 'system' });
    assert.ok(m.state().core.version, 'core version detected');
    const seen = events(m);

    m.importText(`vless://${UUID}@127.0.0.1:${serverPort}?type=tcp&security=none&encryption=none#Local`);
    m.importText(`vless://${UUID}@127.0.0.1:1?type=tcp&security=none&encryption=none#Dead`);
    const [good, dead] = m.state().servers;

    const conn = await m.connect(good.id);
    assert.equal(conn.status, 'connected');
    assert.equal(conn.systemProxy, true);
    assert.deepEqual(proxy.calls, [`set 127.0.0.1:${httpPort}`]);

    // A request through the HTTP inbound works.
    const r = await fetchUrl(targetUrl, { proxyPort: httpPort, timeoutMs: 5000 });
    assert.equal(r.status, 204);

    // The delay right after connecting comes in as an event.
    const until = Date.now() + 10_000;
    while (m.state().connection.delay === null && Date.now() < until) await new Promise((res) => setTimeout(res, 100));
    assert.ok((m.state().connection.delay ?? -1) >= 0, 'tunnel delay measured');

    // Real delay tests: the working server answers, the dead one fails.
    await m.testDelays([good.id, dead.id]);
    assert.ok((m.getServer(good.id)!.delay ?? -1) >= 0);
    assert.equal(m.getServer(dead.id)!.delay, -1);
    assert.equal(m.getServer(good.id)!.delayKind, 'real');

    // Switching to Manual mode while connected gives the proxy back but keeps the tunnel.
    await m.updateSettings({ proxyMode: 'manual' });
    assert.equal(m.state().connection.status, 'connected');
    assert.equal(proxy.current.server, 'user-proxy:3128');

    await m.updateSettings({ proxyMode: 'system' });
    const off = await m.disconnect();
    assert.equal(off.status, 'disconnected');
    assert.equal(proxy.current.server, 'user-proxy:3128');
    assert.equal(proxy.current.enabled, true);
    assert.ok(seen.some((e) => e.type === 'connection' && e.connection.status === 'connecting'));
    await m.shutdown();
  });

  test('a port in use fails with a clear message and leaves the proxy alone', async () => {
    const proxy = new FakeProxy();
    const m = new Manager(path.join(dir, 'data2'), proxy);
    await m.load();
    const blocker = http.createServer();
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
    const busy = (blocker.address() as { port: number }).port;
    await m.updateSettings({ corePath: core!, socksPort: await freePort(), httpPort: busy });
    m.importText(`vless://${UUID}@127.0.0.1:${serverPort}?type=tcp&security=none#Local`);
    await assert.rejects(m.connect(), /Port \d+ is used by another program/);
    assert.equal(m.state().connection.status, 'disconnected');
    assert.deepEqual(proxy.calls, []);
    blocker.close();
    await m.shutdown();
  });

  test('connect to the fastest server skips the dead one; parallel tests share one run', async (t) => {
    const m = new Manager(path.join(dir, 'data-fast'), new FakeProxy());
    await m.load();
    t.after(() => m.shutdown());
    await m.updateSettings({ corePath: core!, socksPort: await freePort(), httpPort: await freePort(), testUrl: targetUrl, proxyMode: 'manual' });
    m.importText(`vless://${UUID}@127.0.0.1:1?type=tcp&security=none#Dead`);
    m.importText(`vless://${UUID}@127.0.0.1:${serverPort}?type=tcp&security=none#Alive`);
    const seen = events(m);
    await Promise.all([m.testDelays([]), m.testDelays([])]);
    assert.equal(seen.filter((e) => e.type === 'testing' && e.testing).length, 1);
    const conn = await m.connectFastest();
    assert.equal(conn.status, 'connected');
    assert.equal(m.getServer(conn.serverId!)?.name, 'Alive');
    await m.disconnect();
    await m.deleteServers([conn.serverId!]);
    await assert.rejects(m.connectFastest(), /No server answered/);
  });

  test('a relative data folder still works (Xray runs in its own folder)', async (t) => {
    const rel = path.relative(process.cwd(), path.join(dir, 'data-rel'));
    const m = new Manager(rel, new FakeProxy());
    await m.load();
    t.after(() => m.shutdown());
    await m.updateSettings({ corePath: core!, socksPort: await freePort(), httpPort: await freePort(), proxyMode: 'manual' });
    m.importText(`vless://${UUID}@127.0.0.1:${serverPort}?type=tcp&security=none#Local`);
    const seen = events(m);
    assert.equal((await m.connect()).status, 'connected');
    await m.disconnect();
    // A failed start says so once, not also as an unexpected "Disconnected".
    await m.updateSettings({ corePath: process.execPath });
    await assert.rejects(m.connect());
    assert.equal(seen.filter((e) => e.type === 'notify').length, 0);
  });

  test('a crash that left the proxy on is cleaned up at the next start', async () => {
    const proxy = new FakeProxy();
    const data = path.join(dir, 'data3');
    fs.mkdirSync(data, { recursive: true });
    proxy.current = { platform: 'win32', enabled: true, server: '127.0.0.1:10819', override: '' };
    fs.writeFileSync(path.join(data, 'runtime.json'), JSON.stringify({ proxyOwned: true, proxyPort: 10819, proxyBackup: { platform: 'win32', enabled: false, server: 'old:1', override: '' } }));
    const m = new Manager(data, proxy);
    await m.load();
    assert.deepEqual(proxy.calls, ['restore old:1']);
    assert.equal(proxy.current.enabled, false);
    await m.shutdown();
  });
});
