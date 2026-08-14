// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @title SplitMath
/// @notice Menghitung pembagian pembayaran masuk berdasarkan target kebutuhan
///         dalam USD — bukan berdasarkan persentase.
///
/// @dev Kenapa target USD dan bukan persentase: kebutuhan hidup seseorang itu
///      angka tetap ("saya butuh $200 sebulan"), bukan proporsi dari berapa pun
///      yang kebetulan masuk. Persentase tetap salah di dua ujung — terlalu pelit
///      saat bayaran kecil, terlalu boros saat bayaran besar.
///
///      Konsekuensinya, pembagian ini MUSTAHIL tanpa harga: kita harus tahu
///      berapa FXRP yang setara $200. Di situlah oracle FTSO menanggung beban
///      nyata, bukan sekadar hiasan.
library SplitMath {
    error ZeroAmount();
    error InvalidPrice();

    /// @notice Membelah `amountFxrp` jadi porsi aman (stablecoin) dan porsi tabungan.
    /// @param amountFxrp    Jumlah FXRP yang masuk (6 desimal).
    /// @param targetUsd     Target kebutuhan pengguna dalam USD (6 desimal).
    /// @param price         Harga XRP/USD dari FTSO.
    /// @param priceDecimals Jumlah desimal harga tersebut.
    /// @return toStable  Porsi yang ditukar jadi stablecoin.
    /// @return toSavings Porsi yang disetor ke vault tabungan.
    ///
    /// @dev Invariant: `toStable + toSavings == amountFxrp`, selalu, tanpa sisa
    ///      pembulatan. Dijamin secara konstruksi karena `toSavings` dihitung
    ///      sebagai selisih, bukan lewat perkalian terpisah.
    function computeSplit(
        uint256 amountFxrp,
        uint256 targetUsd,
        uint256 price,
        uint8 priceDecimals
    ) internal pure returns (uint256 toStable, uint256 toSavings) {
        if (amountFxrp == 0) revert ZeroAmount();
        if (price == 0) revert InvalidPrice();

        // Berapa FXRP yang nilainya setara `targetUsd`?
        //   fxrpNeeded = targetUsd / hargaPerXrp
        // Keduanya 6 desimal, jadi skala harga dinaikkan lebih dulu agar
        // pembagian integer tidak kehilangan presisi.
        uint256 fxrpNeeded = (targetUsd * (10 ** uint256(priceDecimals))) / price;

        // Kalau yang masuk belum menutupi kebutuhan, amankan semuanya —
        // jangan memaksa menabung saat pengguna justru sedang kekurangan.
        toStable = amountFxrp <= fxrpNeeded ? amountFxrp : fxrpNeeded;
        toSavings = amountFxrp - toStable;
    }

    /// @notice Nilai USD dari sejumlah FXRP, pada harga yang diberikan.
    /// @dev Dipakai untuk menghitung batas minimum hasil swap (proteksi slippage).
    function toUsd(
        uint256 amountFxrp,
        uint256 price,
        uint8 priceDecimals
    ) internal pure returns (uint256 usdValue) {
        if (price == 0) revert InvalidPrice();
        usdValue = (amountFxrp * price) / (10 ** uint256(priceDecimals));
    }
}
