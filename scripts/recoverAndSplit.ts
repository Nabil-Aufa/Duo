import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";

/**
 * Menarik FXRP yang tersimpan di venue swap kembali ke pemilik, lalu
 * menjalankan pembagian baru.
 *
 * FXRP menumpuk di venue swap karena setiap penukaran menukar FXRP dengan
 * USDT0 milik venue. Menariknya kembali adalah operasi pemilik yang wajar —
 * bukan dana pengguna: DuoVault sudah memastikan tidak ada saldo pengguna yang
 * mengendap di mana pun.
 *
 *   npx hardhat run scripts/recoverAndSplit.ts --network coston2
 */

const d = JSON.parse(readFileSync("deployments/coston2.json", "utf8"));
const EXPLORER = "https://coston2-explorer.flare.network/tx/";
const fmt = (v: bigint) => ethers.formatUnits(v, 6);

async function main() {
  if (network.name !== "coston2") throw new Error("hanya untuk coston2");

  const [me] = await ethers.getSigners();
  const swap = await ethers.getContractAt("FtsoPricedSwap", d.contracts.FtsoPricedSwap);
  const fxrp = await ethers.getContractAt("IERC20", d.external.FXRP);

  const stuck = await fxrp.balanceOf(d.contracts.FtsoPricedSwap);
  console.log("FXRP di venue swap :", fmt(stuck));

  if (stuck > 0n) {
    const tx = await swap.withdrawFxrp(stuck, me.address);
    await tx.wait();
    console.log("Ditarik            :", EXPLORER + tx.hash);
  }
  console.log("FXRP di dompet     :", fmt(await fxrp.balanceOf(me.address)));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
