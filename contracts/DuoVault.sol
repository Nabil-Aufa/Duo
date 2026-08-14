// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {SplitMath} from "./libraries/SplitMath.sol";
import {FtsoPriceReader} from "./oracle/FtsoPriceReader.sol";
import {ISwapAdapter} from "./adapters/ISwapAdapter.sol";
import {IFirelightVault} from "./interfaces/IFirelightVault.sol";

/// @title DuoVault
/// @notice Aturan yang bisa diprogram untuk pembayaran XRP.
///
///         Aturan pertama yang dikirim: amankan kebutuhan hidup lebih dulu.
///         Setiap pembayaran masuk dibelah — sampai sebesar target USD pengguna
///         ditukar jadi stablecoin, sisanya disetor ke Firelight untuk menabung.
///
/// @dev NON-KUSTODIAL. Kontrak ini tidak pernah menahan dana pengguna. Setiap
///      panggilan `split()` berakhir dengan saldo FXRP, stablecoin, dan stXRP
///      milik kontrak ini nol — semuanya dikirim ke pengguna dalam transaksi yang
///      sama. Ini diuji sebagai invariant, bukan sekadar niat.
///
///      `split()` sengaja TIDAK punya argumen. Custom instruction Flare Smart
///      Accounts didaftarkan dengan calldata yang dipatok permanen, jadi argumen
///      apa pun harus dibakukan saat registrasi. Dengan membaca `msg.sender` dan
///      mengambil target dari storage, satu instruksi terdaftar bisa dipakai
///      semua orang.
contract DuoVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable fxrp;
    IERC20 public immutable stable;
    IFirelightVault public immutable firelight;
    FtsoPriceReader public immutable priceReader;

    ISwapAdapter public swapAdapter;

    /// @notice Target kebutuhan tiap pengguna, dalam USD dengan 6 desimal.
    /// @dev Nol berarti "tabung semuanya" — pilihan bawaan yang sah.
    mapping(address => uint256) public targetOf;

    /// @notice Toleransi selisih hasil swap terhadap harga oracle, dalam bp.
    /// @dev Menjaga dari venue swap yang mengembalikan jauh lebih sedikit dari
    ///      yang wajar. Termasuk menutupi biaya adapter.
    uint256 public slippageToleranceBps = 200; // 2%

    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_TARGET_USD = 1_000_000e6; // $1 juta, penjaga kewarasan

    event TargetSet(address indexed user, uint256 oldTargetUsd, uint256 newTargetUsd);
    event Split(
        address indexed user,
        uint256 amountIn,
        uint256 toStable,
        uint256 toSavings,
        uint256 stableReceived,
        uint256 sharesReceived,
        uint256 priceUsed
    );
    event SwapAdapterUpdated(address oldAdapter, address newAdapter);
    event SlippageToleranceUpdated(uint256 oldBps, uint256 newBps);

    error NothingToSplit();
    error TargetTooHigh(uint256 requested, uint256 max);
    error ResidualBalance(address token, uint256 amount);
    error InvalidAddress();

    constructor(
        IERC20 _fxrp,
        IERC20 _stable,
        IFirelightVault _firelight,
        FtsoPriceReader _priceReader,
        ISwapAdapter _swapAdapter,
        address _owner
    ) Ownable(_owner) {
        if (
            address(_fxrp) == address(0) ||
            address(_stable) == address(0) ||
            address(_firelight) == address(0) ||
            address(_priceReader) == address(0) ||
            address(_swapAdapter) == address(0)
        ) revert InvalidAddress();

        fxrp = _fxrp;
        stable = _stable;
        firelight = _firelight;
        priceReader = _priceReader;
        swapAdapter = _swapAdapter;
    }

    /// @notice Menetapkan target kebutuhan bulanan pemanggil, dalam USD (6 desimal).
    /// @dev Berlaku untuk pembayaran BERIKUTNYA. Pembayaran yang sudah diproses
    ///      tidak bisa ditarik kembali — sama seperti mengubah potongan gaji.
    function setTarget(uint256 targetUsd) external {
        if (targetUsd > MAX_TARGET_USD) revert TargetTooHigh(targetUsd, MAX_TARGET_USD);
        emit TargetSet(msg.sender, targetOf[msg.sender], targetUsd);
        targetOf[msg.sender] = targetUsd;
    }

    /// @notice Membelah seluruh saldo FXRP pemanggil sesuai aturannya.
    /// @dev Pemanggil harus sudah memberi allowance FXRP ke kontrak ini. Dalam
    ///      alur Smart Accounts, `approve` dan `split` didaftarkan sebagai satu
    ///      batch instruksi, jadi pengguna cukup mengirim satu pembayaran XRPL.
    function split() external nonReentrant whenNotPaused {
        address user = msg.sender;

        uint256 amountIn = fxrp.balanceOf(user);
        if (amountIn == 0) revert NothingToSplit();

        // Batasi ke allowance yang diberikan, supaya tidak revert karena pengguna
        // menyetujui lebih sedikit dari saldonya.
        uint256 allowance = fxrp.allowance(user, address(this));
        if (allowance < amountIn) amountIn = allowance;
        if (amountIn == 0) revert NothingToSplit();

        fxrp.safeTransferFrom(user, address(this), amountIn);

        (uint256 price, uint8 decimals) = priceReader.getXrpUsd();
        (uint256 toStable, uint256 toSavings) = SplitMath.computeSplit(
            amountIn,
            targetOf[user],
            price,
            decimals
        );

        uint256 stableReceived = _swapToStable(toStable, price, decimals, user);
        uint256 sharesReceived = _depositToSavings(toSavings, user);

        emit Split(user, amountIn, toStable, toSavings, stableReceived, sharesReceived, price);

        _assertNoResidual();
    }

    function _swapToStable(
        uint256 amount,
        uint256 price,
        uint8 decimals,
        address recipient
    ) private returns (uint256 stableReceived) {
        if (amount == 0) return 0;

        // Hasil minimum dihitung dari harga oracle yang SAMA dengan yang dipakai
        // membelah, jadi tidak perlu memanggil oracle dua kali.
        uint256 expected = SplitMath.toUsd(amount, price, decimals);
        uint256 minOut = (expected * (BPS_DENOMINATOR - slippageToleranceBps)) / BPS_DENOMINATOR;

        fxrp.forceApprove(address(swapAdapter), amount);
        stableReceived = swapAdapter.swapFxrpForStable(amount, minOut, recipient);
        fxrp.forceApprove(address(swapAdapter), 0);
    }

    function _depositToSavings(uint256 amount, address receiver)
        private
        returns (uint256 sharesReceived)
    {
        if (amount == 0) return 0;

        fxrp.forceApprove(address(firelight), amount);
        // Firelight mencetak stXRP langsung ke `receiver`, jadi tanda terima
        // tabungan tidak pernah singgah di kontrak ini.
        sharesReceived = firelight.deposit(amount, receiver);
        fxrp.forceApprove(address(firelight), 0);
    }

    /// @dev Penegakan janji non-kustodial. Kalau ada token pengguna yang tertinggal,
    ///      seluruh transaksi dibatalkan — lebih baik gagal keras daripada diam-diam
    ///      menahan dana orang.
    function _assertNoResidual() private view {
        uint256 fxrpLeft = fxrp.balanceOf(address(this));
        if (fxrpLeft != 0) revert ResidualBalance(address(fxrp), fxrpLeft);

        uint256 stableLeft = stable.balanceOf(address(this));
        if (stableLeft != 0) revert ResidualBalance(address(stable), stableLeft);

        uint256 sharesLeft = firelight.balanceOf(address(this));
        if (sharesLeft != 0) revert ResidualBalance(address(firelight), sharesLeft);
    }

    // --- Administrasi ---

    function setSwapAdapter(ISwapAdapter newAdapter) external onlyOwner {
        if (address(newAdapter) == address(0)) revert InvalidAddress();
        emit SwapAdapterUpdated(address(swapAdapter), address(newAdapter));
        swapAdapter = newAdapter;
    }

    function setSlippageToleranceBps(uint256 newBps) external onlyOwner {
        require(newBps <= 1_000, "toleransi maks 10%");
        emit SlippageToleranceUpdated(slippageToleranceBps, newBps);
        slippageToleranceBps = newBps;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Jaring pengaman untuk token yang nyasar ke kontrak ini.
    /// @dev Bukan jalur kustodi: alur normal tidak pernah meninggalkan saldo di
    ///      sini — `_assertNoResidual` memastikan itu. Fungsi ini hanya untuk
    ///      token yang dikirim orang secara tidak sengaja.
    function rescueToken(IERC20 token, uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        token.safeTransfer(to, amount);
    }
}
