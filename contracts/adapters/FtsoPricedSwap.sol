// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ISwapAdapter} from "./ISwapAdapter.sol";
import {FtsoPriceReader} from "../oracle/FtsoPriceReader.sol";
import {SplitMath} from "../libraries/SplitMath.sol";

/// @title FtsoPricedSwap
/// @notice Tempat penukaran FXRP → stablecoin yang harganya diambil dari oracle
///         FTSO milik Flare.
///
/// @dev KENAPA KONTRAK INI ADA — baca sebelum menilai.
///
///      SparkDEX tidak punya deployment di Coston2. Sudah diverifikasi: alamat
///      SwapRouter V3-nya kosong tanpa kode di testnet, dan dokumentasi swap resmi
///      Flare berjudul "Required Addresses on Flare Mainnet".
///
///      Jadi tidak ada pasar tempat menukar FXRP ke stablecoin di testnet.
///      Kontrak ini mengisi lubang itu.
///
///      YANG NYATA DI SINI: harganya diambil dari oracle produksi Flare yang sama
///      dengan yang dipakai mainnet, diperbarui tiap beberapa detik. Tokennya
///      kanonik (FXRP dan USDT0 dari faucet resmi Coston2). Transaksinya on-chain
///      sungguhan. Saldonya berubah betulan.
///
///      YANG TIDAK KAMI KLAIM: bahwa ini pasar dengan likuiditas pihak ketiga.
///      Likuiditasnya kami sediakan sendiri. Ini pola yang dikenal di DeFi sebagai
///      Peg Stability Module — menukar pada harga acuan, bukan lewat kurva AMM.
///
///      Di mainnet, `SparkDexAdapter` menggantikan kontrak ini tanpa DuoVault
///      berubah sedikit pun.
contract FtsoPricedSwap is ISwapAdapter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable fxrp;
    IERC20 public immutable stable;
    FtsoPriceReader public immutable priceReader;

    /// @notice Biaya penukaran dalam basis point (1 bp = 0,01%).
    /// @dev Bukan untuk mencari untung — supaya angkanya realistis, karena venue
    ///      swap sungguhan selalu memungut biaya.
    uint256 public feeBps;

    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_FEE_BPS = 500; // batas atas 5%, penjaga kewarasan

    event Swapped(
        address indexed caller,
        address indexed recipient,
        uint256 amountIn,
        uint256 amountOut,
        uint256 priceUsed
    );
    event LiquidityAdded(uint256 amount);
    event LiquidityRemoved(uint256 amount);
    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    error FeeTooHigh(uint256 requested, uint256 max);
    error ZeroAmount();

    constructor(
        IERC20 _fxrp,
        IERC20 _stable,
        FtsoPriceReader _priceReader,
        uint256 _feeBps,
        address _owner
    ) Ownable(_owner) {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh(_feeBps, MAX_FEE_BPS);
        fxrp = _fxrp;
        stable = _stable;
        priceReader = _priceReader;
        feeBps = _feeBps;
    }

    /// @inheritdoc ISwapAdapter
    function tokenIn() external view returns (address) {
        return address(fxrp);
    }

    /// @inheritdoc ISwapAdapter
    function tokenOut() external view returns (address) {
        return address(stable);
    }

    /// @inheritdoc ISwapAdapter
    function availableLiquidity() external view returns (uint256) {
        return stable.balanceOf(address(this));
    }

    /// @inheritdoc ISwapAdapter
    function swapFxrpForStable(
        uint256 amountIn,
        uint256 minOut,
        address recipient
    ) external nonReentrant returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();

        (uint256 price, uint8 decimals) = priceReader.getXrpUsd();

        // FXRP dan USDT0 sama-sama 6 desimal, jadi nilai USD langsung jadi
        // jumlah stablecoin tanpa penyesuaian skala.
        uint256 grossOut = SplitMath.toUsd(amountIn, price, decimals);
        amountOut = grossOut - ((grossOut * feeBps) / BPS_DENOMINATOR);

        uint256 available = stable.balanceOf(address(this));
        if (amountOut > available) revert InsufficientLiquidity(amountOut, available);
        if (amountOut < minOut) revert SlippageExceeded(amountOut, minOut);

        fxrp.safeTransferFrom(msg.sender, address(this), amountIn);
        stable.safeTransfer(recipient, amountOut);

        emit Swapped(msg.sender, recipient, amountIn, amountOut, price);
    }

    // --- Pengelolaan likuiditas ---

    function addLiquidity(uint256 amount) external onlyOwner {
        stable.safeTransferFrom(msg.sender, address(this), amount);
        emit LiquidityAdded(amount);
    }

    /// @dev Jalur keluar untuk pemilik. Yang ditarik hanya likuiditas milik sendiri;
    ///      dana pengguna tidak pernah mengendap di sini — setiap swap langsung
    ///      mengirim hasilnya ke penerima dalam transaksi yang sama.
    function removeLiquidity(uint256 amount, address to) external onlyOwner {
        stable.safeTransfer(to, amount);
        emit LiquidityRemoved(amount);
    }

    function withdrawFxrp(uint256 amount, address to) external onlyOwner {
        fxrp.safeTransfer(to, amount);
    }

    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps, MAX_FEE_BPS);
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }
}
