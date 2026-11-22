import * as dns from 'dns';
import * as net from 'net';

export const TRUSTED_MODEL_HOSTS: ReadonlySet<string> = new Set([
  'huggingface.co',
  'hf-mirror.com',
  'cdn-lfs.huggingface.co',
  'cdn-lfs.hf.co',
  'cdn-lfs-us-1.hf.co',
  'cdn-lfs-eu-1.hf.co',
  'us.aws.cdn.hf.co',
  'eu.aws.cdn.hf.co',
  'cas-bridge.xethub.hf.co',
  'cas-bridge-direct.xethub.hf.co',
  'transfer.xethub.hf.co',
  'models.silero.ai',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
]);

export const MAX_MODEL_REDIRECTS = 5;
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

export class DownloadSecurityError extends Error {
  public readonly isSecurityError = true;
  public readonly code: string;
  constructor(message: string, code = 'ERR_SUPPLY_CHAIN_POLICY') {
    super(message);
    this.name = 'DownloadSecurityError';
    this.code = code;
  }
}

export function isSecurityError(err: unknown): boolean {
  return Boolean(err && (err instanceof DownloadSecurityError || (err as any).isSecurityError === true));
}

let loopbackTestHarnessEnabled = false;

export function setLoopbackDownloadTestHarness(enabled: boolean): void {
  if (!process.env.VITEST) {
    throw new DownloadSecurityError('Loopback test harness is forbidden outside Vitest', 'ERR_TEST_HARNESS_FORBIDDEN');
  }
  loopbackTestHarnessEnabled = enabled;
}

export function isLoopbackDownloadTestHarnessEnabled(): boolean {
  return Boolean(process.env.VITEST && loopbackTestHarnessEnabled);
}

function normalizeIp(rawIp: string): string {
  const trimmed = rawIp.trim().toLowerCase();
  const zoneIdx = trimmed.indexOf('%');
  return zoneIdx >= 0 ? trimmed.slice(0, zoneIdx) : trimmed;
}

