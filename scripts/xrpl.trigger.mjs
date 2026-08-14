/**
 * Memicu DuoVault.split() dari SATU pembayaran XRPL biasa.
 *
 * Tidak ada MetaMask. Tidak ada FLR. Penerima tidak pernah meninggalkan XRPL.
 *
 * Cara kerjanya:
 *   1. Setiap alamat XRPL otomatis punya "personal account" di Flare.
 *   2. Perintah dititipkan di kolom memo pembayaran XRPL sebagai
 *      PackedUserOperation (ERC-4337) dengan opcode 0xFF.
 *   3. Operator Flare mengambil bukti pembayaran lewat FDC, lalu meneruskannya
 *      ke MasterAccountController.
 *   4. Personal account menjalankan executeUserOp — di sini: approve FXRP lalu
 *      panggil DuoVault.split().
 *
 * Format memo: [0xFF][walletId:1][executorFee:8][abi.encode(PackedUserOperation)]
 */
import { readFileSync } from "node:fs";
import {
  createPublicClient, http, encodeAbiParameters, encodeFunctionData,
  parseAbi, formatUnits, keccak256,
} from "viem";
import { Client, Wallet, convertStringToHex } from "xrpl";
import "dotenv/config";

const d = JSON.parse(readFileSync("deployments/coston2.json", "utf8"));

const MAC = "0x434936d47503353f06750Db1A444DBDC5F0AD37c";
const OPERATOR_XRPL = "rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq";
const WALLET_ID = 0;
const EXECUTOR_FEE_DROPS = 0n;
const XRPL_RPC = "wss://s.altnet.rippletest.net:51233";

const flare = createPublicClient({ transport: http("https://coston2-api.flare.network/ext/C/rpc") });
const fmt = (v) => formatUnits(v, 6);

const macAbi = parseAbi([
  "function getPersonalAccount(string) view returns (address)",
  "function getNonce(address) view returns (uint256)",
]);
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);
const vaultAbi = parseAbi(["function split()", "function setTarget(uint256)"]);
const paAbi = parseAbi([
  "function executeUserOp((address target, uint256 value, bytes data)[] calls) payable",
]);

