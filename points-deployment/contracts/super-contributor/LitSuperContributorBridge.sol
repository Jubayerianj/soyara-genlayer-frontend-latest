// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface ILitSuperContributorNFT is IERC721 {
    function mintFromBridge(address to, uint256 tokenId) external;
    function burnFromBridge(uint256 tokenId) external;
}

contract LitSuperContributorBridge is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using ECDSA for bytes;

    // Custom storage gap of 250 slots + 1 slot for reentrancy status = 251 slots
    // This aligns sequential variables to start exactly at slot 251 to match the OZ v4 on-chain layout
    uint256[250] private __storageGap;
    
    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    ILitSuperContributorNFT public nft;
    bool public isHomeChain; // true if Arbitrum (locks/unlocks), false if LitVM (mints/burns)
    
    address public trustedSigner;
    bool public isPaused;

    // Mapping from message hash (or unique bridge transfer hash) to processed status
    mapping(bytes32 => bool) public processedClaims;

    // Nonce for each user for outbound transfers
    mapping(address => uint256) public userBridgedCount;

    // Mapping to prevent replay attacks on rescue signatures (appended to prevent storage collision)
    mapping(bytes32 => bool) public processedRescues;

    // Added bridging fee in native token (appended at the end of storage layout)
    uint256 public bridgeFee;

    event NFTBridged(
        address indexed user,
        uint256 indexed tokenId,
        uint256 indexed nonce,
        uint256 fromChainId,
        uint256 toChainId
    );

    event NFTClaimed(
        address indexed user,
        uint256 indexed tokenId,
        uint256 indexed nonce,
        uint256 fromChainId,
        uint256 toChainId
    );

    event NFTRescued(
        address indexed user,
        uint256 indexed tokenId,
        uint256 indexed rescueNonce
    );

    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event PauseStatusUpdated(bool paused);
    event BridgeFeeUpdated(uint256 oldFee, uint256 newFee);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer function to set up the upgradeable bridge.
     */
    function initialize(
        address _nft,
        bool _isHomeChain,
        address _trustedSigner
    ) external initializer {
        __Ownable_init(msg.sender);
        _reentrancyStatus = _NOT_ENTERED;

        require(_nft != address(0), "Invalid NFT address");
        require(_trustedSigner != address(0), "Invalid signer address");
        nft = ILitSuperContributorNFT(_nft);
        isHomeChain = _isHomeChain;
        trustedSigner = _trustedSigner;
    }

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    modifier whenNotPaused() {
        require(!isPaused, "Bridge is paused");
        _;
    }

    /**
     * @notice Initiates a bridge transfer of an NFT.
     * @param tokenId The ID of the NFT to bridge.
     * @param targetChainId The destination chain ID (e.g. 4441 or 42161).
     */
    function bridgeNFT(uint256 tokenId, uint256 targetChainId) external payable nonReentrant whenNotPaused {
        require(msg.value >= bridgeFee, "Insufficient bridge fee");
        require(nft.ownerOf(tokenId) == msg.sender, "Not the owner of the token");
        
        uint256 nonce = userBridgedCount[msg.sender];
        userBridgedCount[msg.sender] = nonce + 1;

        if (isHomeChain) {
            // Lock NFT on Arbitrum (transfers to this bridge contract)
            nft.transferFrom(msg.sender, address(this), tokenId);
        } else {
            // Burn NFT on LitVM
            nft.burnFromBridge(tokenId);
        }

        emit NFTBridged(msg.sender, tokenId, nonce, block.chainid, targetChainId);
    }

    /**
     * @notice Claims a bridged NFT on the destination chain.
     * @param user The receiver of the NFT.
     * @param tokenId The token ID.
     * @param sourceChainId The chain ID where the transfer was initiated.
     * @param nonce The nonce from the source transfer.
     * @param signature Cryptographic signature authorizing the claim.
     */
    function claimNFT(
        address user,
        uint256 tokenId,
        uint256 sourceChainId,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        bytes32 messageHash = getClaimHash(user, tokenId, sourceChainId, block.chainid, nonce);
        require(!processedClaims[messageHash], "Claim already processed");

        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address recovered = ECDSA.recover(ethHash, signature);
        require(recovered == trustedSigner, "Invalid signature");

        processedClaims[messageHash] = true;

        if (isHomeChain) {
            // Unlock on Arbitrum: transfer from this bridge to the user
            nft.transferFrom(address(this), user, tokenId);
        } else {
            // Mint on LitVM: call the special mint function
            nft.mintFromBridge(user, tokenId);
        }

        emit NFTClaimed(user, tokenId, nonce, sourceChainId, block.chainid);
    }

    /**
     * @notice Generates the message hash that the trusted signer must sign.
     */
    function getClaimHash(
        address user,
        uint256 tokenId,
        uint256 sourceChainId,
        uint256 targetChainId,
        uint256 nonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                address(this),
                user,
                tokenId,
                sourceChainId,
                targetChainId,
                nonce
            )
        );
    }

    /**
     * @notice Allows a user to rescue a stuck NFT with a specific rescue signature from the trusted signer.
     * @param tokenId The ID of the NFT to rescue.
     * @param rescueNonce A unique nonce for the rescue request to prevent replay attacks.
     * @param signature Cryptographic signature from the trusted signer authorizing the rescue.
     */
    function rescueNFT(
        uint256 tokenId,
        uint256 rescueNonce,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        bytes32 rescueHash = getRescueHash(msg.sender, tokenId, block.chainid, rescueNonce);
        require(!processedRescues[rescueHash], "Rescue already processed");

        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(rescueHash);
        address recovered = ECDSA.recover(ethHash, signature);
        require(recovered == trustedSigner, "Invalid signature");

        processedRescues[rescueHash] = true;

        if (isHomeChain) {
            // Transfer locked NFT from this bridge to the user
            nft.transferFrom(address(this), msg.sender, tokenId);
        } else {
            // Mint NFT to the user
            nft.mintFromBridge(msg.sender, tokenId);
        }

        emit NFTRescued(msg.sender, tokenId, rescueNonce);
    }

    /**
     * @notice Generates the message hash that the trusted signer must sign for rescues.
     */
    function getRescueHash(
        address user,
        uint256 tokenId,
        uint256 targetChainId,
        uint256 rescueNonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "RESCUE",
                address(this),
                user,
                tokenId,
                targetChainId,
                rescueNonce
            )
        );
    }

    // ==================== ADMIN FUNCTIONS ====================

    function setTrustedSigner(address _trustedSigner) external onlyOwner {
        require(_trustedSigner != address(0), "Invalid signer address");
        address oldSigner = trustedSigner;
        trustedSigner = _trustedSigner;
        emit TrustedSignerUpdated(oldSigner, _trustedSigner);
    }

    function setPaused(bool _paused) external onlyOwner {
        isPaused = _paused;
        emit PauseStatusUpdated(_paused);
    }

    function setBridgeFee(uint256 _fee) external onlyOwner {
        uint256 oldFee = bridgeFee;
        bridgeFee = _fee;
        emit BridgeFeeUpdated(oldFee, _fee);
    }

    // Emergency withdrawal in case any NFTs or ETH get stuck (owner only)
    function emergencyWithdrawNFT(address tokenAddress, uint256 tokenId, address to) external onlyOwner {
        IERC721(tokenAddress).transferFrom(address(this), to, tokenId);
    }

    // Emergency withdrawal of ETH (owner only)
    function emergencyWithdrawETH(address payable to) external onlyOwner {
        (bool success, ) = to.call{value: address(this).balance}("");
        require(success, "Withdraw failed");
    }

    /**
     * @dev Required override for UUPS upgrade authorization.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
