import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";

const c = createPublicClient({ transport: http("https://coston2-api.flare.network/ext/C/rpc") });
const V = "0xC90D6847747b85d1fa2E07859869fb9fB72c0361";
const user = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY).address;

const abi = parseAbi([
  "function withdrawalsOf(uint256,address) view returns (uint256)",
  "function currentPeriod() view returns (uint256)",
  "function claimWithdraw(uint256) returns (uint256)",
]);

const cur = await c.readContract({ address: V, abi, functionName: "currentPeriod" });
console.log("periode sekarang:", cur, "\n");

for (let p = Number(cur) - 3; p <= Number(cur) + 1; p++) {
  if (p < 0) continue;
  let w = "-";
  try {
    w = formatUnits(await c.readContract({
      address: V, abi, functionName: "withdrawalsOf", args: [BigInt(p), user], account: user,
    }), 6);
  } catch (e) { w = "err"; }
  let claimable = "-";
  try {
    const r = await c.simulateContract({
      address: V, abi, functionName: "claimWithdraw", args: [BigInt(p)], account: user,
    });
    claimable = formatUnits(r.result, 6);
  } catch (e) {
    claimable = (e.shortMessage || "").includes("revert") ? "belum bisa" : "err";
  }
  console.log(`periode ${String(p).padStart(4)}  tercatat=${String(w).padStart(10)}  simulasi klaim=${claimable}`);
}
