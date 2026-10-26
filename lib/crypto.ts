import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field-level encryption for profile PII (AES-256-GCM, authenticated). Same format as Lull:
 * `v1:<iv b64url>:<tag b64url>:<data b64url>`; the version prefix allows key rotation.
 * PROFILE_DATA_KEY must be backed up: losing it makes stored profiles unreadable.
 */

const KEYS: Record<string, Buffer> = {};

function key(version: string) {
  if (KEYS[version]) return KEYS[version];
  const raw = version === "v1" ? process.env.PROFILE_DATA_KEY : undefined;
  if (!raw) throw new Error(`Missing encryption key for ${version}`);
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("PROFILE_DATA_KEY must be 32 bytes (base64)");
  KEYS[version] = buf;
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("v1"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (!version || !iv || !tag || data === undefined) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(version), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export const encryptJson = (v: unknown) => encrypt(JSON.stringify(v));
export const decryptJson = <T>(v: string) => JSON.parse(decrypt(v)) as T;
