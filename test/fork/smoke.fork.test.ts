import { expect } from "chai";
import { ethers, network } from "hardhat";

/**
 * Tes asap untuk fork Flare Mainnet.
 *
 * Tes ini MEMBACA kondisi Flare Mainnet yang sungguhan — token, kolam likuiditas,
 * vault — tapi semuanya berjalan di memori komputer ini. Tidak ada transaksi yang
 * disiarkan ke mainnet, tidak ada gas yang dibayar, tidak ada dompet yang terlibat.
 *
 * Kalau tes ini lulus, artinya kita bisa menguji kode terhadap protokol asli
 * tanpa mengeluarkan uang sepeser pun.
 *
 * Alamat diambil dari docs/05-fakta-teknis.md (hasil cek langsung ke rantai).
 */

const FXRP = "0xAd552A648C74D49E10027AB8a618A3ad4901c5bE";
const USDT0 = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D";
const SPARKDEX_POOL_FEE500 = "0x88D46717b16619B37fa2DfD2F038DEFB4459F1F7";
const FIRELIGHT_STXRP = "0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3";

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
const VAULT_ABI = [
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

describe("Fork Flare Mainnet — tes asap", () => {
  // Menambang satu blok lokal di atas blok fork. Tanpa ini, setiap pemanggilan
  // dianggap "blok historis" dan EDR menolak karena tidak punya riwayat hardfork
  // untuk Flare (chainId 14). Setelah satu blok ditambang, pemanggilan berjalan
  // di blok lokal yang memakai hardfork bawaan jaringan Hardhat.
  before(async () => {
    await network.provider.send("evm_mine", []);
  });

  it("berjalan di jaringan lokal, bukan mainnet", async () => {
    // chainId 31337 membuktikan kita di simpul lokal Hardhat.
    // Kalau ini 14, kita benar-benar di mainnet dan harus berhenti.
    const { chainId } = await ethers.provider.getNetwork();
    expect(chainId).to.equal(31337n);
    expect(network.name).to.equal("hardhat");
  });

  it("membaca kondisi FXRP mainnet yang sungguhan", async () => {
    const fxrp = new ethers.Contract(FXRP, ERC20_ABI, ethers.provider);
    const [symbol, decimals, supply] = await Promise.all([
      fxrp.symbol(),
      fxrp.decimals(),
      fxrp.totalSupply(),
    ]);

    expect(symbol).to.equal("FXRP");
    expect(decimals).to.equal(6n);
    // Saat verifikasi ada ~148,8 juta FXRP beredar. Ambang dibuat longgar
    // supaya tes tidak rapuh terhadap perubahan pasokan.
    expect(supply).to.be.greaterThan(1_000_000n * 10n ** 6n);

    console.log(`      FXRP beredar: ${ethers.formatUnits(supply, 6)}`);
  });

  it("melihat likuiditas sungguhan di kolam SparkDEX FXRP/USDT0", async () => {
    const fxrp = new ethers.Contract(FXRP, ERC20_ABI, ethers.provider);
    const usdt0 = new ethers.Contract(USDT0, ERC20_ABI, ethers.provider);

    const [fxrpInPool, usdt0InPool] = await Promise.all([
      fxrp.balanceOf(SPARKDEX_POOL_FEE500),
      usdt0.balanceOf(SPARKDEX_POOL_FEE500),
    ]);

    // Inilah alasan fork itu berharga: adapter SparkDEX bisa diuji terhadap
    // likuiditas sungguhan, padahal SparkDEX tidak ada di Coston2.
    expect(fxrpInPool).to.be.greaterThan(1_000n * 10n ** 6n);
    expect(usdt0InPool).to.be.greaterThan(1_000n * 10n ** 6n);

    console.log(
      `      Kolam: ${ethers.formatUnits(fxrpInPool, 6)} FXRP / ` +
        `${ethers.formatUnits(usdt0InPool, 6)} USDT0`,
    );
  });

  it("membaca vault Firelight mainnet dan kurs sebenarnya", async () => {
    const vault = new ethers.Contract(FIRELIGHT_STXRP, VAULT_ABI, ethers.provider);
    const [asset, totalAssets, totalSupply] = await Promise.all([
      vault.asset(),
      vault.totalAssets(),
      vault.totalSupply(),
    ]);

    expect(asset.toLowerCase()).to.equal(FXRP.toLowerCase());
    expect(totalAssets).to.be.greaterThan(0n);

    // Kurs nyata di mainnet — inilah angka yang boleh ditampilkan di dashboard
    // sebagai rujukan. JANGAN pernah mengarang APY.
    const rate = Number(totalAssets) / Number(totalSupply);
    expect(rate).to.be.greaterThanOrEqual(1);

    console.log(
      `      Firelight: ${ethers.formatUnits(totalAssets, 6)} FXRP tersimpan, ` +
        `kurs 1 stXRP = ${rate.toFixed(8)} FXRP`,
    );
  });
});