// PackedUserOperation dari ERC-4337, seperti yang di-decode MemoInstructions.
const USER_OP_TYPE = [{
  type: "tuple",
  components: [
    { name: "sender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "initCode", type: "bytes" },
    { name: "callData", type: "bytes" },
    { name: "accountGasLimits", type: "bytes32" },
    { name: "preVerificationGas", type: "uint256" },
    { name: "gasFees", type: "bytes32" },
    { name: "signature", type: "bytes" },
  ],
}];

const ZERO32 = "0x" + "00".repeat(32);

function buildMemo(userOpHex) {
  const header =
    "ff" +
    WALLET_ID.toString(16).padStart(2, "0") +
    EXECUTOR_FEE_DROPS.toString(16).padStart(16, "0");
  return (header + userOpHex.slice(2)).toUpperCase();
}

async function main() {
  const xrplAddress = process.env.XRPL_ACCOUNT_ADDRESS;
  const target = process.env.TARGET_USD ?? "2";
  const amount = process.env.AMOUNT_FXRP ?? "3";

  const pa = await flare.readContract({
    address: MAC, abi: macAbi, functionName: "getPersonalAccount", args: [xrplAddress],
  });
  const nonce = await flare.readContract({
    address: MAC, abi: macAbi, functionName: "getNonce", args: [pa],
  });

  console.log("Alamat XRPL      :", xrplAddress);
  console.log("Personal account :", pa);
  console.log("Nonce            :", nonce.toString());

  const paFxrp = await flare.readContract({
    address: d.external.FXRP, abi: erc20, functionName: "balanceOf", args: [pa],
  });
  console.log("FXRP di PA       :", fmt(paFxrp));
  if (paFxrp === 0n) {
    console.log("\n!! Personal account belum punya FXRP. Jalankan dulu:");
    console.log("   npx hardhat run scripts/fundPersonalAccount.ts --network coston2");
    process.exit(1);
  }

  const amountWei = BigInt(Math.round(Number(amount) * 1e6));
  const targetWei = BigInt(Math.round(Number(target) * 1e6));

  // Memo XRPL punya batas ukuran, dan PackedUserOperation dengan tiga panggilan
  // sekaligus melewatinya. Jadi tiap perintah dikirim sebagai pembayaran XRPL
  // tersendiri.
  //
  // Ini bukan sekadar akal-akalan teknis — justru begini cara produknya
  // seharusnya bekerja: pengguna mengatur aturannya SEKALI, lalu setiap
  // pembayaran yang masuk cukup memicu `split()`.
  const MODE = (process.env.MODE ?? "split").toLowerCase();
  const CALLS = {
    settarget: [{
      target: d.contracts.DuoVault, value: 0n,
      data: encodeFunctionData({ abi: vaultAbi, functionName: "setTarget", args: [targetWei] }),
    }],
    approve: [{
      target: d.external.FXRP, value: 0n,
      data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [d.contracts.DuoVault, amountWei] }),
    }],
    split: [{
      target: d.contracts.DuoVault, value: 0n,
      data: encodeFunctionData({ abi: vaultAbi, functionName: "split", args: [] }),
    }],
  };
  const calls = CALLS[MODE];
  if (!calls) throw new Error(`MODE tidak dikenal: ${MODE} (pilih settarget | approve | split)`);
  console.log("Perintah         :", MODE);

  const callData = encodeFunctionData({ abi: paAbi, functionName: "executeUserOp", args: [calls] });

  const userOpHex = encodeAbiParameters(USER_OP_TYPE, [{
    sender: pa,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits: ZERO32,
    preVerificationGas: 0n,
    gasFees: ZERO32,
    signature: "0x",
  }]);

  const memo = buildMemo(userOpHex);
  console.log("\nUserOp hash      :", keccak256(userOpHex));
  console.log("Ukuran memo      :", memo.length / 2, "byte (", memo.length, "karakter hex )");

  console.log("\nMengirim pembayaran XRPL ke operator...");
  const client = new Client(XRPL_RPC);
  await client.connect();
  try {
    const wallet = Wallet.fromSeed(process.env.XRPL_ACCOUNT_SECRET);
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: OPERATOR_XRPL,
      Amount: "1000000", // 1 XRP
      Memos: [{ Memo: { MemoData: memo } }],
    });
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const code = result.result.meta?.TransactionResult;
    console.log("Hasil XRPL       :", code);
    console.log("Hash XRPL        :", result.result.hash);
    console.log("Explorer         : https://testnet.xrpl.org/transactions/" + result.result.hash);
    if (code !== "tesSUCCESS") throw new Error("pembayaran XRPL gagal: " + code);
  } finally {
    await client.disconnect();
  }

  console.log("\nMenunggu operator meneruskan ke Flare (biasanya <2 menit)...");
  const startNonce = nonce;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const n = await flare.readContract({ address: MAC, abi: macAbi, functionName: "getNonce", args: [pa] });
    if (n > startNonce) {
      console.log(`\nDIEKSEKUSI. Nonce naik ${startNonce} -> ${n}`);
      break;
    }
    if (i % 6 === 5) console.log(`  ...${(i + 1) * 5} detik`);
  }

  const [fxrpAfter, stableAfter, sharesAfter] = await Promise.all([
    flare.readContract({ address: d.external.FXRP, abi: erc20, functionName: "balanceOf", args: [pa] }),
    flare.readContract({ address: d.external.USDT0, abi: erc20, functionName: "balanceOf", args: [pa] }),
    flare.readContract({ address: d.external.FirelightVault, abi: erc20, functionName: "balanceOf", args: [pa] }),
  ]);
  console.log("\nSALDO PERSONAL ACCOUNT SESUDAH");
  console.log("  FXRP  :", fmt(fxrpAfter));
  console.log("  USDT0 :", fmt(stableAfter), " <- porsi aman");
  console.log("  stXRP :", fmt(sharesAfter), " <- tabungan");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
