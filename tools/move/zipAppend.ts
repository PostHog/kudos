// Adds entries to a ZIP without unpacking it: every entry it had keeps its bytes, the new ones are deflated after them,
// and the central directory is written again with both. Enough for a Convex snapshot export, which is a plain ZIP: no
// ZIP64, no archive comment of its own, under 4 GiB.
import { crc32, deflateRawSync } from "node:zlib";

const endOfCentralDirectory = 0x06054b50;
const centralHeader = 0x02014b50;
const localHeader = 0x04034b50;

/** The names of a ZIP's entries, from its central directory. */
export function zipEntryNames(archive: Buffer): string[] {
  const { offset, entries } = directory(archive);
  const names: string[] = [];
  let at = offset;
  for (let entry = 0; entry < entries; entry++) {
    if (archive.readUInt32LE(at) !== centralHeader) throw new Error(`no central directory header at ${at}`);
    const nameLength = archive.readUInt16LE(at + 28);
    names.push(archive.toString("utf8", at + 46, at + 46 + nameLength));
    at += 46 + nameLength + archive.readUInt16LE(at + 30) + archive.readUInt16LE(at + 32);
  }
  return names;
}

/** `archive` with `added` after its entries. A name it already has stops it, since a reader would take either. */
export function appendToZip(archive: Buffer, added: Record<string, string | Buffer>): Buffer {
  const { offset, size, entries } = directory(archive);
  const existing = new Set(zipEntryNames(archive));
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [archive.subarray(offset, offset + size)];
  let at = offset;
  for (const [name, content] of Object.entries(added)) {
    if (existing.has(name)) throw new Error(`the ZIP already has ${name}`);
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const packed = deflateRawSync(data);
    const fileName = Buffer.from(name);
    const sum = crc32(data);
    if (at + 30 + fileName.length + packed.length > 0xffffffff) throw new Error("the ZIP would pass 4 GiB, which needs ZIP64");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(localHeader, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    locals.push(local, fileName, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(centralHeader, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(at, 42);
    centrals.push(central, fileName);
    at += 30 + fileName.length + packed.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(endOfCentralDirectory, 0);
  const count = entries + Object.keys(added).length;
  if (count > 0xffff) throw new Error("the ZIP would pass 65,535 entries, which needs ZIP64");
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(at, 16);
  return Buffer.concat([archive.subarray(0, offset), ...locals, centralBytes, end]);
}

/** Where the central directory starts, its size and its entry count, from the end record. */
function directory(archive: Buffer): { offset: number; size: number; entries: number } {
  // The end record is the last 22 bytes when the archive has no comment; a comment pushes it back, up to 65,535 bytes.
  for (let at = archive.length - 22; at >= Math.max(0, archive.length - 22 - 0xffff); at--) {
    if (archive.readUInt32LE(at) !== endOfCentralDirectory) continue;
    if (archive.readUInt16LE(at + 10) === 0xffff || archive.readUInt32LE(at + 16) === 0xffffffff) throw new Error("ZIP64 archives aren't supported");
    return { entries: archive.readUInt16LE(at + 10), size: archive.readUInt32LE(at + 12), offset: archive.readUInt32LE(at + 16) };
  }
  throw new Error("not a ZIP: no end of central directory record");
}
