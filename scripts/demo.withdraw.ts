import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";

/**
 * Langkah 1 penarikan: mengajukan permintaan.
 *
 * Firelight memakai logika berbasis periode. Menebus share TIDAK langsung
 * memberi aset — share dibakar sekarang, permintaan tercatat pada periode
 * berjalan, dan asetnya baru bisa diambil lewat claimWithdraw() setelah
 * periode itu berakhir.
 *
 * Inilah kenapa dashboard harus menulis "paling lama satu periode", bukan
 * "tarik kapan saja".
 *
 *   npx hardhat run scripts/demo.withdraw.ts --network coston2
 */

const d = JSON.parse(readFileSync("deployments/coston2.json", "utf8"));
const EXPLORER = "https://coston2-explorer.flare.network/tx/";
const fmt = (v: bigint) => ethers.formatUnits(v, 6);

async function main() {
  if (network.name !== "coston2") throw new Error("hanya untuk coston2");

  const [user] = await ethers.getSigners();
  const firelight = await ethers.getContractAt("IFirelightVault", d.external.FirelightVault);
  const fxrp = await ethers.getContractAt("IERC20", d.external.FXRP);

  const shares = await firelight.balanceOf(user.address);
  if (shares === 0n) throw new Error("tidak ada stXRP untuk ditarik");

  const period = await firelight.currentPeriod();
  const periodEnd = await firelight.currentPeriodEnd();
  const assetsValue = await firelight.convertToAssets(shares);

  console.log("Pengguna       :", user.address);
  console.log("stXRP dimiliki :", fmt(shares), `(senilai ${fmt(assetsValue)} FXRP)`);
  console.log("FXRP sekarang  :", fmt(await fxrp.balanceOf(user.address)));
  console.log("Periode        :", period.toString());
  console.log("Berakhir       :", new Date(Number(periodEnd) * 1000).toISOString().replace("T", " ").slice(0, 19), "UTC");

  console.log("\nMengajukan penarikan seluruh stXRP...");
  const tx = await firelight.redeem(shares, user.address, user.address);
  const receipt = await tx.wait();
  console.log("  ", EXPLORER + tx.hash);

  const pending = await firelight.withdrawalsOf(period, user.address);
  console.log("\nPermintaan tercatat di periode", period.toString(), ":", fmt(pending), "FXRP");
  console.log("stXRP tersisa  :", fmt(await firelight.balanceOf(user.address)), "(share sudah dibakar)");

  const waitMin = Math.ceil((Number(periodEnd) - Math.floor(Date.now() / 1000)) / 60);
  console.log(`\nBisa diklaim dalam ~${waitMin} menit, lewat:`);
  console.log("  npx hardhat run scripts/demo.claim.ts --network coston2");
  console.log("\nGas terpakai:", receipt!.gasUsed.toString());
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
