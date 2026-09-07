// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title LitSuperContributorNFT
 * @dev Upgradeable ERC721 NFT contract for Athes Super Contributor (LSC) on Arbitrum.
 * Features customizable claim price, base URI, total supply caps, and admin controls.
 * Uses UUPS pattern for gas-efficient upgrades.
 * Includes support for non-transferable (soulbound) NFTs with admin toggle,
 * automatic payment forwarding for mints, and ERC2981 royalty implementation.
 */
contract LitSuperContributorNFT is
    Initializable,
    ERC721Upgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using Strings for uint256;

    // Inline reentrancy guard (OZ v5 contracts-upgradeable has no ReentrancyGuardUpgradeable)
    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // State Variables
    uint256 public claimPrice;
    uint256 public maxSupply;
    uint256 public totalMinted;
    string private _baseTokenURI;

    // Upgraded State Variables (appended at the end to prevent storage collision)
    bool public transfersEnabled;
    address public paymentReceiver;
    uint96 public royaltyFeeNumerator;
    // DEPRECATED (kept for storage slot compatibility) — use authorizedBridges mapping instead
    address public bridgeAddress;

    // FIX: Support multiple authorized bridge/staking addresses (slot added after bridgeAddress)
    mapping(address => bool) public authorizedBridges;

    // Events
    event ClaimPriceUpdated(uint256 newPrice);
    event BaseURIUpdated(string newBaseURI);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    event NFTClaimed(address indexed claimer, uint256 indexed tokenId, uint256 pricePaid);
    event FundsWithdrawn(address indexed owner, uint256 amount);
    event TransfersEnabledUpdated(bool enabled);
    event PaymentReceiverUpdated(address indexed newReceiver);
    event RoyaltyFeeNumeratorUpdated(uint96 newNumerator);
    event BridgeAddressUpdated(address indexed newBridge);
    event AuthorizedBridgeUpdated(address indexed bridge, bool authorized);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializer function to set up the upgradeable contract.
     * Replaces the constructor.
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        uint256 maxSupply_,
        uint256 claimPrice_
    ) external initializer {
        __ERC721_init(name_, symbol_);
        __Ownable_init(msg.sender);
        _reentrancyStatus = _NOT_ENTERED;

        claimPrice = claimPrice_;
        maxSupply = maxSupply_;
        _baseTokenURI = baseURI_;
    }

    /**
     * @dev Claim function allows users to mint a Athes Super Contributor NFT.
     * Must send the exact claim price.
     * Payments are automatically forwarded to the payment receiver.
     */
    function claim() external payable nonReentrant {
        require(claimPrice > 0, "Claiming is disabled");
        require(msg.value >= claimPrice, "Insufficient payment");
        require(totalMinted < maxSupply, "Max supply reached");

        uint256 tokenId = totalMinted + 1;
        totalMinted++;

        _safeMint(msg.sender, tokenId);

        emit NFTClaimed(msg.sender, tokenId, msg.value);

        // Forward claim payment automatically to the receiver
        address receiver = paymentReceiver == address(0)
            ? 0x48234eD645676b794a4CbC7483513e58cB04e22E
            : paymentReceiver;
        (bool paymentSuccess, ) = payable(receiver).call{value: claimPrice}("");
        require(paymentSuccess, "Payment transfer failed");

        // Refund excess ether if any is sent
        if (msg.value > claimPrice) {
            uint256 excess = msg.value - claimPrice;
            (bool refundSuccess, ) = payable(msg.sender).call{value: excess}("");
            require(refundSuccess, "Refund failed");
        }
    }

    /**
     * @dev Claim function allows users to mint multiple Athes Super Contributor NFTs in a single transaction.
     * Must send at least (claimPrice * quantity) in msg.value.
     * Payments are automatically forwarded to the payment receiver.
     */
    function claimBatch(uint256 quantity) external payable nonReentrant {
        require(quantity > 0, "Quantity must be greater than 0");
        require(claimPrice > 0, "Claiming is disabled");
        uint256 totalCost = claimPrice * quantity;
        require(msg.value >= totalCost, "Insufficient payment");
        require(totalMinted + quantity <= maxSupply, "Exceeds max supply");

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = totalMinted + 1;
            totalMinted++;
            _safeMint(msg.sender, tokenId);
            emit NFTClaimed(msg.sender, tokenId, claimPrice);
        }

        // Forward claim payment automatically to the receiver
        address receiver = paymentReceiver == address(0)
            ? 0x48234eD645676b794a4CbC7483513e58cB04e22E
            : paymentReceiver;
        (bool paymentSuccess, ) = payable(receiver).call{value: totalCost}("");
        require(paymentSuccess, "Payment transfer failed");

        // Refund excess ether if any is sent
        if (msg.value > totalCost) {
            uint256 excess = msg.value - totalCost;
            (bool refundSuccess, ) = payable(msg.sender).call{value: excess}("");
            require(refundSuccess, "Refund failed");
        }
    }

    /**
     * @dev Admin/owner mint function for promo, seed, or direct allocations.
     */
    function adminMint(address to, uint256 quantity) external onlyOwner {
        require(totalMinted + quantity <= maxSupply, "Exceeds max supply");
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = totalMinted + 1;
            totalMinted++;
            _safeMint(to, tokenId);
        }
    }

    /**
     * @dev Update the claim price.
     */
    function setClaimPrice(uint256 newPrice) external onlyOwner {
        claimPrice = newPrice;
        emit ClaimPriceUpdated(newPrice);
    }

    /**
     * @dev Update the base token URI.
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    /**
     * @dev Update the maximum supply of NFTs.
     */
    function setMaxSupply(uint256 newMaxSupply) external onlyOwner {
        require(newMaxSupply >= totalMinted, "Max supply cannot be less than total minted");
        maxSupply = newMaxSupply;
        emit MaxSupplyUpdated(newMaxSupply);
    }

    /**
     * @dev Toggle transferability of the NFTs.
     */
    function setTransfersEnabled(bool enabled) external onlyOwner {
        transfersEnabled = enabled;
        emit TransfersEnabledUpdated(enabled);
    }

    /**
     * @dev Set the payment receiver address.
     */
    function setPaymentReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "Invalid address");
        paymentReceiver = newReceiver;
        emit PaymentReceiverUpdated(newReceiver);
    }

    /**
     * @dev Set the royalty fee percentage (in basis points, e.g. 1000 for 10%).
     */
    function setRoyaltyFeeNumerator(uint96 newNumerator) external onlyOwner {
        require(newNumerator <= 10000, "Royalty cannot exceed 100%");
        royaltyFeeNumerator = newNumerator;
        emit RoyaltyFeeNumeratorUpdated(newNumerator);
    }

    /**
     * @dev Withdraw all ether accumulated from claims (fallback for legacy or manual sends).
     */
    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");

        emit FundsWithdrawn(owner(), balance);
    }

    /**
     * @dev Recover any stuck ERC20 tokens sent to this contract.
     */
    function recoverERC20(address tokenAddress, uint256 tokenAmount) external onlyOwner {
        require(tokenAddress != address(0), "Invalid token address");
        IERC20(tokenAddress).transfer(owner(), tokenAmount);
    }

    /**
     * @dev Recover any stuck ERC721 tokens sent to this contract.
     */
    function recoverERC721(address tokenAddress, uint256 tokenId) external onlyOwner {
        require(tokenAddress != address(0), "Invalid token address");
        IERC721(tokenAddress).safeTransferFrom(address(this), owner(), tokenId);
    }

    /**
     * @dev Internal function override to return base token URI.
     */
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @dev Override tokenURI to return the shared token metadata URI.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _baseURI();
    }

    /**
     * @dev Implement EIP-2981 royaltyInfo.
     * Returns 10% royalty by default to paymentReceiver (or default address).
     */
    function royaltyInfo(
        uint256 /* tokenId */,
        uint256 salePrice
    ) external view returns (address receiver, uint256 royaltyAmount) {
        address receiverAddress = paymentReceiver == address(0)
            ? 0x48234eD645676b794a4CbC7483513e58cB04e22E
            : paymentReceiver;
        uint256 feeNumerator = royaltyFeeNumerator == 0 ? 1000 : royaltyFeeNumerator;
        uint256 amount = (salePrice * feeNumerator) / 10000;
        return (receiverAddress, amount);
    }

    /**
     * @dev OZ v5 hook called on every token update (mint/transfer/burn).
     * Restricts transfers when transfersEnabled is false (soulbound), except for bridge address.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        // Allow mints (from==0) and burns (to==0) freely.
        // For transfers, check transfersEnabled or authorized bridge/staking whitelist.
        if (from != address(0) && to != address(0)) {
            require(
                transfersEnabled ||
                authorizedBridges[from] ||
                authorizedBridges[to] ||
                from == bridgeAddress ||  // legacy slot backwards-compat
                to == bridgeAddress,      // legacy slot backwards-compat
                "Transfers are disabled"
            );
        }
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Legacy setter — kept for backwards compatibility.
     * Also authorizes the new bridge in the mapping so both slots work.
     */
    function setBridgeAddress(address newBridge) external onlyOwner {
        require(newBridge != address(0), "Invalid bridge address");
        // Deauthorize old bridge from mapping if it was set
        if (bridgeAddress != address(0)) {
            authorizedBridges[bridgeAddress] = false;
            emit AuthorizedBridgeUpdated(bridgeAddress, false);
        }
        bridgeAddress = newBridge;
        authorizedBridges[newBridge] = true;
        emit BridgeAddressUpdated(newBridge);
        emit AuthorizedBridgeUpdated(newBridge, true);
    }

    /**
     * @dev Authorize or revoke any address (bridge contract, staking wrapper, etc.)
     * to transfer soulbound tokens. This fixes the single-bridge limitation.
     */
    function setAuthorizedBridge(address bridge, bool authorized) external onlyOwner {
        require(bridge != address(0), "Invalid address");
        authorizedBridges[bridge] = authorized;
        emit AuthorizedBridgeUpdated(bridge, authorized);
    }

    /**
     * @dev Mint an NFT from an authorized bridge/relayer.
     * FIX: also increments totalMinted to keep the supply counter accurate.
     */
    function mintFromBridge(address to, uint256 tokenId) external {
        require(authorizedBridges[msg.sender] || msg.sender == bridgeAddress, "Only authorized bridge can mint");
        totalMinted++;
        _safeMint(to, tokenId);
    }

    /**
     * @dev Burn an NFT from an authorized bridge/relayer.
     * FIX: also decrements totalMinted to keep the supply counter accurate.
     */
    function burnFromBridge(uint256 tokenId) external {
        require(authorizedBridges[msg.sender] || msg.sender == bridgeAddress, "Only authorized bridge can burn");
        if (totalMinted > 0) totalMinted--;
        _burn(tokenId);
    }

    /**
     * @dev Override supportsInterface to include ERC2981 support.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721Upgradeable) returns (bool) {
        return interfaceId == 0x2a55205a || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Required override for UUPS upgrade authorization.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
