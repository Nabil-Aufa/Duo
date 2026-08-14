// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {FtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/FtsoV2Interface.sol";

/// @title FtsoPriceReader
/// @notice Membaca harga XRP/USD dari oracle FTSO milik Flare, dengan penolakan
///         terhadap data yang sudah basi.
///
/// @dev Alamat FtsoV2 diambil dari Flare Contract Registry, bukan di-hardcode,
///      supaya tetap benar kalau Flare memperbarui deployment-nya.
///
///      `getFeedById` bersifat `payable` dan bukan `view`, jadi fungsi di sini
///      juga tidak bisa `view`. Untuk feed standar seperti XRP/USD biayanya nol.
contract FtsoPriceReader {
    /// @notice Feed ID XRP/USD: 0x01 (kategori) + "XRP/USD" + padding sampai 21 byte.
    bytes21 public constant XRP_USD_FEED_ID =
        bytes21(0x015852502f55534400000000000000000000000000);

    /// @notice Umur maksimum data harga yang masih diterima, dalam detik.
    /// @dev Di Coston2 feed diperbarui tiap beberapa detik, jadi 300 detik sangat
    ///      longgar. Penjaga ini ada untuk kasus oracle berhenti, bukan untuk
    ///      menyaring fluktuasi normal.
    uint64 public constant MAX_PRICE_AGE = 300;

    /// @notice Batas kewajaran harga XRP/USD, dinormalkan ke 6 desimal.
    /// @dev Memeriksa umur data saja tidak cukup: oracle yang rusak bisa
    ///      mengembalikan angka segar tapi ngawur, dan pembagian ikut ngawur
    ///      tanpa ada yang menahan. Batasnya sengaja sangat longgar — ini
    ///      penjaga terhadap kerusakan, bukan terhadap pergerakan pasar.
    uint256 public constant MIN_XRP_USD = 0.01e6; // $0,01
    uint256 public constant MAX_XRP_USD = 100e6; // $100

    error StalePrice(uint64 priceTimestamp, uint64 nowTimestamp, uint64 maxAge);
    error InvalidPrice();
    error NegativeDecimals(int8 decimals);
    error PriceOutOfBounds(uint256 normalizedPrice, uint256 min, uint256 max);

    /// @notice Harga XRP/USD terkini.
    /// @return price    Nilai harga sebagai integer.
    /// @return decimals Jumlah desimal; harga sebenarnya = price / 10**decimals.
    function getXrpUsd() external returns (uint256 price, uint8 decimals) {
        FtsoV2Interface ftso = ContractRegistry.getFtsoV2();
        (uint256 value, int8 dec, uint64 timestamp) = ftso.getFeedById(XRP_USD_FEED_ID);

        if (value == 0) revert InvalidPrice();
        // Desimal negatif berarti harga berskala lebih besar dari 1 satuan —
        // tidak terjadi pada feed XRP/USD, dan matematika kita tidak menanganinya.
        if (dec < 0) revert NegativeDecimals(dec);

        uint64 nowTs = uint64(block.timestamp);
        if (nowTs > timestamp && nowTs - timestamp > MAX_PRICE_AGE) {
            revert StalePrice(timestamp, nowTs, MAX_PRICE_AGE);
        }

        decimals = uint8(int8(dec));

        uint256 normalized = decimals >= 6
            ? value / (10 ** (uint256(decimals) - 6))
            : value * (10 ** (6 - uint256(decimals)));
        if (normalized < MIN_XRP_USD || normalized > MAX_XRP_USD) {
            revert PriceOutOfBounds(normalized, MIN_XRP_USD, MAX_XRP_USD);
        }

        return (value, decimals);
    }
}
