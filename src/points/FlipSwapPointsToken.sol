// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FlipSwapPointsToken
 * @notice Simple ERC20 token for FlipSwap reward points.
 *         Only the owner (typically the AGGFlowPointsWrapper contract) can mint tokens.
 */
contract FlipSwapPointsToken is ERC20, Ownable {
    constructor(address _owner) ERC20("FlipSwap Points", "FSWP") Ownable(_owner) {}

    /**
     * @notice Mint reward points to users.
     * @param to Address to receive the points.
     * @param amount Amount of points to mint.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
