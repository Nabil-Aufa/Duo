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

    /// @notice Adapter yang diajukan, menunggu masa tunggu berakhir.
    ISwapAdapter public pendingSwapAdapter;
    /// @notice Waktu paling awal adapter yang diajukan boleh diberlakukan.
    uint256 public pendingSwapAdapterAt;

    /// @notice Masa tunggu sebelum penggantian venue swap berlaku.
    /// @dev Dana pengguna melewati adapter saat ditukar. Tanpa jeda, pemilik
    ///      bisa mengarahkannya ke kontrak jahat dalam satu transaksi — dan
    ///      "non-kustodial" jadi tidak ada artinya kalau tujuannya bisa diganti
    ///      seketika. Jeda ini memberi pengguna waktu untuk keluar lebih dulu.
    uint256 public constant SWAP_ADAPTER_TIMELOCK = 2 days;

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
    event SwapAdapterProposed(address newAdapter, uint256 effectiveAt);
    event SwapAdapterProposalCancelled(address cancelledAdapter);
    event SwapAdapterUpdated(address oldAdapter, address newAdapter);
    event SlippageToleranceUpdated(uint256 oldBps, uint256 newBps);

    error NothingToSplit();
    error TargetTooHigh(uint256 requested, uint256 max);
    error ResidualBalance(address token, uint256 amount);
    error InvalidAddress();
    error NoPendingAdapter();
    error TimelockNotElapsed(uint256 nowTs, uint256 effectiveAt);

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

        // Dicatat SEBELUM dana ditarik. Pemeriksaan di akhir membandingkan
        // terhadap angka ini, bukan terhadap nol — lihat `_assertNoResidual`.
        uint256 fxrpBefore = fxrp.balanceOf(address(this));
        uint256 stableBefore = stable.balanceOf(address(this));
        uint256 sharesBefore = firelight.balanceOf(address(this));

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

        _assertNoResidual(fxrpBefore, stableBefore, sharesBefore);
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

    /// @dev Penegakan janji non-kustodial: apa pun yang masuk lewat transaksi ini
    ///      harus keluar lagi di transaksi yang sama.
    ///
    ///      Pembandingnya adalah saldo AWAL, bukan nol. Versi sebelumnya menuntut
    ///      saldo persis nol, dan itu bisa disalahgunakan: siapa pun cukup
    ///      mengirim satu unit token ke kontrak ini untuk membuat `split()` milik
    ///      SEMUA orang gagal selamanya. Dengan membandingkan terhadap saldo awal,
    ///      debu kiriman orang lain tidak berpengaruh, sementara jaminannya tetap
    ///      sama kuat — tidak ada dana pengguna yang boleh mengendap di sini.
    function _assertNoResidual(
        uint256 fxrpBefore,
        uint256 stableBefore,
        uint256 sharesBefore
    ) private view {
        uint256 fxrpLeft = fxrp.balanceOf(address(this));
        if (fxrpLeft > fxrpBefore) revert ResidualBalance(address(fxrp), fxrpLeft - fxrpBefore);

        uint256 stableLeft = stable.balanceOf(address(this));
        if (stableLeft > stableBefore) revert ResidualBalance(address(stable), stableLeft - stableBefore);

        uint256 sharesLeft = firelight.balanceOf(address(this));
        if (sharesLeft > sharesBefore) revert ResidualBalance(address(firelight), sharesLeft - sharesBefore);
    }

    // --- Administrasi ---

    /// @notice Mengajukan venue swap baru. Baru berlaku setelah masa tunggu.
    function proposeSwapAdapter(ISwapAdapter newAdapter) external onlyOwner {
        if (address(newAdapter) == address(0)) revert InvalidAddress();
        pendingSwapAdapter = newAdapter;
        pendingSwapAdapterAt = block.timestamp + SWAP_ADAPTER_TIMELOCK;
        emit SwapAdapterProposed(address(newAdapter), pendingSwapAdapterAt);
    }

    /// @notice Membatalkan pengajuan yang belum berlaku.
    function cancelSwapAdapterProposal() external onlyOwner {
        if (address(pendingSwapAdapter) == address(0)) revert NoPendingAdapter();
        emit SwapAdapterProposalCancelled(address(pendingSwapAdapter));
        pendingSwapAdapter = ISwapAdapter(address(0));
        pendingSwapAdapterAt = 0;
    }

    /// @notice Memberlakukan venue swap yang sudah melewati masa tunggu.
    /// @dev Sengaja bisa dipanggil siapa saja: begitu masa tunggu lewat,
    ///      perubahannya sudah publik dan tidak ada gunanya dibatasi.
    function applySwapAdapter() external {
        if (address(pendingSwapAdapter) == address(0)) revert NoPendingAdapter();
        if (block.timestamp < pendingSwapAdapterAt) {
            revert TimelockNotElapsed(block.timestamp, pendingSwapAdapterAt);
        }
        emit SwapAdapterUpdated(address(swapAdapter), address(pendingSwapAdapter));
        swapAdapter = pendingSwapAdapter;
        pendingSwapAdapter = ISwapAdapter(address(0));
        pendingSwapAdapterAt = 0;
    }

    /// @notice Batas toleransi selisih hasil swap.
    /// @dev Dibatasi 5%. Toleransi yang longgar plus venue yang bisa diganti
    ///      adalah dua bahan yang, kalau digabung, memungkinkan penggerusan
    ///      diam-diam. Masa tunggu di atas menangani bahan yang satunya.
    function setSlippageToleranceBps(uint256 newBps) external onlyOwner {
        require(newBps <= 500, "toleransi maks 5%");
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
