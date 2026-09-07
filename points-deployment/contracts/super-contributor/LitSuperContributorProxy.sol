// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title LitSuperContributorProxy
 * @dev Proxy contract for LitSuperContributorNFT using ERC1967 standard.
 */
contract LitSuperContributorProxy is ERC1967Proxy {
    constructor(address _logic, bytes memory _data) payable ERC1967Proxy(_logic, _data) {}
}
