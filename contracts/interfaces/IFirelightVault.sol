// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @title IFirelightVault
/// @notice Bagian dari vault Firelight yang dipakai Duo.
///
/// @dev Firelight adalah vault ERC-4626 untuk staking FXRP; menyetor FXRP
///      menghasilkan token tanda terima stXRP.
///
///      CATATAN PENTING soal penarikan: Firelight memakai logika berbasis periode,
///      bukan penarikan instan. `withdraw`/`redeem` membuat PERMINTAAN yang
///      terikat pada periode berjalan; asetnya baru bisa diambil setelah periode
///      itu berakhir, lewat klaim terpisah.
///
///      Jangan pernah menampilkan "tarik kapan saja" di UI. Yang akurat adalah
///      "paling lama satu periode".
interface IFirelightVault {
    // --- ERC-4626 ---
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function balanceOf(address account) external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256 assets);
    function convertToShares(uint256 assets) external view returns (uint256 shares);
    function previewDeposit(uint256 assets) external view returns (uint256 shares);
    function maxDeposit(address receiver) external view returns (uint256);
    function maxWithdraw(address owner) external view returns (uint256);

    /// @notice Mengambil aset dari permintaan penarikan yang periodenya sudah berakhir.
    /// @param period Periode saat permintaan penarikan dibuat.
    /// @dev Langkah ketiga dan terakhir: withdraw/redeem membuat permintaan dan
    ///      membakar share, periode berjalan harus berakhir dulu, baru aset bisa
    ///      diambil lewat fungsi ini.
    function claimWithdraw(uint256 period) external returns (uint256 assets);

    // --- Khusus Firelight: periode ---
    function currentPeriod() external view returns (uint256);
    function currentPeriodStart() external view returns (uint256);
    function currentPeriodEnd() external view returns (uint256);
    function nextPeriodEnd() external view returns (uint256);
    function withdrawalsOf(uint256 period, address account) external view returns (uint256);
}
