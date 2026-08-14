import { createPublicClient, http, parseAbi, formatUnits, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";

const c = createPublicClient({ transport: http("https://coston2-api.flare.network/ext/C/rpc") });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

const FXRP = "0x0b6A3645c240605887a5532109323A3E12273dc7";
const USDT0 = "0xC1A5B41512496B80903D1f32d6dEa3a73212E71F";

const addr = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY).address;
const [c2flr, fxrp, usdt0] = await Promise.all([
  c.getBalance({ address: addr }),
  c.readContract({ address: FXRP, abi: erc20, functionName: "balanceOf", args: [addr] }),
  c.readContract({ address: USDT0, abi: erc20, functionName: "balanceOf", args: [addr] }),
]);

const row = (label, value, unit, ok) =>
  `${ok ? "OK " : "-- "} ${label.padEnd(8)} ${String(value).padStart(14)} ${unit}`;

console.log("Dompet:", addr, "\n");
console.log(row("C2FLR", formatEther(c2flr), "(untuk gas)", c2flr > 0n));
console.log(row("FXRP", formatUnits(fxrp, 6), "(untuk dibelah)", fxrp > 0n));
console.log(row("USDT0", formatUnits(usdt0, 6), "(likuiditas swap)", usdt0 > 0n));

const ready = c2flr > 0n && fxrp > 0n && usdt0 > 0n;
console.log("\n" + (ready ? ">>> SIAP DEPLOY" : ">>> MASIH MENUNGGU FAUCET"));
process.exit(ready ? 0 : 1);
