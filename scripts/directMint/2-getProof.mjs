/**
 * TAHAP 2 — Minta atestasi FDC untuk pembayaran XRPL tadi, lalu ambil Merkle
 * proof-nya dari DA Layer.
 *
 * Alurnya: siapkan permintaan di verifier -> kirim ke FdcHub (bayar fee) ->
 * tunggu ronde voting difinalisasi (~90-180 detik) -> ambil proof.
 *
 *   node scripts/directMint/2-getProof.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, toHex, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";

const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const VERIFIER = "https://fdc-verifiers-testnet.flare.network";
const DA_LAYER = "https://ctn2-data-availability.flare.network";
const API_KEY = process.env.VERIFIER_API_KEY_TESTNET ?? "00000000-0000-0000-0000-000000000000";

const FDC_HUB = "0x48aC463d7975828989331F4De43341627b9c5f1D";
const RELAY = "0xa10B672D1c62e5457b17af63d4302add6A99d7dE";
const FLARE_SYSTEMS_MANAGER = "0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52";
const FEE_CONFIG = "0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e";
const FDC_PROTOCOL_ID = 200;

const state = JSON.parse(readFileSync("deployments/directMint.json", "utf8"));
const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);

const pub = createPublicClient({ transport: http(RPC) });
const wallet = createWalletClient({ account, transport: http(RPC) });

/** String jadi bytes32, dipadding ke kanan dengan nol. */
const toBytes32 = (s) => toHex(Buffer.from(s, "utf8"), { size: 32 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1. Siapkan permintaan di verifier ---
console.log("1/5 menyiapkan permintaan di verifier...");
const prepareBody = {
  attestationType: toBytes32("XRPPayment"),
  sourceId: toBytes32("testXRP"),
  requestBody: {
    transactionId: "0x" + state.xrplTxHash,
    proofOwner: account.address,
  },
};

const prepRes = await fetch(`${VERIFIER}/verifier/xrp/XRPPayment/prepareRequest`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-KEY": API_KEY },
  body: JSON.stringify(prepareBody),
});
const prep = await prepRes.json();
if (!prep.abiEncodedRequest) {
  console.error("Verifier menolak:", JSON.stringify(prep, null, 2));
  process.exit(1);
}
const requestBytes = prep.abiEncodedRequest;
console.log("    status:", prep.status ?? "(tidak ada)");
console.log("    panjang requestBytes:", (requestBytes.length - 2) / 2, "byte");

// --- 2. Kirim ke FdcHub ---
console.log("2/5 mengirim permintaan atestasi ke FdcHub...");
const feeAbi = parseAbi(["function getRequestFee(bytes) view returns (uint256)"]);
const fee = await pub.readContract({
  address: FEE_CONFIG, abi: feeAbi, functionName: "getRequestFee", args: [requestBytes],
});
console.log("    fee:", formatEther(fee), "C2FLR");

const hubAbi = parseAbi(["function requestAttestation(bytes) payable"]);
const txHash = await wallet.writeContract({
  address: FDC_HUB, abi: hubAbi, functionName: "requestAttestation",
  args: [requestBytes], value: fee, chain: null,
});
const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
console.log("    tx:", "https://coston2-explorer.flare.network/tx/" + txHash);

// --- 3. Hitung voting round ---
const block = await pub.getBlock({ blockNumber: receipt.blockNumber });
const sysAbi = parseAbi([
  "function firstVotingRoundStartTs() view returns (uint64)",
  "function votingEpochDurationSeconds() view returns (uint64)",
]);
const [startTs, epochLen] = await Promise.all([
  pub.readContract({ address: FLARE_SYSTEMS_MANAGER, abi: sysAbi, functionName: "firstVotingRoundStartTs" }),
  pub.readContract({ address: FLARE_SYSTEMS_MANAGER, abi: sysAbi, functionName: "votingEpochDurationSeconds" }),
]);
const roundId = Number((block.timestamp - startTs) / epochLen);
console.log("3/5 voting round:", roundId, `(panjang ronde ${epochLen}s)`);

// --- 4. Tunggu finalisasi ---
console.log("4/5 menunggu ronde difinalisasi...");
const relayAbi = parseAbi(["function isFinalized(uint256,uint256) view returns (bool)"]);
let finalized = false;
for (let i = 0; i < 60; i++) {
  finalized = await pub.readContract({
    address: RELAY, abi: relayAbi, functionName: "isFinalized",
    args: [BigInt(FDC_PROTOCOL_ID), BigInt(roundId)],
  });
  if (finalized) break;
  if (i % 4 === 3) console.log(`    ...${(i + 1) * 15} detik`);
  await sleep(15_000);
}
if (!finalized) throw new Error("ronde tidak difinalisasi dalam 15 menit");
console.log("    difinalisasi.");

// --- 5. Ambil proof dari DA Layer ---
console.log("5/5 mengambil proof dari DA Layer...");
let proof = null;
for (let i = 0; i < 20; i++) {
  const res = await fetch(`${DA_LAYER}/api/v1/fdc/proof-by-request-round-raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": API_KEY },
    body: JSON.stringify({ votingRoundId: roundId, requestBytes }),
  });
  const j = await res.json().catch(() => ({}));
  if (j?.response_hex) { proof = j; break; }
  if (i === 0) console.log("    belum siap, menunggu...");
  await sleep(10_000);
}
if (!proof) throw new Error("proof tidak tersedia di DA Layer");

console.log("    dapat. panjang bukti Merkle:", (proof.proof ?? []).length);

writeFileSync(
  "deployments/directMint.json",
  JSON.stringify({ ...state, roundId, requestBytes, proof, attestedAt: new Date().toISOString() }, null, 2) + "\n",
);
console.log("\nTersimpan. Berikutnya: npx hardhat run scripts/directMint/3-execute.ts --network coston2");
