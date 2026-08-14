import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import "dotenv/config";

const c = createPublicClient({ transport: http("https://coston2-api.flare.network/ext/C/rpc") });
const MAC = "0x434936d47503353f06750Db1A444DBDC5F0AD37c";
const XRPL = process.env.XRPL_ACCOUNT_ADDRESS;
console.log("Alamat XRPL:", XRPL, "\n");

// Cari fungsi pencarian personal account di MasterAccountController.
const cands = [
  "function personalAccount(string) view returns (address)",
  "function getPersonalAccount(string) view returns (address)",
  "function accountOf(string) view returns (address)",
  "function personalAccounts(string) view returns (address)",
  "function getAccount(string) view returns (address)",
  "function personalAccount(bytes32) view returns (address)",
  "function getPersonalAccount(bytes32) view returns (address)",
  "function computeAddress(string) view returns (address)",
  "function accountAddress(string) view returns (address)",
];

for (const sig of cands) {
  const abi = parseAbi([sig]);
  const fn = sig.match(/function (\w+)/)[1];
  const isBytes32 = sig.includes("bytes32");
  const arg = isBytes32
    ? ("0x" + Buffer.from(XRPL, "utf8").toString("hex").padEnd(64, "0"))
    : XRPL;
  try {
    const r = await c.readContract({ address: MAC, abi, functionName: fn, args: [arg] });
    console.log(`ADA   ${sig.padEnd(62)} -> ${r}`);
  } catch (e) {
    const m = (e.shortMessage || e.message || "").split("\n")[0];
    if (!/reverted|returned no data/i.test(m)) console.log(`?     ${fn}: ${m.slice(0,60)}`);
  }
}
