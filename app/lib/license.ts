import { createHash, createPublicKey, verify } from "node:crypto";

/**
 * Offline licences. A key is "HPOS1.<payload>.<signature>" (base64url): the
 * payload names the shop, this computer's machine code and an expiry date, and
 * is signed with the vendor's Ed25519 private key (scripts/license.ts). Only
 * the public key lives here, so a key cannot be forged or edited.
 *
 * Expiry never locks the shop out of its own data: after a warning period and
 * a short grace, only new bills stop; reports, payments and backups carry on.
 */

/** Paste the public key printed by `npx tsx scripts/license.ts keygen`. */
export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAaU1UkWU3Q3DWKvstEmrJAHwGcqWsHuAIUzeXEDVZmfA=
-----END PUBLIC KEY-----`;

export const TRIAL_DAYS = 14;
export const WARN_DAYS = 15;
export const GRACE_DAYS = 7;
const PREFIX = "HPOS1";
const DAY = 86_400_000;

export type LicensePayload = {
  shop: string;
  machine: string;
  /** yyyy-mm-dd, last day the licence is valid. */
  expires: string;
  issued: string;
};

export type LicenseStatus =
  | "dev"
  | "valid"
  | "expiring"
  | "grace"
  | "expired"
  | "trial"
  | "trial-ended"
  | "invalid"
  | "wrong-machine";

export type LicenseState = {
  status: LicenseStatus;
  canSell: boolean;
  /** Days until the licence or trial ends (negative once past it). */
  daysLeft: number;
  payload: LicensePayload | null;
};

const b64 = (s: string) => Buffer.from(s, "base64url");

/** The signed payload, or null when the key is malformed or not signed by the vendor. */
export function verifyLicense(key: string, publicKeyPem: string): LicensePayload | null {
  const parts = key.trim().split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX || !publicKeyPem) return null;
  try {
    const ok = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey(publicKeyPem), b64(parts[2]));
    if (!ok) return null;
    const p = JSON.parse(b64(parts[1]).toString("utf8"));
    if (typeof p.shop !== "string" || typeof p.machine !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.expires)) return null;
    return { shop: p.shop, machine: p.machine, expires: p.expires, issued: String(p.issued ?? "") };
  } catch {
    return null;
  }
}

/** Whole days from today until the end of `yyyy-mm-dd` (0 = expires today). */
function daysUntil(day: string, now: Date): number {
  const [y, m, d] = day.split("-").map(Number);
  const end = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end.getTime() - today.getTime()) / DAY);
}

export function licenseState(input: {
  key: string | null;
  machine: string;
  now: Date;
  /** When this shop started using the POS; the trial runs from here. */
  trialStart: Date;
  publicKey: string;
  production: boolean;
}): LicenseState {
  if (!input.production) return { status: "dev", canSell: true, daysLeft: 0, payload: null };

  const trialLeft = TRIAL_DAYS - Math.floor((input.now.getTime() - input.trialStart.getTime()) / DAY);
  const trial = (status: LicenseStatus, payload: LicensePayload | null = null): LicenseState => ({
    status: status === "trial" && trialLeft <= 0 ? "trial-ended" : status,
    canSell: trialLeft > 0,
    daysLeft: trialLeft,
    payload,
  });

  if (!input.key) return trial("trial");
  const payload = verifyLicense(input.key, input.publicKey);
  if (!payload) return trial("invalid");
  if (payload.machine !== input.machine) return trial("wrong-machine", payload);

  const daysLeft = daysUntil(payload.expires, input.now);
  if (daysLeft > WARN_DAYS) return { status: "valid", canSell: true, daysLeft, payload };
  if (daysLeft >= 0) return { status: "expiring", canSell: true, daysLeft, payload };
  if (daysLeft >= -GRACE_DAYS) return { status: "grace", canSell: true, daysLeft, payload };
  return { status: "expired", canSell: false, daysLeft, payload };
}

/** Short, readable code for this computer: XXXX-XXXX-XX from a hash of its Windows id. */
export function machineCodeFrom(rawId: string): string {
  const hex = createHash("sha256").update(`hpos:${rawId.trim().toLowerCase()}`).digest("hex").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 10)}`;
}
