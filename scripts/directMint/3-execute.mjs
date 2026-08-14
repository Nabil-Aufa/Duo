/**
 * TAHAP 3 — Jalankan direct minting dengan user-op sebagai `_data`.
 *
 * AssetManager memverifikasi bukti FDC, mencetak FXRP ke personal account,
 * lalu meneruskan memo ke MasterAccountController. Di sana hash di memo
 * dicocokkan dengan keccak256(_data); kalau cocok, user-op dijalankan —
 * setTarget, approve, split.
 *
 * Kita sendiri yang jadi executor di sini. Tidak ada operator yang terlibat.
 *
 *   node scripts/directMint/3-execute.mjs
 */
import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, parseAbi,
  decodeAbiParameters, decodeErrorResult, formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";

const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const ASSET_MANAGER = "0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA";
const EXPLORER = "https://coston2-explorer.flare.network/tx/";

const d = JSON.parse(readFileSync("deployments/coston2.json", "utf8"));
const state = JSON.parse(readFileSync("deployments/directMint.json", "utf8"));

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const pub = createPublicClient({ transport: http(RPC) });
const wallet = createWalletClient({ account, transport: http(RPC) });

// Bentuk IXRPPayment.Response, persis seperti di periphery.
const RESPONSE_TYPE = {
  type: "tuple",
  components: [
    { name: "attestationType", type: "bytes32" },
    { name: "sourceId", type: "bytes32" },
    { name: "votingRound", type: "uint64" },
    { name: "lowestUsedTimestamp", type: "uint64" },
    {
      name: "requestBody", type: "tuple",
      components: [
        { name: "transactionId", type: "bytes32" },
        { name: "proofOwner", type: "address" },
      ],
    },
    {
      name: "responseBody", type: "tuple",
      components: [
        { name: "blockNumber", type: "uint64" },
        { name: "blockTimestamp", type: "uint64" },
        { name: "sourceAddress", type: "string" },
        { name: "sourceAddressHash", type: "bytes32" },
        { name: "receivingAddressHash", type: "bytes32" },
        { name: "intendedReceivingAddressHash", type: "bytes32" },
        { name: "spentAmount", type: "int256" },
        { name: "intendedSpentAmount", type: "int256" },
        { name: "receivedAmount", type: "int256" },
        { name: "intendedReceivedAmount", type: "int256" },
        { name: "hasMemoData", type: "bool" },
        { name: "firstMemoData", type: "bytes" },
        { name: "hasDestinationTag", type: "bool" },
        { name: "destinationTag", type: "uint256" },
        { name: "status", type: "uint8" },
      ],
    },
  ],
};

const [response] = decodeAbiParameters([RESPONSE_TYPE], state.proof.response_hex);

console.log("=== BUKTI FDC YANG DIDAPAT ===");
console.log("  dari           :", response.responseBody.sourceAddress);
console.log("  diterima       :", formatUnits(response.responseBody.receivedAmount, 6), "XRP");
console.log("  status         :", response.responseBody.status, "(0 = sukses)");
console.log("  ada memo       :", response.responseBody.hasMemoData);
console.log("  memo           :", response.responseBody.firstMemoData);
console.log("  destination tag:", response.responseBody.hasDestinationTag, "(harus false)");

const memoMatches =
  response.responseBody.firstMemoData.toLowerCase() === ("0x" + state.memo).toLowerCase();
console.log("  memo cocok     :", memoMatches);
if (!memoMatches) {
  console.log("    diharapkan   : 0x" + state.memo.toLowerCase());
}

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const before = {
  fxrp: await pub.readContract({ address: d.external.FXRP, abi: erc20, functionName: "balanceOf", args: [state.personalAccount] }),
  stable: await pub.readContract({ address: d.external.USDT0, abi: erc20, functionName: "balanceOf", args: [state.personalAccount] }),
  shares: await pub.readContract({ address: d.external.FirelightVault, abi: erc20, functionName: "balanceOf", args: [state.personalAccount] }),
};
const f = (v) => formatUnits(v, 6);
console.log("\n=== PERSONAL ACCOUNT SEBELUM ===");
console.log("  FXRP :", f(before.fxrp), " USDT0:", f(before.stable), " stXRP:", f(before.shares));

