import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync("deployments/coston2.json", "utf8"));
async function main() {
  if (network.name !== "coston2") throw new Error("hanya coston2");
  const amount = ethers.parseUnits(process.env.TOPUP_USDT0 ?? "5", 6);
  const swap = await ethers.getContractAt("FtsoPricedSwap", d.contracts.FtsoPricedSwap);
  const usdt0 = await ethers.getContractAt("IERC20", d.external.USDT0);
  console.log("likuiditas sebelum:", ethers.formatUnits(await swap.availableLiquidity(), 6));
  await (await usdt0.approve(d.contracts.FtsoPricedSwap, amount)).wait();
  await (await swap.addLiquidity(amount)).wait();
  console.log("likuiditas sesudah:", ethers.formatUnits(await swap.availableLiquidity(), 6));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
