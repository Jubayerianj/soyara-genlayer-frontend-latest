// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { SwapIntent, FeeCollection } from "./AGGFlowEntrypointTypes.sol";

interface IAGGFlowEntrypoint {
    function executeSwap(
        SwapIntent calldata swapIntent,
        FeeCollection calldata feeCollection,
        bytes calldata program
    ) external payable returns (uint256 amountOut);

    function executeSwapWithReceiver(
        SwapIntent calldata swapIntent,
        FeeCollection calldata feeCollection,
        bytes calldata program,
        address receiver
    ) external payable returns (uint256 amountOut);
}

/**
 * @title AGGFlowPointsWrapper
 * @notice Upgradeable wrapper for AGGFlowEntrypoint that records swap points (Lit Diamonds).
 *         Supports NFT staking: stakers get 20x swap points + 200 passive points/day.
 *
 * @dev STORAGE LAYOUT (MUST NOT BE REORDERED — UUPS UPGRADEABLE):
 *  OZ Initializable     — _initialized (uint64), _initializing (bool) [inherited, packed]
 *  OZ OwnableUpgradeable— _owner (address) [inherited, slot from OZ layout]
 *  slot 0  : _status           (uint256)  — reentrancy guard
 *  slot 1  : entrypoint        (address)
 *  slot 2  : nftAddress        (address)
 *  slot 3  : basePointsPerSwap (uint256)
 *  slot 4  : nftMultiplier     (uint256)
 *  slot 5  : (mapping) unclaimedPoints
 *  slot 6  : (mapping) claimedPoints
 *  slot 7  : rewardToken (address, 20b) + isRewardTokenMintable (bool, 1b) [packed]
 *  slot 8  : dailyRewardRate   (uint256)
 *  slot 9  : (mapping) userStakedBalance
 *  slot 10 : (mapping) userLastClaimedAt
 *  slot 11 : (mapping) tokenStakers
 *
 * NOTE: Constants (MAX_*) do NOT consume storage slots — they are inlined by the compiler.
 *
 * BRIDGED NFT COMPATIBILITY:
 *  The LitSuperContributorNFT has transfersEnabled=false by default.
 *  The NFT contract owner MUST call setBridgeAddress(address(thisProxy))
 *  on the NFT contract to allow safeTransferFrom into/out of this staking contract.
 */
