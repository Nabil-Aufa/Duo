// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @title ISwapAdapter
/// @notice Antarmuka tempat penukaran FXRP → stablecoin.
///
/// @dev Abstraksi ini ada karena SparkDEX tidak punya deployment di Coston2.
///      Di testnet kita memakai `FtsoPricedSwap` (harga dari oracle Flare);
///      di mainnet `SparkDexAdapter` tinggal dipasang tanpa mengubah DuoVault
///      sama sekali.
interface ISwapAdapter {
    error SlippageExceeded(uint256 amountOut, uint256 minOut);
    error InsufficientLiquidity(uint256 requested, uint256 available);

    /// @notice Menukar FXRP jadi stablecoin dan mengirim hasilnya ke `recipient`.
    /// @dev Pemanggil harus sudah memberi allowance FXRP ke adapter ini.
    /// @param amountIn  Jumlah FXRP yang ditukar.
    /// @param minOut    Hasil minimum yang diterima; kurang dari ini harus revert.
    /// @param recipient Penerima stablecoin.
    /// @return amountOut Jumlah stablecoin yang benar-benar dikirim.
    function swapFxrpForStable(
        uint256 amountIn,
        uint256 minOut,
        address recipient
    ) external returns (uint256 amountOut);

    /// @notice Token yang masuk (FXRP).
    function tokenIn() external view returns (address);

    /// @notice Token yang keluar (stablecoin).
    function tokenOut() external view returns (address);

    /// @notice Stablecoin yang tersedia untuk ditukar saat ini.
    function availableLiquidity() external view returns (uint256);
}
