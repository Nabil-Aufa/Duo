import { ethers, network } from "hardhat";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Deploy ulang tumpukan Duo setelah perbaikan keamanan, dan pindahkan
 * likuiditas dari venue swap lama.
 *
 * Ketiganya diperbarui: FtsoPriceReader dapat batas kewajaran harga,
 * FtsoPricedSwap memegang referensi permanen ke pembaca harga sehingga ikut
 * diganti, dan DuoVault mendapat perbaikan debu + masa tunggu penggantian venue.
 *
 *   npx hardhat run scripts/redeploy.coston2.ts --network coston2
 */

const FXRP = "0x0b6A3645c240605887a5532109323A3E12273dc7";
const USDT0 = "0xC1A5B41512496B80903D1f32d6dEa3a73212E71F";
const FIRELIGHT = "0xC90D6847747b85d1fa2E07859869fb9fB72c0361";
const SWAP_FEE_BPS = 30;
const EXPLORER = "https://coston2-explorer.flare.network";

const f = (v: bigint) => ethers.formatUnits(v, 6);

async function main() {
  if (network.name !== "coston2") throw new Error("hanya coston2");

  const previous = JSON.parse(readFileSync("deployments/coston2.json", "utf8"));
  const [me] = await ethers.getSigners();
  const fxrp = await ethers.getContractAt("IERC20", FXRP);
  const usdt0 = await ethers.getContractAt("IERC20", USDT0);

  // --- 1. Tarik likuiditas dari venue lama ---
  console.log("Menarik likuiditas dari venue swap lama...");
  const oldSwap = await ethers.getContractAt("FtsoPricedSwap", previous.contracts.FtsoPricedSwap);
  const oldUsdt0 = await usdt0.balanceOf(previous.contracts.FtsoPricedSwap);
  const oldFxrp = await fxrp.balanceOf(previous.contracts.FtsoPricedSwap);
  if (oldUsdt0 > 0n) await (await oldSwap.removeLiquidity(oldUsdt0, me.address)).wait();
  if (oldFxrp > 0n) await (await oldSwap.withdrawFxrp(oldFxrp, me.address)).wait();
  console.log("  ditarik:", f(oldUsdt0), "USDT0 +", f(oldFxrp), "FXRP");

  // --- 2. Deploy tumpukan baru ---
  const reader = await (await ethers.getContractFactory("FtsoPriceReader")).deploy();
  await reader.waitForDeployment();
  const readerAddr = await reader.getAddress();

  const swap = await (await ethers.getContractFactory("FtsoPricedSwap"))
    .deploy(FXRP, USDT0, readerAddr, SWAP_FEE_BPS, me.address);
  await swap.waitForDeployment();
  const swapAddr = await swap.getAddress();

  const vault = await (await ethers.getContractFactory("DuoVault"))
    .deploy(FXRP, USDT0, FIRELIGHT, readerAddr, swapAddr, me.address);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();

  console.log("\nFtsoPriceReader :", readerAddr);
  console.log("FtsoPricedSwap  :", swapAddr);
  console.log("DuoVault        :", vaultAddr);

  // --- 3. Isi venue baru ---
  const seed = await usdt0.balanceOf(me.address);
  if (seed > 0n) {
    await (await usdt0.approve(swapAddr, seed)).wait();
    await (await swap.addLiquidity(seed)).wait();
  }
  console.log("\nLikuiditas venue:", f(await swap.availableLiquidity()), "USDT0");
  console.log("FXRP di dompet  :", f(await fxrp.balanceOf(me.address)));

  // --- 4. Catat ---
  const out = {
    ...previous,
    deployedAt: new Date().toISOString(),
    contracts: { DuoVault: vaultAddr, FtsoPricedSwap: swapAddr, FtsoPriceReader: readerAddr },
    explorer: `${EXPLORER}/address/${vaultAddr}`,
    supersedes: {
      note: "Versi pertama, diganti setelah perbaikan keamanan (debu DoS, masa tunggu venue, batas harga oracle).",
      contracts: previous.contracts,
    },
  };
  writeFileSync("deployments/coston2.json", JSON.stringify(out, null, 2) + "\n");
  console.log("\nTersimpan. Explorer:", out.explorer);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
