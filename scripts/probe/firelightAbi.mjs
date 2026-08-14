import { createPublicClient, http, keccak256, toHex } from "viem";
const c = createPublicClient({ transport: http("https://coston2-api.flare.network/ext/C/rpc") });
const V = "0xC90D6847747b85d1fa2E07859869fb9fB72c0361";
const USER = "0x98a21cAbEcAc9Ec66Ba1121A75000E933Ead6bC3";

const sel = (sig) => keccak256(toHex(sig)).slice(0, 10);

// Kandidat nama fungsi klaim/penarikan berdasarkan CLI Flare:
// firelight-redeem, firelight-claim-withdraw
const cands = [
  "claimWithdraw()", "claimWithdrawal()", "claim()",
  "claimWithdraw(address)", "claimWithdrawal(address)",
  "claimWithdraw(uint256)", "claimWithdrawal(uint256)",
  "claimWithdraw(uint256,address)", "claimWithdrawals(uint256)",
  "withdrawalsOf(uint256,address)", "currentPeriod()", "currentPeriodEnd()",
  "maxWithdraw(address)", "previewRedeem(uint256)",
  "pendingWithdrawalsOf(address)", "claimableOf(address)",
];

for (const sig of cands) {
  const s = sel(sig);
  let data = s;
  if (sig.includes("address)") && !sig.includes(",")) data = s + USER.slice(2).padStart(64, "0");
  else if (sig.includes("(uint256)")) data = s + (124).toString(16).padStart(64, "0");
  else if (sig.includes("uint256,address")) data = s + (124).toString(16).padStart(64,"0") + USER.slice(2).padStart(64,"0");
  try {
    const r = await c.call({ to: V, data });
    console.log(`ADA        ${sig.padEnd(34)} -> ${r.data ?? "(kosong)"}`);
  } catch (e) {
    const m = (e.shortMessage || e.message || "").split("\n")[0].slice(0, 70);
    console.log(`${/reverted/i.test(m) ? "REVERT   " : "tidak ada"}  ${sig.padEnd(34)} ${/reverted/i.test(m) ? m : ""}`);
  }
}
