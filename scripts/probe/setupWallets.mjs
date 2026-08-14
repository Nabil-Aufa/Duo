/**
 * Membuat dompet testnet Flare + akun XRPL testnet, lalu menuliskan rahasianya
 * langsung ke .env.
 *
 * Private key TIDAK PERNAH dicetak ke layar atau log. Hanya alamat publik.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ENV = ".env";

function upsert(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(content) ? content.replace(re, line) : content.trimEnd() + "\n" + line + "\n";
}

let env = existsSync(ENV) ? readFileSync(ENV, "utf8") : readFileSync(".env.example", "utf8");

// --- 1. Dompet Flare (Coston2) ---
let flareAddress;
if (/^DEPLOYER_PRIVATE_KEY=0x[0-9a-fA-F]{64}$/m.test(env)) {
  const existing = env.match(/^DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)[1];
  flareAddress = privateKeyToAccount(existing).address;
  console.log("Dompet Flare sudah ada, dipakai ulang.");
} else {
  const pk = generatePrivateKey();
  flareAddress = privateKeyToAccount(pk).address;
  env = upsert(env, "DEPLOYER_PRIVATE_KEY", pk);
  console.log("Dompet Flare baru dibuat.");
}

// --- 2. Akun XRPL testnet (faucet mengembalikan akun yang sudah terisi) ---
let xrplAddress = (env.match(/^XRPL_ACCOUNT_ADDRESS=(r[1-9A-HJ-NP-Za-km-z]{24,34})$/m) || [])[1];
if (xrplAddress) {
  console.log("Akun XRPL sudah ada, dipakai ulang.");
} else {
  console.log("Meminta akun XRPL testnet dari faucet...");
  const res = await fetch("https://faucet.altnet.rippletest.net/accounts", { method: "POST" });
  if (!res.ok) throw new Error(`Faucet XRPL gagal: HTTP ${res.status}`);
  const data = await res.json();
  xrplAddress = data.account.address;
  env = upsert(env, "XRPL_ACCOUNT_ADDRESS", xrplAddress);
  env = upsert(env, "XRPL_ACCOUNT_SECRET", data.account.secret);
  console.log(`Akun XRPL dibuat, saldo awal ${data.balance} XRP testnet.`);
}

writeFileSync(ENV, env);

console.log("\n================ ALAMAT PUBLIK ================");
console.log("Flare (Coston2) :", flareAddress);
console.log("XRPL testnet    :", xrplAddress);
console.log("===============================================");
console.log("\nRahasia tersimpan di .env (sudah masuk .gitignore, tidak akan ter-commit).");
