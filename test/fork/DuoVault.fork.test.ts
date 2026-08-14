import { expect } from "chai";
import { ethers, network } from "hardhat";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Alur DuoVault utuh, diuji terhadap protokol Flare Mainnet yang SUNGGUHAN:
 * token FXRP asli, vault Firelight asli (58 juta FXRP di dalamnya), dan oracle
 * FTSO produksi.
 *
 * Semuanya berjalan di fork lokal — tidak ada transaksi yang disiarkan ke
 * mainnet, tidak ada gas dibayar. Ini cara membuktikan kontraknya bekerja
 * dengan protokol asli tanpa mengeluarkan uang, dan tanpa menunggu faucet.
 *
 * Alamat dari docs/05-fakta-teknis.md.
 */

const FXRP = "0xAd552A648C74D49E10027AB8a618A3ad4901c5bE";
const USDT0 = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D";
const FIRELIGHT = "0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3";

// Kolam SparkDEX FXRP/USDT0 — dipakai sebagai sumber token di fork karena
// memegang keduanya dalam jumlah besar.
const WHALE = "0x88D46717b16619B37fa2DfD2F038DEFB4459F1F7";

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
];

const usd = (n: string) => ethers.parseUnits(n, 6);
const fmt = (v: bigint) => ethers.formatUnits(v, 6);

describe("DuoVault — alur penuh terhadap protokol mainnet asli (fork)", () => {
  let vault: any, swap: any, reader: any;
  let fxrp: any, stable: any, firelight: any;
  let user: any, owner: any;

  before(async function () {
    this.timeout(300_000);
    await network.provider.send("evm_mine", []);

    [owner, user] = await ethers.getSigners();

    fxrp = new ethers.Contract(FXRP, ERC20, ethers.provider);
    stable = new ethers.Contract(USDT0, ERC20, ethers.provider);
    firelight = new ethers.Contract(
      FIRELIGHT,
      [...ERC20, "function convertToAssets(uint256) view returns (uint256)"],
      ethers.provider,
    );

    // Ambil token dari kolam SparkDEX dengan menyamar sebagai kolam itu.
    // Hanya mungkin di fork; di jaringan asli ini mustahil.
    await impersonateAccount(WHALE);
    await setBalance(WHALE, ethers.parseEther("100"));
    const whale = await ethers.getSigner(WHALE);

    await (fxrp.connect(whale) as any).transfer(user.address, usd("500"));
    await (stable.connect(whale) as any).transfer(owner.address, usd("5000"));

    // Deploy tumpukan Duo.
    reader = await (await ethers.getContractFactory("FtsoPriceReader")).deploy();
    swap = await (
      await ethers.getContractFactory("FtsoPricedSwap")
    ).deploy(FXRP, USDT0, await reader.getAddress(), 30, owner.address); // biaya 0,3%
    vault = await (
      await ethers.getContractFactory("DuoVault")
    ).deploy(
      FXRP, USDT0, FIRELIGHT,
      await reader.getAddress(),
      await swap.getAddress(),
      owner.address,
    );

    // Isi likuiditas venue swap.
    await (stable.connect(owner) as any).approve(await swap.getAddress(), usd("5000"));
    await swap.connect(owner).addLiquidity(usd("5000"));
  });

  it("membaca harga XRP/USD hidup dari oracle FTSO produksi", async () => {
    const [price, decimals] = await reader.getXrpUsd.staticCall();
    const human = Number(price) / 10 ** Number(decimals);
    expect(human).to.be.greaterThan(0.1);
    expect(human).to.be.lessThan(100);
    console.log(`      XRP/USD dari FTSO = $${human.toFixed(6)}`);
  });

  it("mengamankan target lalu menabung sisanya, memakai Firelight sungguhan", async function () {
    this.timeout(300_000);

    await vault.connect(user).setTarget(usd("200"));
    expect(await vault.targetOf(user.address)).to.equal(usd("200"));

    const before = {
      fxrp: await fxrp.balanceOf(user.address),
      stable: await stable.balanceOf(user.address),
      shares: await firelight.balanceOf(user.address),
    };
    expect(before.fxrp).to.equal(usd("500"));

    await (fxrp.connect(user) as any).approve(await vault.getAddress(), before.fxrp);
    const tx = await vault.connect(user).split();
    const receipt = await tx.wait();

    const after = {
      fxrp: await fxrp.balanceOf(user.address),
      stable: await stable.balanceOf(user.address),
      shares: await firelight.balanceOf(user.address),
    };

    // Seluruh FXRP terpakai.
    expect(after.fxrp).to.equal(0n);

    // Porsi aman bernilai sekitar $200 — dikurangi biaya venue 0,3%.
    const stableGained = after.stable - before.stable;
    expect(stableGained).to.be.closeTo(usd("199.4"), usd("1"));

    // Sisanya benar-benar masuk Firelight sebagai stXRP.
    const sharesGained = after.shares - before.shares;
    expect(sharesGained).to.be.greaterThan(0n);
    const savedValue = await firelight.convertToAssets(sharesGained);

    console.log(`      Masuk        : 500 FXRP`);
    console.log(`      Diamankan    : ${fmt(stableGained)} USDT0`);
    console.log(`      Ditabung     : ${fmt(sharesGained)} stXRP (= ${fmt(savedValue)} FXRP)`);
    console.log(`      Gas terpakai : ${receipt!.gasUsed}`);

    const ev = receipt!.logs
      .map((l: any) => { try { return vault.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "Split");
    expect(ev).to.not.be.undefined;
    expect(ev!.args.amountIn).to.equal(usd("500"));
    expect(ev!.args.toStable + ev!.args.toSavings).to.equal(usd("500"));
  });

  it("tidak menahan dana pengguna sepeser pun — janji non-kustodial", async () => {
    const addr = await vault.getAddress();
    expect(await fxrp.balanceOf(addr), "sisa FXRP").to.equal(0n);
    expect(await stable.balanceOf(addr), "sisa USDT0").to.equal(0n);
    expect(await firelight.balanceOf(addr), "sisa stXRP").to.equal(0n);
  });

  it("mengamankan seluruhnya kalau pembayaran belum menutupi kebutuhan", async function () {
    this.timeout(300_000);

    await impersonateAccount(WHALE);
    const whale = await ethers.getSigner(WHALE);
    await (fxrp.connect(whale) as any).transfer(user.address, usd("50"));

    const stableBefore = await stable.balanceOf(user.address);
    const sharesBefore = await firelight.balanceOf(user.address);

    await (fxrp.connect(user) as any).approve(await vault.getAddress(), usd("50"));
    await vault.connect(user).split();

    // 50 FXRP ≈ $52, di bawah target $200 → semuanya diamankan, tidak ada yang ditabung.
    expect(await stable.balanceOf(user.address)).to.be.greaterThan(stableBefore);
    expect(await firelight.balanceOf(user.address)).to.equal(sharesBefore);
  });

  it("menolak split saat tidak ada FXRP", async () => {
    await expect(vault.connect(user).split()).to.be.revertedWithCustomError(
      vault, "NothingToSplit",
    );
  });
});
