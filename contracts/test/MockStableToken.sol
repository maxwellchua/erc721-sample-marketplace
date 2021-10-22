// contracts/test/MockStableToken.sol
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title A mock StableToken for testing.
 */
contract MockStableToken is ERC20 {
    constructor() ERC20("test", "$TEST") {
        // add initial supply
        _mint(msg.sender, 1000000);
    }
}
