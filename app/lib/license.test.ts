import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { licenseState, machineCodeFrom, verifyLicense } from "./license";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
const machine = machineCodeFrom("test-guid");

function issue(payload: object, key = privateKey) {
  const signed = `HPOS1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  return `${signed}.${sign(null, Buffer.from(signed), key).toString("base64url")}`;
}

const now = new Date(2026, 10, 24, 10);
const base = { machine, now, trialStart: new Date(2026, 10, 20), publicKey: pub, production: true };
const key = (expires: string, m = machine) => issue({ shop: "Test", machine: m, expires, issued: "2026-11-24" });

test("license: signature, tampering and other vendors' keys", () => {
  assert.equal(verifyLicense(key("2027-11-24"), pub)?.shop, "Test");
  const [p, , s] = key("2027-11-24").split(".");
  const forged = Buffer.from(JSON.stringify({ shop: "Test", machine, expires: "2099-01-01" })).toString("base64url");
  assert.equal(verifyLicense(`${p}.${forged}.${s}`, pub), null);
  const other = generateKeyPairSync("ed25519").privateKey;
  assert.equal(verifyLicense(issue({ shop: "X", machine, expires: "2099-01-01" }, other), pub), null);
  assert.equal(verifyLicense("garbage", pub), null);
});

test("license: valid, expiring, grace and expired", () => {
  assert.equal(licenseState({ ...base, key: key("2027-11-24") }).status, "valid");
  const soon = licenseState({ ...base, key: key("2026-12-01") });
  assert.deepEqual([soon.status, soon.daysLeft, soon.canSell], ["expiring", 7, true]);
  const grace = licenseState({ ...base, key: key("2026-11-20") });
  assert.deepEqual([grace.status, grace.canSell], ["grace", true]);
  const over = licenseState({ ...base, key: key("2026-11-10") });
  assert.deepEqual([over.status, over.canSell], ["expired", false]);
});

test("license: trial, wrong machine and development", () => {
  assert.deepEqual([licenseState({ ...base, key: null }).status, licenseState({ ...base, key: null }).daysLeft], ["trial", 10]);
  const ended = licenseState({ ...base, key: null, trialStart: new Date(2026, 9, 1) });
  assert.deepEqual([ended.status, ended.canSell], ["trial-ended", false]);
  const elsewhere = licenseState({ ...base, key: key("2027-11-24", machineCodeFrom("other-pc")) });
  assert.deepEqual([elsewhere.status, elsewhere.canSell], ["wrong-machine", true]);
  assert.equal(licenseState({ ...base, key: null, production: false }).status, "dev");
  assert.match(machine, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{2}$/);
});
