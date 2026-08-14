import { expect } from "chai";
import { ethers, network } from "hardhat";
import { impersonateAccount, setBalance, time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Tes untuk tiga perbaikan keamanan.
 *
 * Yang pertama paling penting: versi sebelumnya bisa dimatikan siapa pun dengan
 * mengirim satu unit token ke kontrak. Tes ini menjalankan serangan itu dan
 * memastikan produknya tetap hidup.
 */

const FXRP = "0xAd552A648C74D49E10027AB8a618A3ad4901c5bE";
const USDT0 = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D";
const FIRELIGHT = "0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3";
const WHALE = "0x88D46717b16619B37fa2DfD2F038DEFB4459F1F7";

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
];

const usd = (n: string) => ethers.parseUnits(n, 6);

describe("DuoVault — perbaikan keamanan", () => {
  let vault: any, swap: any, reader: any;
  let fxrp: any, stable: any, firelight: any;
  let owner: any, user: any, attacker: any;

  beforeEach(async function () {
    this.timeout(300_000);

    // Fork dikembalikan ke blok patokan sebelum tiap tes. Tanpa ini, tes
    // timelock yang memajukan waktu 2 hari membuat harga FTSO di blok fork
    // terhitung basi untuk tes sesudahnya — kegagalan yang menyesatkan karena
    // kontraknya sendiri baik-baik saja.
    await network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: process.env.MAINNET_RPC_URL ?? "https://flare-api.flare.network/ext/C/rpc",
          blockNumber: 67_240_000,
        },
      }],
    });
    await network.provider.send("evm_mine", []);
    [owner, user, attacker] = await ethers.getSigners();

    fxrp = new ethers.Contract(FXRP, ERC20, ethers.provider);
    stable = new ethers.Contract(USDT0, ERC20, ethers.provider);
    firelight = new ethers.Contract(FIRELIGHT, ERC20, ethers.provider);

    await impersonateAccount(WHALE);
    await setBalance(WHALE, ethers.parseEther("100"));
    const whale = await ethers.getSigner(WHALE);
    await (fxrp.connect(whale) as any).transfer(user.address, usd("300"));
    await (fxrp.connect(whale) as any).transfer(attacker.address, usd("1"));
    await (stable.connect(whale) as any).transfer(owner.address, usd("5000"));

    reader = await (await ethers.getContractFactory("FtsoPriceReader")).deploy();
    swap = await (await ethers.getContractFactory("FtsoPricedSwap"))
      .deploy(FXRP, USDT0, await reader.getAddress(), 30, owner.address);
    vault = await (await ethers.getContractFactory("DuoVault")).deploy(
      FXRP, USDT0, FIRELIGHT,
      await reader.getAddress(), await swap.getAddress(), owner.address,
    );

    await (stable.connect(owner) as any).approve(await swap.getAddress(), usd("5000"));
    await swap.connect(owner).addLiquidity(usd("5000"));
  });

  describe("1. Debu kiriman orang lain tidak boleh mematikan produk", () => {
    it("split() tetap jalan setelah penyerang mengirim debu ke kontrak", async function () {
      this.timeout(300_000);
      const vaultAddr = await vault.getAddress();

      // Serangan: kirim satu unit terkecil FXRP ke kontrak.
      // Di versi lama, ini membuat setiap split() gagal selamanya.
      await (fxrp.connect(attacker) as any).transfer(vaultAddr, 1n);
      expect(await fxrp.balanceOf(vaultAddr)).to.equal(1n);

      await vault.connect(user).setTarget(usd("100"));
      await (fxrp.connect(user) as any).approve(vaultAddr, usd("300"));

      // Harus tetap berhasil.
      await expect(vault.connect(user).split()).to.not.be.reverted;

      expect(await stable.balanceOf(user.address)).to.be.greaterThan(0n);
      expect(await firelight.balanceOf(user.address)).to.be.greaterThan(0n);

      // Debunya tetap di sana, tapi tidak mengganggu apa pun.
      expect(await fxrp.balanceOf(vaultAddr)).to.equal(1n);
    });

    it("tetap menolak kalau dana pengguna benar-benar tertinggal", async () => {
      // Jaminan aslinya harus tetap utuh: yang masuk transaksi ini wajib keluar.
      // Diuji lewat sisi baliknya — tidak ada jalur yang menambah saldo kontrak,
      // jadi setelah split() saldonya tidak boleh naik dari saldo awal.
      const vaultAddr = await vault.getAddress();
      await vault.connect(user).setTarget(usd("100"));
      await (fxrp.connect(user) as any).approve(vaultAddr, usd("300"));

      const before = await fxrp.balanceOf(vaultAddr);
      await vault.connect(user).split();
      expect(await fxrp.balanceOf(vaultAddr)).to.equal(before);
      expect(await stable.balanceOf(vaultAddr)).to.equal(0n);
      expect(await firelight.balanceOf(vaultAddr)).to.equal(0n);
    });
  });

  describe("2. Venue swap tidak bisa dibelokkan seketika", () => {
    it("mengajukan adapter tidak langsung mengubah apa pun", async () => {
      const current = await vault.swapAdapter();
      await vault.connect(owner).proposeSwapAdapter(attacker.address);
      expect(await vault.swapAdapter()).to.equal(current);
      expect(await vault.pendingSwapAdapter()).to.equal(attacker.address);
    });

    it("menolak diberlakukan sebelum masa tunggu habis", async () => {
      await vault.connect(owner).proposeSwapAdapter(attacker.address);
      await expect(vault.applySwapAdapter()).to.be.revertedWithCustomError(
        vault, "TimelockNotElapsed",
      );
    });

    it("berlaku setelah 2 hari", async () => {
      await vault.connect(owner).proposeSwapAdapter(attacker.address);
      await time.increase(2 * 24 * 60 * 60 + 1);
      await vault.applySwapAdapter();
      expect(await vault.swapAdapter()).to.equal(attacker.address);
    });

    it("pengajuan bisa dibatalkan sebelum berlaku", async () => {
      await vault.connect(owner).proposeSwapAdapter(attacker.address);
      await vault.connect(owner).cancelSwapAdapterProposal();
      await time.increase(3 * 24 * 60 * 60);
      await expect(vault.applySwapAdapter()).to.be.revertedWithCustomError(
        vault, "NoPendingAdapter",
      );
    });

    it("bukan pemilik tidak bisa mengajukan", async () => {
      await expect(
        vault.connect(attacker).proposeSwapAdapter(attacker.address),
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("toleransi slippage dibatasi 5%", async () => {
      await expect(vault.connect(owner).setSlippageToleranceBps(501)).to.be.reverted;
      await vault.connect(owner).setSlippageToleranceBps(500);
      expect(await vault.slippageToleranceBps()).to.equal(500n);
    });
  });

  describe("3. Harga oracle diperiksa kewajarannya", () => {
    it("harga hidup dari FTSO berada dalam batas wajar", async () => {
      const [price, decimals] = await reader.getXrpUsd.staticCall();
      const normalized = Number(price) / 10 ** Number(decimals);
      expect(normalized).to.be.greaterThan(0.01);
      expect(normalized).to.be.lessThan(100);
    });

    it("batasnya memang dipasang di kontrak", async () => {
      expect(await reader.MIN_XRP_USD()).to.equal(usd("0.01"));
      expect(await reader.MAX_XRP_USD()).to.equal(usd("100"));
    });
  });
});
