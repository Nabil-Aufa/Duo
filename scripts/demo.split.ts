import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";

/**
 * Menjalankan pembagian sungguhan di Coston2 dan mencetak setiap hash transaksi.
 *
 * Pakai:
 *   npx hardhat run scripts/demo.split.ts --network coston2
 *
 * Atur lewat env:
 *   TARGET_USD  target kebutuhan dalam USD   (bawaan: 3)
 *   AMOUNT_FXRP jumlah FXRP yang dibelah     (bawaan: 5)
 */

const d = JSON.parse(readFileSync("deployments/coston2.json", "utf8"));
const EXPLORER = "https://coston2-explorer.flare.network/tx/";

const fmt = (v: bigint) => ethers.formatUnits(v, 6);

async function main() {
  if (network.name !== "coston2") throw new Error("hanya untuk coston2");

  const targetUsd = ethers.parseUnits(process.env.TARGET_USD ?? "3", 6);
  const amountFxrp = ethers.parseUnits(process.env.AMOUNT_FXRP ?? "5", 6);

  const [user] = await ethers.getSigners();
  const vault = await ethers.getContractAt("DuoVault", d.contracts.DuoVault);
  const fxrp = await ethers.getContractAt("IERC20", d.external.FXRP);
  const stable = await ethers.getContractAt("IERC20", d.external.USDT0);
  const firelight = await ethers.getContractAt("IFirelightVault", d.external.FirelightVault);

  const reader = await ethers.getContractAt("FtsoPriceReader", d.contracts.FtsoPriceReader);
  const [price, decimals] = await reader.getXrpUsd.staticCall();
  const priceHuman = Number(price) / 10 ** Number(decimals);

  console.log("=".repeat(58));
  console.log("Pengguna    :", user.address);
  console.log("Harga XRP   : $" + priceHuman.toFixed(6), "(hidup dari FTSO)");
  console.log("Target      : $" + fmt(targetUsd));
  console.log("Dibelah     :", fmt(amountFxrp), "FXRP  (≈ $" + (Number(fmt(amountFxrp)) * priceHuman).toFixed(2) + ")");
  console.log("=".repeat(58));

  const before = {
    fxrp: await fxrp.balanceOf(user.address),
    stable: await stable.balanceOf(user.address),
    shares: await firelight.balanceOf(user.address),
  };
  console.log("\nSEBELUM");
  console.log("  FXRP  :", fmt(before.fxrp));
  console.log("  USDT0 :", fmt(before.stable));
  console.log("  stXRP :", fmt(before.shares));

  if (before.fxrp < amountFxrp) throw new Error("FXRP tidak cukup");

  console.log("\n1/3 menetapkan target...");
  const tx1 = await vault.setTarget(targetUsd);
  await tx1.wait();
  console.log("    ", EXPLORER + tx1.hash);

  // split() memproses sebesar allowance, jadi allowance-lah yang menentukan
  // berapa banyak yang dibelah kali ini.
  console.log("2/3 menyetujui FXRP...");
  const tx2 = await fxrp.approve(d.contracts.DuoVault, amountFxrp);
  await tx2.wait();
  console.log("    ", EXPLORER + tx2.hash);

  console.log("3/3 membelah...");
  const tx3 = await vault.split();
  const receipt = await tx3.wait();
  console.log("    ", EXPLORER + tx3.hash);

  const after = {
    fxrp: await fxrp.balanceOf(user.address),
    stable: await stable.balanceOf(user.address),
    shares: await firelight.balanceOf(user.address),
  };

  console.log("\nSESUDAH");
  console.log("  FXRP  :", fmt(after.fxrp), `(${fmt(after.fxrp - before.fxrp)})`);
  console.log("  USDT0 :", fmt(after.stable), `(+${fmt(after.stable - before.stable)})  <- porsi aman`);
  console.log("  stXRP :", fmt(after.shares), `(+${fmt(after.shares - before.shares)})  <- tabungan`);

  const ev = receipt!.logs
    .map((l: any) => { try { return vault.interface.parseLog(l); } catch { return null; } })
    .find((e: any) => e?.name === "Split");
  if (ev) {
    console.log("\nEvent Split");
    console.log("  masuk      :", fmt(ev.args.amountIn), "FXRP");
    console.log("  ke stabil  :", fmt(ev.args.toStable), "FXRP");
    console.log("  ke tabungan:", fmt(ev.args.toSavings), "FXRP");
    console.log("  harga      : $" + (Number(ev.args.priceUsed) / 10 ** Number(decimals)).toFixed(6));
  }

  // Janji non-kustodial, diperiksa di rantai sungguhan.
  const residual = {
    fxrp: await fxrp.balanceOf(d.contracts.DuoVault),
    stable: await stable.balanceOf(d.contracts.DuoVault),
    shares: await firelight.balanceOf(d.contracts.DuoVault),
  };
  const clean = residual.fxrp === 0n && residual.stable === 0n && residual.shares === 0n;
  console.log("\nSisa di DuoVault:", clean ? "NOL — non-kustodial terbukti" : JSON.stringify(residual));

  console.log("\nGas terpakai:", receipt!.gasUsed.toString());
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