function ipv4ToUint32(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const oct = Number(part);
    if (oct < 0 || oct > 255) return null;
    num = ((num << 8) | oct) >>> 0;
  }
  return num;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToUint32(ip);
  if (n === null) return true;
  const b0 = (n >>> 24) & 0xff;
  const b1 = (n >>> 16) & 0xff;
  const b2 = (n >>> 8) & 0xff;

  if (b0 === 0) return true; // 0.0.0.0/8 unspecified
  if (b0 === 10) return true; // 10.0.0.0/8 private
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true; // 100.64.0.0/10 CGNAT
  if (b0 === 127) return true; // 127.0.0.0/8 loopback
  if (b0 === 169 && b1 === 254) return true; // 169.254.0.0/16 link-local
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16.0.0/12 private
  if (b0 === 192 && b1 === 0 && b2 === 0) return true; // 192.0.0.0/24 IETF
  if (b0 === 192 && b1 === 0 && b2 === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (b0 === 192 && b1 === 88 && b2 === 99) return true; // 192.88.99.0/24 6to4 relay
  if (b0 === 192 && b1 === 168) return true; // 192.168.0.0/16 private
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true; // 198.18.0.0/15 benchmark
  if (b0 === 198 && b1 === 51 && b2 === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (b0 === 203 && b1 === 0 && b2 === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (b0 >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved/broadcast
  return false;
}

function expandIpv6(ip: string): number[] | null {
  const v4MappedMatch = ip.match(/^(.*):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  let norm = ip;
  if (v4MappedMatch) {
    const v4Num = ipv4ToUint32(v4MappedMatch[2]);
    if (v4Num === null) return null;
    const hi = ((v4Num >>> 16) & 0xffff).toString(16);
    const lo = (v4Num & 0xffff).toString(16);
    norm = `${v4MappedMatch[1]}:${hi}:${lo}`;
  }

  const halves = norm.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = halves.length === 2 ? 8 - (left.length + right.length) : 0;
  if (missing < 0) return null;

  const groups = [...left, ...Array<string>(missing).fill('0'), ...right];
  if (groups.length !== 8) return null;
  const nums: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    nums.push(parseInt(g, 16));
  }
  return nums;
}

export function isBlockedIpAddress(rawIp: string): boolean {
  if (!rawIp || typeof rawIp !== 'string') return true;
  const ip = normalizeIp(rawIp);
  const ipVersion = net.isIP(ip);
  if (ipVersion === 4) {
    return isBlockedIpv4(ip);
  }
  if (ipVersion !== 6) {
    return true;
  }

  const groups = expandIpv6(ip);
  if (!groups) return true;

  const isAllZero = groups.slice(0, 7).every((g) => g === 0);
  if (isAllZero && (groups[7] === 0 || groups[7] === 1)) return true; // :: and ::1
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && (groups[5] === 0xffff || groups[5] === 0)) {
    const v4 = `${(groups[6] >>> 8) & 0xff}.${groups[6] & 0xff}.${(groups[7] >>> 8) & 0xff}.${groups[7] & 0xff}`;
    return isBlockedIpv4(v4);
  }
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((groups[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

export function validateTrustedDownloadUrl(rawUrl: string, allowLoopbackTest = isLoopbackDownloadTestHarnessEnabled()): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new DownloadSecurityError(`Invalid download URL: ${rawUrl}`, 'ERR_INVALID_URL');
  }

  if (parsed.username || parsed.password) {
    throw new DownloadSecurityError('Embedded URL credentials are forbidden', 'ERR_URL_CREDENTIALS');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (allowLoopbackTest && (host === '127.0.0.1' || host === 'localhost') && (parsed.protocol === 'https:' || parsed.protocol === 'http:')) {
    return parsed;
  }

  if (parsed.protocol !== 'https:') {
    throw new DownloadSecurityError(`Insecure protocol forbidden (HTTPS required): ${parsed.protocol}`, 'ERR_HTTPS_REQUIRED');
  }

  if (net.isIP(host) !== 0) {
    throw new DownloadSecurityError(`Direct IP literal hostnames are forbidden: ${host}`, 'ERR_IP_LITERAL_FORBIDDEN');
  }

  if (!TRUSTED_MODEL_HOSTS.has(host)) {
    throw new DownloadSecurityError(`Host is not in the model download allowlist: ${host}`, 'ERR_HOST_NOT_ALLOWLISTED');
  }

  return parsed;
}

export type DnsLookupFn = typeof dns.lookup;

export function createSsrfSafeLookup(baseLookup: DnsLookupFn = dns.lookup): DnsLookupFn {
  const safeLookup = (hostname: string, options: any, callback?: any) => {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? {} : (options || {});

    const cleanHost = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (net.isIP(cleanHost) !== 0) {
      if (isBlockedIpAddress(cleanHost)) {
        return cb(new DownloadSecurityError(`SSRF blocked IP address: ${cleanHost}`, 'ERR_SSRF_BLOCKED_IP'));
      }
      return opts.all
        ? cb(null, [{ address: cleanHost, family: net.isIP(cleanHost) }])
        : cb(null, cleanHost, net.isIP(cleanHost));
    }

    (baseLookup as any)(hostname, opts, (err: any, addressOrList: any, family: number) => {
      if (err) return cb(err);
      if (Array.isArray(addressOrList)) {
        for (const entry of addressOrList) {
          if (!entry?.address || isBlockedIpAddress(entry.address)) {
            return cb(
              new DownloadSecurityError(
                `DNS rebinding / SSRF protection blocked resolved IP (${entry?.address || 'unknown'}) for ${hostname}`,
                'ERR_SSRF_BLOCKED_IP'
              )
            );
          }
        }
        return cb(null, addressOrList);
      }
      if (!addressOrList || isBlockedIpAddress(String(addressOrList))) {
        return cb(
          new DownloadSecurityError(
            `DNS rebinding / SSRF protection blocked resolved IP (${addressOrList || 'unknown'}) for ${hostname}`,
            'ERR_SSRF_BLOCKED_IP'
          )
        );
      }
      return cb(null, addressOrList, family);
    });
  };
  return safeLookup as unknown as DnsLookupFn;
}
