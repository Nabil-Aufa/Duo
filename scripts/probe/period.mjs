import { createPublicClient, http, parseAbi } from "viem";
const C2 = createPublicClient({ transport: http("https://coston2-api.flare.network/ext/C/rpc") });
const V = "0xC90D6847747b85d1fa2E07859869fb9fB72c0361";
const abi = parseAbi([
  "function currentPeriod() view returns (uint256)",
  "function currentPeriodStart() view returns (uint256)",
  "function currentPeriodEnd() view returns (uint256)",
  "function nextPeriodEnd() view returns (uint256)",
]);
const now = Math.floor(Date.now()/1000);
const DEADLINE = Date.UTC(2026,7,14,19,59,0)/1000;
const out = {};
for (const fn of ["currentPeriod","currentPeriodStart","currentPeriodEnd","nextPeriodEnd"]) {
  out[fn] = Number(await C2.readContract({address:V, abi, functionName:fn}));
}
const fmt = t => new Date(t*1000).toISOString().replace('T',' ').slice(0,16)+' UTC';
console.log("periode sekarang :", out.currentPeriod);
console.log("mulai            :", fmt(out.currentPeriodStart));
console.log("BERAKHIR         :", fmt(out.currentPeriodEnd));
console.log("tenggat hackathon:", fmt(DEADLINE));
console.log("");
const mins = Math.round((out.currentPeriodEnd - now)/60);
console.log(`periode berakhir dalam ${Math.floor(mins/60)} jam ${mins%60} menit`);
console.log(out.currentPeriodEnd < DEADLINE
  ? ">>> BISA: periode berakhir SEBELUM tenggat — klaim penarikan masih sempat direkam"
  : ">>> TIDAK BISA: periode berakhir setelah tenggat");