// ABI disusun eksplisit, bukan lewat parseAbi — tuple bersarang sedalam ini
// gampang salah kalau ditulis sebagai string.
const amAbi = [
  {
    type: "function",
    name: "executeDirectMintingWithData",
    stateMutability: "payable",
    outputs: [],
    inputs: [
      {
        name: "_payment",
        type: "tuple",
        components: [
          { name: "merkleProof", type: "bytes32[]" },
          { ...RESPONSE_TYPE, name: "data" },
        ],
      },
      { name: "_data", type: "bytes" },
    ],
  },
  // Error dari MemoInstructions. `CallFailed` membungkus revert data dari
  // panggilan di dalam personal account, jadi penyebab sebenarnya ada di situ.
  { type: "error", name: "CallFailed", inputs: [{ name: "returnData", type: "bytes" }] },
  { type: "error", name: "InvalidNonce", inputs: [{ name: "expected", type: "uint256" }, { name: "actual", type: "uint256" }] },
  { type: "error", name: "InvalidSender", inputs: [{ name: "sender", type: "address" }, { name: "personalAccount", type: "address" }] },
  { type: "error", name: "InvalidMemoData", inputs: [] },
  { type: "error", name: "TransactionAlreadyExecuted", inputs: [] },
];

// Error yang mungkin muncul dari kontrak kita sendiri, untuk membongkar
// isi CallFailed.
const INNER_ERRORS = [
  { type: "error", name: "InsufficientLiquidity", inputs: [{ name: "requested", type: "uint256" }, { name: "available", type: "uint256" }] },
  { type: "error", name: "SlippageExceeded", inputs: [{ name: "amountOut", type: "uint256" }, { name: "minOut", type: "uint256" }] },
  { type: "error", name: "NothingToSplit", inputs: [] },
  { type: "error", name: "ResidualBalance", inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }] },
  { type: "error", name: "StalePrice", inputs: [{ name: "priceTimestamp", type: "uint64" }, { name: "nowTimestamp", type: "uint64" }, { name: "maxAge", type: "uint64" }] },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "InvalidPrice", inputs: [] },
  { type: "error", name: "CallFailed", inputs: [{ name: "index", type: "uint256" }, { name: "result", type: "bytes" }] },
];

const payment = { merkleProof: state.proof.proof, data: response };

console.log("\nMenjalankan direct minting...");
try {
  const sim = await pub.simulateContract({
    account, address: ASSET_MANAGER, abi: amAbi,
    functionName: "executeDirectMintingWithData",
    args: [payment, state.userOpData],
  });
  const hash = await wallet.writeContract({ ...sim.request, chain: null });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log("  tx:", EXPLORER + hash);
  console.log("  gas:", receipt.gasUsed.toString());
} catch (e) {
  console.error("\nGAGAL:", (e.shortMessage || e.message || "").slice(0, 200));

  // Bongkar lapis demi lapis: CallFailed dari MemoInstructions membungkus
  // revert dari personal account, yang membungkus revert kontrak kita.
  const findData = (err) => {
    let cur = err;
    for (let i = 0; i < 8 && cur; i++) {
      if (cur.data && typeof cur.data === "string" && cur.data.startsWith("0x")) return cur.data;
      if (cur.data?.data) return cur.data.data;
      cur = cur.cause;
    }
    return null;
  };
  let raw = findData(e);
  for (let depth = 0; raw && depth < 4; depth++) {
    let decoded = null;
    for (const abi of [amAbi, INNER_ERRORS]) {
      try { decoded = decodeErrorResult({ abi, data: raw }); break; } catch {}
    }
    if (!decoded) {
      console.error(`  lapis ${depth}: tidak dikenal, selector ${raw.slice(0, 10)}`);
      break;
    }
    const args = (decoded.args ?? []).map(String).join(", ");
    console.error(`  lapis ${depth}: ${decoded.errorName}(${args.slice(0, 160)})`);
    const nested = (decoded.args ?? []).find(
      (a) => typeof a === "string" && a.startsWith("0x") && a.length > 10,
    );
    if (!nested) break;
    raw = nested;
  }
  process.exit(1);
}

const after = {
  fxrp: await pub.readContract({ address: d.external.FXRP, abi: erc20, functionName: "balanceOf", args: [state.personalAccount] }),
  stable: await pub.readContract({ address: d.external.USDT0, abi: erc20, functionName: "balanceOf", args: [state.personalAccount] }),
  shares: await pub.readContract({ address: d.external.FirelightVault, abi: erc20, functionName: "balanceOf", args: [state.personalAccount] }),
};
console.log("\n=== PERSONAL ACCOUNT SESUDAH ===");
console.log("  FXRP  :", f(after.fxrp), `(${f(after.fxrp - before.fxrp)})`);
console.log("  USDT0 :", f(after.stable), `(+${f(after.stable - before.stable)})   <- porsi aman`);
console.log("  stXRP :", f(after.shares), `(+${f(after.shares - before.shares)})   <- tabungan`);
