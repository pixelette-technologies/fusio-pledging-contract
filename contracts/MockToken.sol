// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        // Mint an initial supply of 10 million USDC (with 6 decimals)
        _mint(msg.sender, 10000000 * 10 ** 6);  // 10 million USDC with 6 decimals
    }
}
