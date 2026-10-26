import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Guest identity: `<uuid>.<hmac>` in an httpOnly cookie. The HMAC key is derived from
 * PROFILE_DATA_KEY (HKDF, separate purpose), so a guest id can't be forged or guessed.
 */
export const GUEST_COOKIE = "h1b_guest";
export const GUEST_MAX_AGE = 7 * 24 * 3600;

let key: Buffer | null = null;
function macKey() {
  if (!key) key = Buffer.from(hkdfSync("sha256", Buffer.from(process.env.PROFILE_DATA_KEY ?? "", "base64"), "h1bound", "guest-cookie-v1", 32));
  return key;
}

const mac = (id: string) => createHmac("sha256", macKey()).update(id).digest("base64url");

export function signGuest(id: string): string {
  return `${id}.${mac(id)}`;
}

export function verifyGuest(value: string | undefined | null): string | null {
  if (!value) return null;
  const [id, sig] = value.split(".");
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const want = Buffer.from(mac(id));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

/** IPs are only kept as a keyed hash, for the guests-per-IP abuse limit. */
export function hashIp(ip: string): string {
  return createHmac("sha256", macKey()).update(`ip:${ip}`).digest("base64url").slice(0, 32);
}
