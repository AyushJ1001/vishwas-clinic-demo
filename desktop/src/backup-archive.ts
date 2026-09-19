import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

// ADR 0004: USB and cloud backups are encrypted with the Backup passphrase.
// Layout: magic, 4-byte header length, JSON header (also authenticated),
// AES-256-GCM ciphertext of the gzipped SQLite file, 16-byte tag.

const magic = Buffer.from("VISHWAS-CLINIC-BACKUP\n");
const tagLength = 16;
const sqliteSignature = Buffer.from("SQLite format 3\0");

type ArchiveHeader = {
  version: 1;
  createdAt: string;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
  cipher: "aes-256-gcm";
  iv: string;
  compression: "gzip";
};

export class WrongPassphraseError extends Error {
  constructor() {
    super("The backup passphrase does not match this backup.");
  }
}

export class NotABackupError extends Error {
  constructor() {
    super("This file is not a Vishwas Clinic backup.");
  }
}

function deriveKey(passphrase: string, kdf: ArchiveHeader["kdf"]) {
  return scryptSync(passphrase.normalize("NFC"), Buffer.from(kdf.salt, "base64"), 32, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: 128 * kdf.N * kdf.r * 2,
  });
}

export function sealBackup(database: Buffer, passphrase: string, createdAt: Date) {
  const header: ArchiveHeader = {
    version: 1,
    createdAt: createdAt.toISOString(),
    kdf: { name: "scrypt", N: 2 ** 15, r: 8, p: 1, salt: randomBytes(16).toString("base64") },
    cipher: "aes-256-gcm",
    iv: randomBytes(12).toString("base64"),
    compression: "gzip",
  };
  const headerBytes = Buffer.from(JSON.stringify(header));
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(headerBytes.length);

  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveKey(passphrase, header.kdf),
    Buffer.from(header.iv, "base64"),
  );
  cipher.setAAD(headerBytes);
  const ciphertext = Buffer.concat([cipher.update(gzipSync(database)), cipher.final()]);
  return Buffer.concat([magic, headerLength, headerBytes, ciphertext, cipher.getAuthTag()]);
}

function readHeader(archive: Buffer) {
  if (archive.length < magic.length + 4 || !archive.subarray(0, magic.length).equals(magic)) {
    throw new NotABackupError();
  }
  const headerStart = magic.length + 4;
  const headerEnd = headerStart + archive.readUInt32BE(magic.length);
  if (headerEnd + tagLength > archive.length) throw new NotABackupError();
  const headerBytes = archive.subarray(headerStart, headerEnd);
  const header = JSON.parse(headerBytes.toString()) as ArchiveHeader;
  if (header.version !== 1) throw new NotABackupError();
  return { header, headerBytes, headerEnd };
}

export function readBackupDate(archive: Buffer) {
  return readHeader(archive).header.createdAt;
}

export function openBackup(archive: Buffer, passphrase: string) {
  const { header, headerBytes, headerEnd } = readHeader(archive);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(passphrase, header.kdf),
    Buffer.from(header.iv, "base64"),
  );
  decipher.setAAD(headerBytes);
  decipher.setAuthTag(archive.subarray(archive.length - tagLength));
  let compressed: Buffer;
  try {
    compressed = Buffer.concat([
      decipher.update(archive.subarray(headerEnd, archive.length - tagLength)),
      decipher.final(),
    ]);
  } catch {
    throw new WrongPassphraseError();
  }
  const database = gunzipSync(compressed);
  if (!database.subarray(0, sqliteSignature.length).equals(sqliteSignature)) {
    throw new NotABackupError();
  }
  return database;
}
