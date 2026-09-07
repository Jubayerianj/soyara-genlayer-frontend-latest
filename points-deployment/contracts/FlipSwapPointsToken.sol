// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LitPearlsToken
 * @notice ERC20 reward token for the AGGFlow Points system on LitVM.
 *         Represents "Lit Pearls" — earned by swapping and staking the Athes Super Contributor NFT.
 *         Only the owner (AGGFlowPointsWrapperProxy) can mint tokens.
 */
contract LitPearlsToken is ERC20, Ownable {
    constructor(address _owner) ERC20("Lit Pearls", "LitPearls") Ownable(_owner) {}

    /**
     * @notice Mint Lit Pearls to a user when they claim points.
     * @param to     Address to receive the pearls.
     * @param amount Amount of pearls to mint (18 decimals).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
