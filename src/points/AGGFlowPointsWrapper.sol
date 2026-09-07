// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeTransferLib } from "solady/utils/SafeTransferLib.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { SwapIntent, FeeCollection } from "src/entrypoint/AGGFlowEntrypointTypes.sol";

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
 * @notice Upgradeable wrapper contract for AGGFlowEntrypoint that records swap points (Lit Diamonds).
 *         Supports NFT staking where staked users get 20x swap points and 200 passive points per day.
 */
contract AGGFlowPointsWrapper is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeTransferLib for address;

    // State Variables
    address public entrypoint;
    address public nftAddress;
    
    // Configurable points parameters (18 decimals representation)
    uint256 public basePointsPerSwap;
    uint256 public nftMultiplier;

    // Point records
    mapping(address => uint256) public unclaimedPoints;
    mapping(address => uint256) public claimedPoints;

    // Reward token configuration
    address public rewardToken;
    bool public isRewardTokenMintable;

    // NFT Staking State Variables
    uint256 public dailyRewardRate; // Passive reward per staked NFT per day (e.g., 200 * 10**18)
    mapping(address => uint256) public userStakedBalance; // Total NFTs staked by a user
    mapping(address => uint256) public userLastClaimedAt; // Last time passive rewards were harvested
    mapping(uint256 => address) public tokenStakers; // Mapping from tokenId to staker address

    // Events
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
    event PointsConfigUpdated(uint256 basePoints, uint256 multiplier, uint256 dailyRewardRate);
    event RewardTokenUpdated(address indexed newRewardToken, bool isMintable);

    // Custom errors
    error AGGFlowPointsWrapper_InsufficientETH();
    error AGGFlowPointsWrapper_NotTokenStaker();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer function to set up the upgradeable contract.
     */
    function initialize(
        address _owner,
        address _entrypoint,
        address _nftAddress,
        address _rewardToken,
        bool _isRewardTokenMintable
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        // Custom owner assignment
        _transferOwnership(_owner);

        entrypoint = _entrypoint;
        nftAddress = _nftAddress;
        rewardToken = _rewardToken;
        isRewardTokenMintable = _isRewardTokenMintable;

        // Default configurations
        basePointsPerSwap = 1 * 10**18;      // 1 Lit Diamond per swap
        nftMultiplier = 20;                  // 20x multiplier when staked
        dailyRewardRate = 200 * 10**18;      // 200 Lit Diamonds per day passive staking reward
    }

    /**
     * @notice Swap tokens, get output tokens, and accumulate swap points.
     */
    function executeSwap(
        SwapIntent calldata swapIntent,
        FeeCollection calldata feeCollection,
        bytes calldata program
    ) external payable returns (uint256 amountOut) {
        return _executeSwapAndRecord(swapIntent, feeCollection, program, msg.sender);
    }

    /**
     * @notice Swap tokens, send output to a specific receiver, and accumulate swap points for the sender.
     */
    function executeSwapWithReceiver(
        SwapIntent calldata swapIntent,
        FeeCollection calldata feeCollection,
        bytes calldata program,
        address receiver
    ) external payable returns (uint256 amountOut) {
        return _executeSwapAndRecord(swapIntent, feeCollection, program, receiver);
    }

    /**
     * @notice Claims all accumulated points (both from swaps and passive staking rewards).
     */
    function claimPoints() external nonReentrant {
        _harvest(msg.sender);

        uint256 amount = unclaimedPoints[msg.sender];
        require(amount > 0, "No points to claim");

        unclaimedPoints[msg.sender] = 0;
        claimedPoints[msg.sender] += amount;

        if (rewardToken != address(0)) {
            if (isRewardTokenMintable) {
                // Expects this contract to have MINT role or be Owner of rewardToken
                (bool success, ) = rewardToken.call(
                    abi.encodeWithSignature("mint(address,uint256)", msg.sender, amount)
                );
                require(success, "Reward token minting failed");
            } else {
                SafeTransferLib.safeTransfer(rewardToken, msg.sender, amount);
            }
        }

        emit PointsClaimed(msg.sender, amount);
    }

    // ==================== STAKING FUNCTIONS ====================

    /**
     * @notice Stakes an NFT to get 20x swap multiplier and 200 passive points per day.
     * @param tokenId The ID of the bridged NFT to stake.
     */
    function stakeNFT(uint256 tokenId) external nonReentrant {
        // Harvest existing passive rewards first
        _harvest(msg.sender);

        // Record staker info
        tokenStakers[tokenId] = msg.sender;
        userStakedBalance[msg.sender] += 1;

        // Transfer NFT from user to this contract
        IERC721(nftAddress).safeTransferFrom(msg.sender, address(this), tokenId);

        emit NFTStaked(msg.sender, tokenId);
    }

    /**
     * @notice Unstakes an NFT and claims any accumulated points.
     * @param tokenId The ID of the staked NFT to withdraw.
     */
    function unstakeNFT(uint256 tokenId) external nonReentrant {
        if (tokenStakers[tokenId] != msg.sender) {
            revert AGGFlowPointsWrapper_NotTokenStaker();
        }

        // Harvest passive rewards before state change
        _harvest(msg.sender);

        // Update state
        delete tokenStakers[tokenId];
        userStakedBalance[msg.sender] -= 1;

        // Transfer NFT back to user
        IERC721(nftAddress).safeTransferFrom(address(this), msg.sender, tokenId);

        emit NFTUnstaked(msg.sender, tokenId);
    }

    /**
     * @notice Helper to fetch total unclaimed points including accrued staking rewards in real-time.
     */
    function getUnclaimedPoints(address user) public view returns (uint256) {
        uint256 currentUnclaimed = unclaimedPoints[user];
        uint256 stakedCount = userStakedBalance[user];
        
        if (stakedCount > 0) {
            uint256 timeElapsed = block.timestamp - userLastClaimedAt[user];
            if (timeElapsed > 0) {
                currentUnclaimed += (stakedCount * timeElapsed * dailyRewardRate) / 1 days;
            }
        }
        return currentUnclaimed;
    }

    // ==================== INTERNAL FUNCTIONS ====================

    /**
     * @dev Updates the user's unclaimed points with their accumulated staking rewards.
     */
    function _harvest(address user) internal {
        uint256 stakedCount = userStakedBalance[user];
        if (stakedCount > 0) {
            uint256 timeElapsed = block.timestamp - userLastClaimedAt[user];
            if (timeElapsed > 0) {
                uint256 reward = (stakedCount * timeElapsed * dailyRewardRate) / 1 days;
                unclaimedPoints[user] += reward;
            }
        }
        userLastClaimedAt[user] = block.timestamp;
    }

    /**
     * @dev Internal swap handler. Intercepts tokens, performs swap via aggregator, refunds, and updates points.
     */
    function _executeSwapAndRecord(
        SwapIntent calldata swapIntent,
        FeeCollection calldata feeCollection,
        bytes calldata program,
        address receiver
    ) internal returns (uint256 amountOut) {
        // 1. Transfer selling tokens from user to this contract (except native token)
        if (swapIntent.tokenUserSells != address(0)) {
            SafeTransferLib.safeTransferFrom(
                swapIntent.tokenUserSells,
                msg.sender,
                address(this),
                swapIntent.amountUserSells
            );
            SafeTransferLib.safeApprove(
                swapIntent.tokenUserSells,
                entrypoint,
                swapIntent.amountUserSells
            );
        } else {
            if (msg.value < swapIntent.amountUserSells) {
                revert AGGFlowPointsWrapper_InsufficientETH();
            }
        }

        // 2. Setup values and initial ETH balance (to verify refunds)
        uint256 value = swapIntent.tokenUserSells == address(0) ? swapIntent.amountUserSells : 0;
        uint256 initialEthBalance = address(this).balance - msg.value;

        // 3. Execute swap through the aggregator entrypoint
        amountOut = IAGGFlowEntrypoint(entrypoint).executeSwapWithReceiver{ value: value }(
            swapIntent,
            feeCollection,
            program,
            receiver
        );

        // 4. Reset approval or refund excess native token
        if (swapIntent.tokenUserSells != address(0)) {
            SafeTransferLib.safeApprove(swapIntent.tokenUserSells, entrypoint, 0);
        } else {
            uint256 currentEthBalance = address(this).balance;
            if (currentEthBalance > initialEthBalance) {
                uint256 refundAmount = currentEthBalance - initialEthBalance;
                SafeTransferLib.safeTransferETH(msg.sender, refundAmount);
            }
        }

        // 5. Update user points (boost check: checks if user has staked NFTs)
        uint256 points = basePointsPerSwap;
        if (userStakedBalance[msg.sender] > 0) {
            points = points * nftMultiplier;
        }
        
        unclaimedPoints[msg.sender] += points;

        emit SwapExecuted(
            msg.sender,
            receiver,
            swapIntent.tokenUserSells,
            swapIntent.tokenUserBuys,
            swapIntent.amountUserSells,
            amountOut,
            points
        );
    }

    /**
     * @notice Required to handle receiving ERC721 tokens safely when staking.
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external view returns (bytes4) {
        require(msg.sender == nftAddress, "Only configured NFT accepted");
        return this.onERC721Received.selector;
    }

    // ==================== OWNER CONFIGURATIONS ====================

    function setNftAddress(address _nftAddress) external onlyOwner {
        nftAddress = _nftAddress;
        emit NFTAddressUpdated(nftAddress, _nftAddress);
    }

    function setPointsConfig(
        uint256 _basePoints,
        uint256 _multiplier,
        uint256 _dailyRewardRate
    ) external onlyOwner {
        basePointsPerSwap = _basePoints;
        nftMultiplier = _multiplier;
        dailyRewardRate = _dailyRewardRate;
        emit PointsConfigUpdated(_basePoints, _multiplier, _dailyRewardRate);
    }

    function setRewardToken(address _rewardToken, bool _isMintable) external onlyOwner {
        rewardToken = _rewardToken;
        isRewardTokenMintable = _isMintable;
        emit RewardTokenUpdated(_rewardToken, _isMintable);
    }

    function setEntrypoint(address _entrypoint) external onlyOwner {
        entrypoint = _entrypoint;
    }

    /**
     * @dev Required override for UUPS upgrade authorization.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // Required to receive ETH refunds
    receive() external payable {}
}
