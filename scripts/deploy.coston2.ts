import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

/**
 * Deploy tumpukan Duo ke Coston2 dan isi likuiditas venue swap.
 *
 * Alamat dari docs/05-fakta-teknis.md (hasil cek langsung ke rantai).
 */

const FXRP = "0x0b6A3645c240605887a5532109323A3E12273dc7";
const USDT0 = "0xC1A5B41512496B80903D1f32d6dEa3a73212E71F";
const FIRELIGHT = "0xC90D6847747b85d1fa2E07859869fb9fB72c0361";

const SWAP_FEE_BPS = 30; // 0,3%, setara tier umum di DEX sungguhan
const LIQUIDITY_USDT0 = ethers.parseUnits("8", 6);

async function main() {
  if (network.name !== "coston2") {
    throw new Error(`Skrip ini hanya untuk coston2, bukan "${network.name}"`);
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer :", deployer.address);
  console.log("Saldo    :", ethers.formatEther(balance), "C2FLR\n");

  // 1. Pembaca harga
  const reader = await (await ethers.getContractFactory("FtsoPriceReader")).deploy();
  await reader.waitForDeployment();
  const readerAddr = await reader.getAddress();
  console.log("FtsoPriceReader :", readerAddr);

  // 2. Venue swap (SparkDEX tidak ada di Coston2 — lihat docs/04-gap-dan-blocker.md B1)
  const swap = await (
    await ethers.getContractFactory("FtsoPricedSwap")
  ).deploy(FXRP, USDT0, readerAddr, SWAP_FEE_BPS, deployer.address);
  await swap.waitForDeployment();
  const swapAddr = await swap.getAddress();
  console.log("FtsoPricedSwap  :", swapAddr);

  // 3. Vault inti
  const vault = await (
    await ethers.getContractFactory("DuoVault")
  ).deploy(FXRP, USDT0, FIRELIGHT, readerAddr, swapAddr, deployer.address);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("DuoVault        :", vaultAddr);

  // 4. Isi likuiditas venue swap
  console.log("\nMengisi likuiditas venue swap...");
  const usdt0 = await ethers.getContractAt("IERC20", USDT0);
  await (await usdt0.approve(swapAddr, LIQUIDITY_USDT0)).wait();
  await (await swap.addLiquidity(LIQUIDITY_USDT0)).wait();
  console.log("Likuiditas      :", ethers.formatUnits(await swap.availableLiquidity(), 6), "USDT0");

  // 5. Catat alamatnya
  const out = {
    network: "coston2",
    chainId: 114,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      DuoVault: vaultAddr,
      FtsoPricedSwap: swapAddr,
      FtsoPriceReader: readerAddr,
    },
    external: { FXRP, USDT0, FirelightVault: FIRELIGHT },
    explorer: `https://coston2-explorer.flare.network/address/${vaultAddr}`,
  };
  if (!existsSync("deployments")) mkdirSync("deployments");
  writeFileSync("deployments/coston2.json", JSON.stringify(out, null, 2) + "\n");
  console.log("\nAlamat tersimpan di deployments/coston2.json");
  console.log("Explorer:", out.explorer);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