contract AGGFlowPointsWrapper is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ── Caps (constants — no storage slots consumed) ──────────────────────────
    uint256 private constant MAX_MULTIPLIER  = 100;
    uint256 private constant MAX_DAILY_RATE  = 10_000 * 1e18;
    uint256 private constant MAX_BASE_POINTS = 1_000 * 1e18;

    // ── STORAGE LAYOUT (order FROZEN for upgrade compatibility) ───────────────
    // slot 0
    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    // slot 1
    address public entrypoint;
    // slot 2
    address public nftAddress;

    // slot 3
    uint256 public basePointsPerSwap;
    // slot 4
    uint256 public nftMultiplier;

    // slots 5, 6 (mappings)
    mapping(address => uint256) public unclaimedPoints;
    mapping(address => uint256) public claimedPoints;

    // slot 7 — address (20 bytes) + bool (1 byte) packed
    address public rewardToken;
    bool    public isRewardTokenMintable;

    // slot 8
    uint256 public dailyRewardRate;

    // slots 9, 10, 11 (mappings)
    mapping(address => uint256) public userStakedBalance;
    mapping(address => uint256) public userLastClaimedAt;
    mapping(uint256 => address) public tokenStakers;

    // slot 12
    address public gameSigner;
    // slot 13
    mapping(address => uint256) public gameClaimNonces;

    // ── Events ────────────────────────────────────────────────────────────────
    event SwapExecuted(
        address indexed user,
        address indexed receiver,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 pointsEarned
    );
    event PointsClaimed(address indexed user, uint256 amount);
    event NFTStaked(address indexed user, uint256 indexed tokenId);
    event NFTUnstaked(address indexed user, uint256 indexed tokenId);
    event NFTAddressUpdated(address indexed oldNFT, address indexed newNFT);
    event PointsConfigUpdated(uint256 basePoints, uint256 multiplier, uint256 newDailyRewardRate);
    event RewardTokenUpdated(address indexed newRewardToken, bool isMintable);
    event EntrypointUpdated(address indexed oldEntrypoint, address indexed newEntrypoint);
    event GamePointsClaimed(address indexed user, uint256 amount, uint256 nonce);
    event GameSignerUpdated(address indexed oldSigner, address indexed newSigner);

    // ── Errors ────────────────────────────────────────────────────────────────
    error AGGFlowPointsWrapper_InsufficientETH();
    error AGGFlowPointsWrapper_NotTokenStaker();
    error AGGFlowPointsWrapper_ETHRefundFailed();
    error AGGFlowPointsWrapper_ZeroAddress();
    error AGGFlowPointsWrapper_MultiplierTooHigh();
    error AGGFlowPointsWrapper_DailyRateTooHigh();
    error AGGFlowPointsWrapper_BasePointsTooHigh();
    error AGGFlowPointsWrapper_NoPoints();
    error AGGFlowPointsWrapper_InvalidSignature();
    error AGGFlowPointsWrapper_InvalidNonce();

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ── Initializer ───────────────────────────────────────────────────────────
    /**
     * @notice One-time initializer called when the proxy is first deployed.
     * @param _owner       Contract owner (deployer wallet).
     * @param _entrypoint  AGGFlowEntrypoint address on LitVM.
     * @param _nftAddress  Bridged Athes Super Contributor NFT proxy on LitVM.
     * @param _rewardToken FSWP ERC20 token address (FlipSwapPointsToken).
     * @param _isRewardTokenMintable True = mint on claim, False = transfer pre-funded tokens.
     */
    function initialize(
        address _owner,
        address _entrypoint,
        address _nftAddress,
        address _rewardToken,
        bool    _isRewardTokenMintable
    ) external initializer {
        if (_owner      == address(0)) revert AGGFlowPointsWrapper_ZeroAddress();
        if (_entrypoint == address(0)) revert AGGFlowPointsWrapper_ZeroAddress();
        if (_nftAddress == address(0)) revert AGGFlowPointsWrapper_ZeroAddress();

        __Ownable_init(_owner);

        _status = _NOT_ENTERED;

        entrypoint           = _entrypoint;
        nftAddress           = _nftAddress;
        rewardToken          = _rewardToken;
        isRewardTokenMintable = _isRewardTokenMintable;

        basePointsPerSwap = 1   * 1e18;   // 1 Diamond / swap
        nftMultiplier     = 20;            // 20x boost when staked
        dailyRewardRate   = 200 * 1e18;   // 200 Diamonds / NFT / day
    }

    // ── Swap Functions ────────────────────────────────────────────────────────

    /// @notice Swap via AGGFlow and earn Lit Diamonds. Output goes to msg.sender.
    function executeSwap(
        SwapIntent   calldata swapIntent,
        FeeCollection calldata feeCollection,
        bytes         calldata program
    ) external payable nonReentrant returns (uint256 amountOut) {
        return _executeSwapAndRecord(swapIntent, feeCollection, program, msg.sender);
    }

    /// @notice Swap via AGGFlow with a custom receiver. Points credited to msg.sender.
    function executeSwapWithReceiver(
        SwapIntent   calldata swapIntent,
        FeeCollection calldata feeCollection,
        bytes         calldata program,
        address       receiver
    ) external payable nonReentrant returns (uint256 amountOut) {
        return _executeSwapAndRecord(swapIntent, feeCollection, program, receiver);
    }

    // ── Points Claiming ───────────────────────────────────────────────────────

    /**
     * @notice Claims all accumulated Lit Diamonds (swap + passive staking rewards).
     *         Mints FSWP ERC20 tokens to msg.sender if rewardToken is configured.
     */
    function claimPoints() external nonReentrant {
        _harvest(msg.sender);

        uint256 amount = unclaimedPoints[msg.sender];
        if (amount == 0) revert AGGFlowPointsWrapper_NoPoints();

        // CEI: clear state BEFORE external call
        unclaimedPoints[msg.sender]  = 0;
        claimedPoints[msg.sender]   += amount;

        if (rewardToken != address(0)) {
            if (isRewardTokenMintable) {
                (bool ok,) = rewardToken.call(
                    abi.encodeWithSignature("mint(address,uint256)", msg.sender, amount)
                );
                require(ok, "Reward token minting failed");
            } else {
                IERC20(rewardToken).safeTransfer(msg.sender, amount);
            }
        }

        emit PointsClaimed(msg.sender, amount);
    }

    /**
     * @notice Claims game-earned pearls on-chain using a trusted backend signature.
     * @param amount    The number of points (in 18 decimal fixed-point).
     * @param nonce     The current user claim nonce.
     * @param signature The signature generated by the trusted gameSigner wallet.
     */
    function claimGamePoints(
        uint256 amount,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        if (nonce != gameClaimNonces[msg.sender]) revert AGGFlowPointsWrapper_InvalidNonce();
        
        // Effect: increment nonce to prevent replay attacks
        gameClaimNonces[msg.sender]++;
        
        // Build signed hash
        bytes32 messageHash = keccak256(
            abi.encodePacked(address(this), msg.sender, amount, nonce)
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        
        address recovered = _recoverSigner(ethSignedMessageHash, signature);
        if (recovered != gameSigner && recovered != owner()) revert AGGFlowPointsWrapper_InvalidSignature();

        // Transfer/Mint Reward
        if (rewardToken != address(0)) {
            if (isRewardTokenMintable) {
                (bool ok,) = rewardToken.call(
                    abi.encodeWithSignature("mint(address,uint256)", msg.sender, amount)
                );
                require(ok, "Reward token minting failed");
            } else {
                IERC20(rewardToken).safeTransfer(msg.sender, amount);
            }
        }

        emit GamePointsClaimed(msg.sender, amount, nonce);
    }

    function _recoverSigner(bytes32 ethSignedMessageHash, bytes memory signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = _splitSignature(signature);
        return ecrecover(ethSignedMessageHash, v, r, s);
    }

    function _splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        if (sig.length != 65) revert AGGFlowPointsWrapper_InvalidSignature();
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    // ── Staking Functions ─────────────────────────────────────────────────────

    /**
     * @notice Stakes a bridged Athes Super Contributor NFT.
     *         Unlocks 20x swap multiplier + 200 passive Diamonds/day.
     *
     * @dev PREREQUISITE: The NFT contract owner must have called
     *      LitSuperContributorNFT.setBridgeAddress(address(thisProxy))
     *      to allow safeTransferFrom on the otherwise soulbound token.
     *
     * @param tokenId Token ID of the bridged NFT.
     */
    function stakeNFT(uint256 tokenId) external nonReentrant {
        // CHECKS
        require(IERC721(nftAddress).ownerOf(tokenId) == msg.sender, "Not NFT owner");

        // EFFECTS — harvest first, then update state (CEI)
        _harvest(msg.sender);

        // CRITICAL: Seed lastClaimedAt on first stake to prevent unix-epoch exploit
        // (block.timestamp - 0 ≈ 1.7B seconds → massive fake passive reward on first harvest)
        if (userStakedBalance[msg.sender] == 0) {
            userLastClaimedAt[msg.sender] = block.timestamp;
        }

        tokenStakers[tokenId]          = msg.sender;
        userStakedBalance[msg.sender] += 1;

        // INTERACTIONS — transfer NFT after state is updated
        IERC721(nftAddress).safeTransferFrom(msg.sender, address(this), tokenId);

        emit NFTStaked(msg.sender, tokenId);
    }

    /**
     * @notice Unstakes an NFT, harvests all rewards, returns NFT to staker.
     * @param tokenId Token ID of the staked NFT to withdraw.
     */
    function unstakeNFT(uint256 tokenId) external nonReentrant {
        // CHECKS
        if (tokenStakers[tokenId] != msg.sender) {
            revert AGGFlowPointsWrapper_NotTokenStaker();
        }

        // EFFECTS
        _harvest(msg.sender);
        delete tokenStakers[tokenId];
        userStakedBalance[msg.sender] -= 1;

        // INTERACTIONS
        IERC721(nftAddress).safeTransferFrom(address(this), msg.sender, tokenId);

        emit NFTUnstaked(msg.sender, tokenId);
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /**
     * @notice Real-time unclaimed Diamonds including seconds-accurate passive staking accrual.
     */
    function getUnclaimedPoints(address user) public view returns (uint256) {
        uint256 current    = unclaimedPoints[user];
        uint256 stakedCount = userStakedBalance[user];

        if (stakedCount > 0 && userLastClaimedAt[user] > 0) {
            uint256 elapsed = block.timestamp - userLastClaimedAt[user];
            if (elapsed > 0) {
                current += (stakedCount * elapsed * dailyRewardRate) / 1 days;
            }
        }
        return current;
    }

    // ── Internal Functions ────────────────────────────────────────────────────

    /// @dev Accrues passive rewards and resets harvest timestamp.
    function _harvest(address user) internal {
        uint256 stakedCount = userStakedBalance[user];
        if (stakedCount > 0 && userLastClaimedAt[user] > 0) {
            uint256 elapsed = block.timestamp - userLastClaimedAt[user];
            if (elapsed > 0) {
                unclaimedPoints[user] += (stakedCount * elapsed * dailyRewardRate) / 1 days;
            }
        }
        userLastClaimedAt[user] = block.timestamp;
    }

    /**
     * @dev Core swap handler:
     *  1. Pull input tokens from user
     *  2. Approve entrypoint exactly
     *  3. Delegate swap to entrypoint (output goes directly to receiver)
     *  4. Reset approval + refund any returned ETH
     *  5. Award Lit Diamonds (with NFT boost if staked)
     */
    function _executeSwapAndRecord(
        SwapIntent   calldata swapIntent,
        FeeCollection calldata feeCollection,
        bytes         calldata program,
        address       receiver
    ) internal returns (uint256 amountOut) {
        bool isNativeIn = (swapIntent.tokenUserSells == address(0));

        if (!isNativeIn) {
            IERC20(swapIntent.tokenUserSells).safeTransferFrom(
                msg.sender, address(this), swapIntent.amountUserSells
            );
            IERC20(swapIntent.tokenUserSells).approve(entrypoint, swapIntent.amountUserSells);
        } else {
            if (msg.value < swapIntent.amountUserSells) {
                revert AGGFlowPointsWrapper_InsufficientETH();
            }
        }

        // Snapshot ETH balance before swap (pre-existing balance, excluding msg.value)
        uint256 ethBefore = isNativeIn
            ? (address(this).balance - msg.value)
            : address(this).balance;

        uint256 nativeValue = isNativeIn ? swapIntent.amountUserSells : 0;
        amountOut = IAGGFlowEntrypoint(entrypoint).executeSwapWithReceiver{ value: nativeValue }(
            swapIntent, feeCollection, program, receiver
        );

        if (!isNativeIn) {
            IERC20(swapIntent.tokenUserSells).approve(entrypoint, 0);
        } else {
            uint256 ethAfter = address(this).balance;
            if (ethAfter > ethBefore) {
                uint256 refund = ethAfter - ethBefore;
                (bool ok,) = payable(msg.sender).call{ value: refund }("");
                if (!ok) revert AGGFlowPointsWrapper_ETHRefundFailed();
            }
        }

        uint256 points = basePointsPerSwap;
        if (userStakedBalance[msg.sender] > 0) {
            points = points * nftMultiplier;
        }
        unclaimedPoints[msg.sender] += points;

        emit SwapExecuted(
            msg.sender, receiver,
            swapIntent.tokenUserSells, swapIntent.tokenUserBuys,
            swapIntent.amountUserSells, amountOut, points
        );
    }

    // ── ERC721 Receiver ───────────────────────────────────────────────────────

    /// @notice Accepts only the configured NFT — rejects all other tokens.
    function onERC721Received(
        address, address, uint256, bytes calldata
    ) external view returns (bytes4) {
        require(msg.sender == nftAddress, "Only Athes Super Contributor NFT accepted");
        return this.onERC721Received.selector;
    }

    // ── Admin Setters ─────────────────────────────────────────────────────────

    function setNftAddress(address _nftAddress) external onlyOwner {
        if (_nftAddress == address(0)) revert AGGFlowPointsWrapper_ZeroAddress();
        address old = nftAddress;
        nftAddress  = _nftAddress;
        emit NFTAddressUpdated(old, _nftAddress);
    }

    function setEntrypoint(address _entrypoint) external onlyOwner {
        if (_entrypoint == address(0)) revert AGGFlowPointsWrapper_ZeroAddress();
        address old  = entrypoint;
        entrypoint   = _entrypoint;
        emit EntrypointUpdated(old, _entrypoint);
    }

    function setPointsConfig(
        uint256 _basePoints,
        uint256 _multiplier,
        uint256 _dailyRewardRate
    ) external onlyOwner {
        if (_basePoints     > MAX_BASE_POINTS) revert AGGFlowPointsWrapper_BasePointsTooHigh();
        if (_multiplier     > MAX_MULTIPLIER)  revert AGGFlowPointsWrapper_MultiplierTooHigh();
        if (_dailyRewardRate > MAX_DAILY_RATE) revert AGGFlowPointsWrapper_DailyRateTooHigh();

        basePointsPerSwap = _basePoints;
        nftMultiplier     = _multiplier;
        dailyRewardRate   = _dailyRewardRate;
        emit PointsConfigUpdated(_basePoints, _multiplier, _dailyRewardRate);
    }

    function setRewardToken(address _rewardToken, bool _isMintable) external onlyOwner {
        rewardToken           = _rewardToken;
        isRewardTokenMintable = _isMintable;
        emit RewardTokenUpdated(_rewardToken, _isMintable);
    }

    function setGameSigner(address _gameSigner) external onlyOwner {
        if (_gameSigner == address(0)) revert AGGFlowPointsWrapper_ZeroAddress();
        address old = gameSigner;
        gameSigner = _gameSigner;
        emit GameSignerUpdated(old, _gameSigner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    receive() external payable {}
}
