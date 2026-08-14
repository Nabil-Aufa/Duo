// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {SplitMath} from "../libraries/SplitMath.sol";

/// @dev Pembungkus tipis supaya fungsi `internal` di SplitMath bisa dipanggil
///      dari tes. Hanya untuk pengujian, tidak pernah di-deploy ke jaringan.
contract SplitMathHarness {
    function computeSplit(
        uint256 amountFxrp,
        uint256 targetUsd,
        uint256 price,
        uint8 priceDecimals
    ) external pure returns (uint256 toStable, uint256 toSavings) {
        return SplitMath.computeSplit(amountFxrp, targetUsd, price, priceDecimals);
    }

    function toUsd(
        uint256 amountFxrp,
        uint256 price,
        uint8 priceDecimals
    ) external pure returns (uint256) {
        return SplitMath.toUsd(amountFxrp, price, priceDecimals);
    }
}
