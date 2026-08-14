import { expect } from "chai";
import { ethers } from "hardhat";
import type { SplitMathHarness } from "../typechain-types";

/**
 * Aturan pembagian Duo: "amankan $X pertama jadi stablecoin, sisanya tabung".
 *
 * Kasus-kasus di bawah ini adalah kontrak perilaku produknya. Kalau salah satu
 * gagal, yang rusak bukan matematikanya — yang rusak janji produknya.
 */

const FXRP = (n: string) => ethers.parseUnits(n, 6);
const USD = (n: string) => ethers.parseUnits(n, 6);

// Harga XRP/USD seperti yang dilaporkan FTSO Coston2 saat verifikasi.
const PRICE = 1_035_024n;
const PRICE_DECIMALS = 6;

describe("SplitMath — aturan target USD", () => {
  let harness: SplitMathHarness;

  before(async () => {
    harness = await (await ethers.getContractFactory("SplitMathHarness")).deploy();
  });

  it("mengamankan SEMUANYA kalau pembayaran belum menutupi kebutuhan", async () => {
    // Pengguna butuh $200; masuk hanya ~$103. Memaksa menabung saat orangnya
    // sedang kekurangan adalah kegagalan produk, bukan sekadar kesalahan angka.
    const [toStable, toSavings] = await harness.computeSplit(
      FXRP("100"), USD("200"), PRICE, PRICE_DECIMALS,
    );
    expect(toStable).to.equal(FXRP("100"));
    expect(toSavings).to.equal(0n);
  });

  it("menabung kelebihannya saat pembayaran melampaui kebutuhan", async () => {
    // 300 FXRP ≈ $310,5. Setelah mengamankan $200, sisanya ditabung.
    const [toStable, toSavings] = await harness.computeSplit(
      FXRP("300"), USD("200"), PRICE, PRICE_DECIMALS,
    );

    // $200 pada harga 1,035024 ≈ 193,235 FXRP
    expect(toStable).to.be.closeTo(FXRP("193.235"), FXRP("0.01"));
    expect(toStable + toSavings).to.equal(FXRP("300"));

    // Yang diamankan nilainya harus benar-benar sekitar $200.
    const usdSecured = await harness.toUsd(toStable, PRICE, PRICE_DECIMALS);
    expect(usdSecured).to.be.closeTo(USD("200"), USD("0.01"));
  });

  it("menabung porsi jauh lebih besar saat bayaran besar — inilah kenapa persentase salah", async () => {
    // Dengan aturan 60/40, bayaran $1.035 akan menyisakan $621 menganggur
    // sebagai stablecoin. Dengan target kebutuhan, yang diamankan tetap $200
    // dan sisanya bekerja.
    const [toStable, toSavings] = await harness.computeSplit(
      FXRP("1000"), USD("200"), PRICE, PRICE_DECIMALS,
    );

    const usdSecured = await harness.toUsd(toStable, PRICE, PRICE_DECIMALS);
    expect(usdSecured).to.be.closeTo(USD("200"), USD("0.01"));
    expect(toSavings).to.be.greaterThan(toStable * 3n); // sebagian besar ditabung
    expect(toStable + toSavings).to.equal(FXRP("1000"));
  });

  it("menabung semuanya kalau target nol", async () => {
    const [toStable, toSavings] = await harness.computeSplit(
      FXRP("100"), 0n, PRICE, PRICE_DECIMALS,
    );
    expect(toStable).to.equal(0n);
    expect(toSavings).to.equal(FXRP("100"));
  });

  it("tepat di batas: seluruhnya diamankan, tidak ada sisa ke tabungan", async () => {
    const exact = (USD("200") * 10n ** BigInt(PRICE_DECIMALS)) / PRICE;
    const [toStable, toSavings] = await harness.computeSplit(
      exact, USD("200"), PRICE, PRICE_DECIMALS,
    );
    expect(toStable).to.equal(exact);
    expect(toSavings).to.equal(0n);
  });

  it("menolak jumlah nol", async () => {
    await expect(
      harness.computeSplit(0n, USD("200"), PRICE, PRICE_DECIMALS),
    ).to.be.revertedWithCustomError(harness, "ZeroAmount");
  });

  it("menolak harga nol — lebih baik gagal daripada membelah asal-asalan", async () => {
    await expect(
      harness.computeSplit(FXRP("100"), USD("200"), 0n, PRICE_DECIMALS),
    ).to.be.revertedWithCustomError(harness, "InvalidPrice");
  });

  it("tidak pernah kehilangan satu unit pun karena pembulatan", async () => {
    // Invariant terpenting: apa pun masukannya, jumlah kedua bagian harus sama
    // persis dengan yang masuk. Satu unit yang menguap adalah dana pengguna
    // yang hilang.
    const amounts = [1n, 2n, 999_999n, FXRP("0.000001"), FXRP("7.777777"), FXRP("123456.654321")];
    const targets = [0n, USD("0.000001"), USD("1"), USD("200"), USD("999999")];
    const prices = [1n, 500_000n, PRICE, 9_999_999n];

    for (const amount of amounts) {
      for (const target of targets) {
        for (const price of prices) {
          const [a, b] = await harness.computeSplit(amount, target, price, PRICE_DECIMALS);
          expect(a + b, `amount=${amount} target=${target} price=${price}`).to.equal(amount);
        }
      }
    }
  });
});
