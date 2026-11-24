/**
 * Read a ZIP archive as untrusted data, fully in memory.
 * - Nothing is extracted to disk and nothing inside is ever executed.
 * - Member names are validated (no absolute paths, drive letters, backslashes, `..`, NUL).
 * - Symlinks, oversized members and zip bombs are rejected.
 * - Only allow-listed members are returned.
 */
import yauzl from 'yauzl';

export type ZipLimits = { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number };
export const DEFAULT_LIMITS: ZipLimits = { maxEntries: 2000, maxEntryBytes: 20 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024 };

export class UnsafeArchiveError extends Error {}

export function isSafeMemberName(name: string): boolean {
  if (!name || name.length > 512) return false;
  if (name.includes('\0') || name.includes('\\')) return false;
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false;
  return !name.split('/').some((seg) => seg === '..');
}

export type ArchiveMembers = { names: string[]; files: Map<string, Buffer> };

export function readZip(
  buffer: Buffer,
  allow: (name: string) => boolean,
  limits: ZipLimits = DEFAULT_LIMITS,
): Promise<ArchiveMembers> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new UnsafeArchiveError('cannot open archive'));
      const names: string[] = [];
      const files = new Map<string, Buffer>();
      let total = 0;
      const fail = (e: Error) => { zip.close(); reject(e); };
      zip.on('error', fail);
      zip.on('end', () => resolve({ names: names.sort(), files }));
      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName;
        if (names.length >= limits.maxEntries) return fail(new UnsafeArchiveError('too many entries'));
        if (!isSafeMemberName(name)) return fail(new UnsafeArchiveError(`unsafe member name: ${JSON.stringify(name)}`));
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (mode === 0o120000) return fail(new UnsafeArchiveError(`symlink member rejected: ${name}`));
        names.push(name);
        if (name.endsWith('/') || !allow(name)) return zip.readEntry();
        if (entry.uncompressedSize > limits.maxEntryBytes) return fail(new UnsafeArchiveError(`member too large: ${name}`));
        total += entry.uncompressedSize;
        if (total > limits.maxTotalBytes) return fail(new UnsafeArchiveError('archive too large'));
        zip.openReadStream(entry, (e2, stream) => {
          if (e2 || !stream) return fail(e2 ?? new UnsafeArchiveError(`cannot read ${name}`));
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('data', (c: Buffer) => {
            size += c.length;
            if (size > limits.maxEntryBytes) { stream.destroy(); fail(new UnsafeArchiveError(`member exceeds limit: ${name}`)); return; }
            chunks.push(c);
          });
          stream.on('error', fail);
          stream.on('end', () => { files.set(name, Buffer.concat(chunks)); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}

/** JSON.parse that drops prototype-polluting keys from untrusted input. */
export function safeJsonParse(text: string): unknown {
  return JSON.parse(text.replace(/^\uFEFF/, ''), (key, value) =>
    key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value,
  );
}
