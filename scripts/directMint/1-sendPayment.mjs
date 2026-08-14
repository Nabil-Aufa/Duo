/**
 * TAHAP 1 — Kirim satu pembayaran XRP yang mencetak FXRP DAN memicu pembagian.
 *
 * Inilah alur produk yang sebenarnya. Bukan pembayaran ke operator (itu kanal
 * untuk instruksi baku 32 byte), melainkan pembayaran ke alamat Core Vault
 * FAssets, dengan user-op dititipkan di memo.
 *
 * Alurnya:
 *   pembayaran XRP + memo  ->  FAssets mencetak FXRP ke personal account
 *                          ->  handleMintedFAssets menjalankan memo
 *                          ->  DuoVault.split()
 *
 * Memo memakai opcode 0xFE: isinya hanya HASH dari user-op, jadi panjangnya
 * tetap 42 byte berapa pun banyaknya perintah. User-op penuh dikirim terpisah
 * sebagai `_data` di tahap 3, dan dicocokkan dengan hash ini.
 *
 *   node scripts/directMint/1-sendPayment.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import {
  createPublicClient, http, encodeAbiParameters, encodeFunctionData,
  parseAbi, keccak256, formatUnits,
} from "viem";
import { Client, Wallet } from "xrpl";
import { PACKED_USER_OP_TYPE, emptyUserOpFields } from "./userOp.mjs";
import "dotenv/config";

const d = JSON.parse(readFileSync("deployments/coston2.json", "utf8"));

const MAC = "0x434936d47503353f06750Db1A444DBDC5F0AD37c";
const ASSET_MANAGER = "0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA";
const WALLET_ID = 0;
const EXECUTOR_FEE_DROPS = 0n;
const XRPL_RPC = "wss://s.altnet.rippletest.net:51233";

const XRP_TO_SEND = process.env.XRP_AMOUNT ?? "20";
const TARGET_USD = process.env.TARGET_USD ?? "5";
const APPROVE_FXRP = process.env.APPROVE_FXRP ?? "1000000"; // besar; sisanya tetap milik PA

const flare = createPublicClient({ transport: http("https://coston2-api.flare.network/ext/C/rpc") });

const macAbi = parseAbi([
  "function getPersonalAccount(string) view returns (address)",
  "function getNonce(address) view returns (uint256)",
]);
const amAbi = parseAbi(["function directMintingPaymentAddress() view returns (string)"]);
const erc20 = parseAbi(["function approve(address,uint256) returns (bool)"]);
const vaultAbi = parseAbi(["function split()", "function setTarget(uint256)"]);
const paAbi = parseAbi([
  "function executeUserOp((address target, uint256 value, bytes data)[] calls) payable",
]);


const xrplAddress = process.env.XRPL_ACCOUNT_ADDRESS;

const pa = await flare.readContract({
  address: MAC, abi: macAbi, functionName: "getPersonalAccount", args: [xrplAddress],
});
const nonce = await flare.readContract({
  address: MAC, abi: macAbi, functionName: "getNonce", args: [pa],
});
const coreVault = await flare.readContract({
  address: ASSET_MANAGER, abi: amAbi, functionName: "directMintingPaymentAddress",
});

console.log("Alamat XRPL      :", xrplAddress);
console.log("Personal account :", pa);
console.log("Nonce            :", nonce.toString());
console.log("Core Vault XRPL  :", coreVault);
console.log("Dikirim          :", XRP_TO_SEND, "XRP");

// Tiga perintah, dijalankan berurutan oleh personal account setelah FXRP dicetak.
const targetWei = BigInt(Math.round(Number(TARGET_USD) * 1e6));
const approveWei = BigInt(Math.round(Number(APPROVE_FXRP) * 1e6));
const calls = [
  { target: d.contracts.DuoVault, value: 0n,
    data: encodeFunctionData({ abi: vaultAbi, functionName: "setTarget", args: [targetWei] }) },
  { target: d.external.FXRP, value: 0n,
    data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [d.contracts.DuoVault, approveWei] }) },
  { target: d.contracts.DuoVault, value: 0n,
    data: encodeFunctionData({ abi: vaultAbi, functionName: "split", args: [] }) },
];

const callData = encodeFunctionData({ abi: paAbi, functionName: "executeUserOp", args: [calls] });
const userOpData = encodeAbiParameters(PACKED_USER_OP_TYPE, [{
  sender: pa,
  nonce,
  callData,
  ...emptyUserOpFields,
}]);
const userOpHash = keccak256(userOpData);

// memo 0xFE: [opcode][walletId:1][executorFee:8][hash:32] = 42 byte
const memo = (
  "fe" +
  WALLET_ID.toString(16).padStart(2, "0") +
  EXECUTOR_FEE_DROPS.toString(16).padStart(16, "0") +
  userOpHash.slice(2)
).toUpperCase();

console.log("\nTarget           : $" + TARGET_USD);
console.log("UserOp hash      :", userOpHash);
console.log("Ukuran memo      :", memo.length / 2, "byte (harus 42)");
if (memo.length / 2 !== 42) throw new Error("ukuran memo salah");

console.log("\nMengirim pembayaran XRPL ke Core Vault...");
const client = new Client(XRPL_RPC);
await client.connect();
let txHash;
try {
  const wallet = Wallet.fromSeed(process.env.XRPL_ACCOUNT_SECRET);
  // TANPA DestinationTag — dokumentasi Flare memperingatkan bahwa memakai tag
  // membuka celah front-running lewat pembelian tag di facet direct minting.
  const prepared = await client.autofill({
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: coreVault,
    Amount: String(Math.round(Number(XRP_TO_SEND) * 1e6)),
    Memos: [{ Memo: { MemoData: memo } }],
  });
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  const code = result.result.meta?.TransactionResult;
  txHash = result.result.hash;
  console.log("Hasil            :", code);
  console.log("Hash XRPL        :", txHash);
  console.log("Explorer         : https://testnet.xrpl.org/transactions/" + txHash);
  if (code !== "tesSUCCESS") throw new Error("pembayaran gagal: " + code);
} finally {
  await client.disconnect();
}

if (!existsSync("deployments")) mkdirSync("deployments");
writeFileSync(
  "deployments/directMint.json",
  JSON.stringify({
    xrplAddress, personalAccount: pa, nonce: nonce.toString(),
    coreVault, xrpSent: XRP_TO_SEND, targetUsd: TARGET_USD,
    userOpData, userOpHash, memo, xrplTxHash: txHash,
    sentAt: new Date().toISOString(),
  }, null, 2) + "\n",
);

console.log("\nTersimpan di deployments/directMint.json");
console.log("Berikutnya: node scripts/directMint/2-getProof.mjs");
