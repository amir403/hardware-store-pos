/**
 * Vendor tool for licences. Keep the private key OFF the shop computers.
 *
 *   npx tsx scripts/license.ts keygen
 *     Creates the signing key pair once. The private key goes to
 *     %USERPROFILE%\.hardware-pos-license\private.pem (back it up somewhere
 *     safe); the public key is printed for app/lib/license.ts.
 *
 *   npx tsx scripts/license.ts issue --shop "Raza Hardware" --machine ABCD-EFGH-IJ --months 12
 *   npx tsx scripts/license.ts issue --shop "Raza Hardware" --machine ABCD-EFGH-IJ --until 2027-12-31
 *     Prints a key for that shop's computer (machine code from its
 *     Settings > License page). Paste it there.
 */
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const dir = path.join(homedir(), ".hardware-pos-license");
const privatePath = path.join(dir, "private.pem");
const [command, ...rest] = process.argv.slice(2);
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const fail = (text: string): never => {
  console.error(text);
  process.exit(1);
};
const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

if (command === "keygen") {
  if (existsSync(privatePath)) fail(`A private key already exists at ${privatePath}. Not overwriting it.`);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  mkdirSync(dir, { recursive: true });
  writeFileSync(privatePath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`Private key saved to ${privatePath}. Back it up; lose it and no new licences can be issued.`);
  console.log("\nPut this in LICENSE_PUBLIC_KEY in app/lib/license.ts:\n");
  console.log(publicKey.export({ type: "spki", format: "pem" }));
} else if (command === "issue") {
  const shop = arg("shop") ?? fail("--shop is required");
  const machine = (arg("machine") ?? fail("--machine is required")).toUpperCase();
  if (!/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{2}$/.test(machine)) fail("--machine looks like ABCD-EF01-23 (from Settings > License)");
  let expires = arg("until");
  if (!expires) {
    const months = Number(arg("months") ?? 12);
    if (!Number.isInteger(months) || months < 1) fail("--months must be a whole number");
    const end = new Date();
    end.setMonth(end.getMonth() + months);
    expires = day(end);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) fail("--until must be yyyy-mm-dd");
  if (!existsSync(privatePath)) fail(`No private key at ${privatePath}. Run keygen first.`);

  const payload = Buffer.from(JSON.stringify({ shop, machine, expires, issued: day(new Date()) })).toString("base64url");
  const signed = `HPOS1.${payload}`;
  const signature = sign(null, Buffer.from(signed), createPrivateKey(readFileSync(privatePath))).toString("base64url");
  console.log(`Licence for "${shop}" on ${machine}, valid until ${expires}:\n`);
  console.log(`${signed}.${signature}`);
} else {
  fail("Usage: npx tsx scripts/license.ts keygen | issue --shop NAME --machine CODE (--months N | --until yyyy-mm-dd)");
}
