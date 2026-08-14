import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";

/**
 * Mengirim FXRP ke personal account milik alamat XRPL kita.
 *
 * Personal account adalah kontrak dompet biasa, jadi FXRP cukup ditransfer ke
 * sana lewat ERC-20 transfer — tidak perlu alur minting FAssets yang berlangkah
 * banyak. Untuk demo, dari mana FXRP-nya berasal tidak mengubah apa yang mau
 * dibuktikan: bahwa satu pembayaran XRPL bisa menjalankan aturan di Flare.
 *
 *   npx hardhat run scripts/fundPersonalAccount.ts --network coston2
 */

const d = JSON.parse(readFileSync("deployments/coston2.json", "utf8"));
const MAC = "0x434936d47503353f06750Db1A444DBDC5F0AD37c";
const EXPLORER = "https://coston2-explorer.flare.network/tx/";
const fmt = (v: bigint) => ethers.formatUnits(v, 6);

async function main() {
  if (network.name !== "coston2") throw new Error("hanya untuk coston2");

  const amount = ethers.parseUnits(process.env.FUND_FXRP ?? "3", 6);
  const xrplAddress = process.env.XRPL_ACCOUNT_ADDRESS!;

  const [signer] = await ethers.getSigners();
  const mac = new ethers.Contract(
    MAC,
    ["function getPersonalAccount(string) view returns (address)"],
    ethers.provider,
  );
  const pa: string = await mac.getPersonalAccount(xrplAddress);
  const fxrp = await ethers.getContractAt("IERC20", d.external.FXRP);

  console.log("Alamat XRPL      :", xrplAddress);
  console.log("Personal account :", pa);
  console.log("Saldo EOA        :", fmt(await fxrp.balanceOf(signer.address)), "FXRP");
  console.log("Saldo PA sebelum :", fmt(await fxrp.balanceOf(pa)), "FXRP");

  const tx = await fxrp.transfer(pa, amount);
  await tx.wait();
  console.log("\nMengirim", fmt(amount), "FXRP ->", EXPLORER + tx.hash);
  console.log("Saldo PA sesudah :", fmt(await fxrp.balanceOf(pa)), "FXRP");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
