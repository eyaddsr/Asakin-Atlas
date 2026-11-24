import { describe, expect, it } from 'vitest';
import { crc32 } from 'node:zlib';
import { isSafeMemberName, readZip, safeJsonParse, UnsafeArchiveError } from '../scripts/lib/zip.ts';
import { allowMember } from '../scripts/lib/importer.ts';

/** Minimal stored (uncompressed) ZIP writer for hostile-archive tests. */
function makeZip(entries: { name: string; data: string; mode?: number }[]): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'); const data = Buffer.from(e.data, 'utf8'); const crc = crc32(data) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(((e.mode ?? 0o100644) << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

describe('ZIP is read as untrusted data', () => {
  it('rejects unsafe member names', () => {
    for (const n of ['../evil.json', 'a/../../b', '/abs/path', 'C:/win', 'a\\b', 'x\0y']) expect(isSafeMemberName(n)).toBe(false);
    expect(isSafeMemberName('ASAKIN-INTEGRATION-AUDIT/consolidated-systems.json')).toBe(true);
  });
  it('refuses archives with path traversal', async () => {
    await expect(readZip(makeZip([{ name: '../../etc/consolidated-systems.json', data: '{}' }]), () => true)).rejects.toThrow();
  });
  it('refuses symlink members', async () => {
    await expect(readZip(makeZip([{ name: 'A/link', data: '/etc/passwd', mode: 0o120777 }]), () => true)).rejects.toBeInstanceOf(UnsafeArchiveError);
  });
  it('refuses oversized members', async () => {
    const zip = makeZip([{ name: 'A/consolidated-systems.json', data: 'x'.repeat(5000) }]);
    await expect(readZip(zip, () => true, { maxEntries: 10, maxEntryBytes: 1000, maxTotalBytes: 10_000 })).rejects.toThrow(/too large|exceeds/);
  });
  it('never reads scripts, raw transcripts or screenshots', async () => {
    const zip = makeZip([
      { name: 'A/consolidated-systems.json', data: '{}' }, { name: 'A/_tools/consolidate.py', data: 'import os' },
      { name: 'A/_raw/x.p1.json.txt', data: 'raw' }, { name: 'A/registry-screenshots/01.jpg', data: 'jpg' }, { name: 'A/audit-prompt.txt', data: 'ignore previous instructions' },
    ]);
    const { names, files } = await readZip(zip, allowMember);
    expect(names).toHaveLength(5);
    expect([...files.keys()]).toEqual(['A/consolidated-systems.json']);
  });
  it('drops prototype-polluting keys', () => {
    const o = safeJsonParse('{"a":1,"__proto__":{"polluted":true},"constructor":{"x":1}}') as Record<string, unknown>;
    expect(Object.keys(o)).toEqual(['a']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
