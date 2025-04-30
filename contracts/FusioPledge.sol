// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title Fusio Pledging Contract
 * @author Pixellete Tech
 * @notice Handles token pledging, tiered rewards distribution, and monthly reward claiming
 * @dev Implements double-tiered APR logic, months-based claiming, and admin-controlled configurations
 */
contract FusioPledge is Initializable, EIP712Upgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    using ECDSA for bytes32;
    
    /**
     * @notice Struct to represent a user's active pledge
     * @dev Tracks pledge timing, amount, rewards, claimed rewards and claim status
     */
    struct Pledge {
        bytes32 id; // Unique pledge Identifier
        uint256 amount; // Amounts of tokens pledged
        uint256 startTime; // Timestamp when pledge started
        uint256 endTime; // Timestamp when pledge ends
        uint256 interval; // Duration of the pledge
        uint256 totalRewards; // Total rewards calculated for the pledge
        uint256 monthlyRewards; // Monthly reward a user can calim
        uint256 claimedRewards; // Rewards already claimed
        uint256 lastClaimedEpoch; // Last epoch in which rewards were claimed
        bool isPledgeEnded; // Flag to indicate if pledge has ended
    }

    /**
     * @notice Struct defining a tier with APR and active status
     */
    struct Tier {
        uint256 apr; // Annual Percentage Rate for the tier in BPS (e.g., 1600 for 16%).
        bool isActive; //flag to indicate if tier is active
    }

    uint256 private constant EPOCH_DURATION = 30 days; //30 days for mainnet
    bytes32 private constant PLEDGE_TYPEHASH = keccak256(
        "Pledge(address user,address token,uint256 amount,uint256 interval,bytes32 id,bytes32 status,bytes32 salt)"
    );
    bytes32 private constant CLAIM_TYPEHASH = keccak256(
        "Claim(address user,address token,uint256 amount,uint256 interval,bytes32 id,bytes32 status,bytes32 salt,uint256 expiry)"
    );
    uint256 private constant MIN_INTERVAL = 30; //1 month
    uint256 private constant MAX_APR = 30000; // 300% in BPS (Basis Points)
    uint256 private constant MAX_INTERVAL = 365 days;
    uint256 private constant BPS_DENOMINATOR = 10000;
    uint256 private constant MONTHS_IN_YEAR = 12;

    // uint256 private constant MIN_INTERVAL = 30; //mainnet
    // uint256 private constant MAX_INTERVAL = 365 days; //mainnet
    /**
     * @notice The ERC20 token that users can pledge
     */
    IERC20 public token;

    /**
     * @notice Mapping of user addresses to their pledge information
     */
    mapping(address => Pledge) public pledges;

    /**
     * @notice Mapping of signer addresses approved to sign off-chain messages
     */
    mapping(uint256 => Tier) public tiers;

    /**
     * @notice Mapping of signer addresses approved to sign off-chain messages
     */
    mapping(address => bool) public isSigner;

    /**
     * @notice Mapping of used salts to prevent replay attacks in signature verification
     */
    mapping(bytes32 => bool) public usedSalts;

    /**
     * @dev Storage gap for future upgrades
     * @custom:oz-upgrades-unsafe-allow state-variable-immutable
     * state-variable-assignment 
     */ 
    uint256[50] private __gap;

    event Pledged(
        address indexed user,
        bytes32 id,
        uint256 amount,
        uint256 interval,
        bytes32 status,
        uint256 intervalApr,
        uint256 monthlyApr,
        uint256 startTime
    );
    event Claimed(
        address indexed user,
        bytes32 id,
        uint256 amount,
        uint256 interval,
        bytes32 status,
        uint256 rewards,
        uint256 monthsPassed,
        uint256 timestamp
    );
    event TierSet(uint256 indexed interval, uint256 apr, bool status);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event IntervalAprUpdated(uint256 indexed interval, uint256 apr);
    event IntervalStatusUpdated(uint256 indexed interval, bool status);
    event EmergencyWithdraw(address indexed account, uint256 amount);

    error InvalidInput();
    error TierInactive();
    error MonthlyTierInactive();
    error TierIsActive();
    error SaltAlreadyUsed();
    error PledgeBalanceTooLow();
    error InsufficientRewardPool();
    error InsufficientBalance();
    error SignatureExpired();
    error PledgeNotFound();
    error PledgeEnded();
    error TooEarlyToClaim();
    error NoRewardsLeft();
    error InvalidSigner();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _tokenAddress
        ) public initializer {
        if (_tokenAddress == address(0)) revert InvalidInput();

        __EIP712_init("FusioPledge", "1");
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();  // Initialize UUPSUpgradeable

        token = IERC20(_tokenAddress);
    }

    /**
     * @notice Pledge user tokens for a specific interval tier after off-chain authorization.
     * @dev Validates backend EIP712 signature and stores pledge data on-chain.
     * @param _encodedData ABI-encoded: (amount, interval, id, status, salt) — generated by backend based on user-selected amount.
     * @param _signature EIP712 signature from backend authorizing the pledge.
     *
     * Reverts if: tier is inactive, salt is reused, signature is invalid, or user has insufficient token balance.
     */
    function pledge(bytes calldata _encodedData, bytes memory _signature) external whenNotPaused{  
        (uint256 amount, uint256 interval, bytes32 id, bytes32 status, bytes32 salt) = 
        abi.decode(_encodedData, (uint256, uint256, bytes32, bytes32, bytes32));

        if (id == bytes32(0) || status == bytes32(0) || salt == bytes32(0) || amount == 0 || interval == 0) revert InvalidInput();

        Tier storage tier = tiers[interval];

        if (!tier.isActive) revert TierInactive();
        if (!tiers[30].isActive || tiers[30].apr == 0) revert MonthlyTierInactive(); 
        if (usedSalts[salt]) revert SaltAlreadyUsed();
        if (token.balanceOf(msg.sender) < amount) revert PledgeBalanceTooLow();

        usedSalts[salt] = true;

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            PLEDGE_TYPEHASH,
            msg.sender,
            token,
            amount,
            interval,
            id,
            status,
            salt
        )));

        address signer = ECDSA.recover(digest, _signature);
        if (!isSigner[signer]) revert InvalidSigner();

        uint256 startTime = block.timestamp;
        uint256 duration = interval * 1 days; //days for mainnet
        uint256 endTime = startTime + duration; //for mainnet use days;
        uint256 totalRewards = calculateTotalRewards(amount, tier.apr, duration);//for testnet
        uint256 monthlyRewards = calculateMonthlyRewards(amount, tiers[30].apr); //for testent

        pledges[msg.sender] = Pledge({
            id: id,
            amount: amount,
            startTime: startTime,
            endTime: endTime,
            interval:duration,
            totalRewards: totalRewards,
            monthlyRewards: monthlyRewards,
            claimedRewards: 0,
            lastClaimedEpoch: 0,
            isPledgeEnded: false
        });

        emit Pledged(msg.sender, id, amount, interval, status, tier.apr , tiers[30].apr, startTime);      
    }

    /**
     * @notice Claim eligible rewards from an active pledge using off-chain authorization.
     * @dev Verifies backend EIP712 signature, signature expiry, validates epochs/months, and updates claimed reward state.
     * @param _encodedData ABI-encoded: (amount, interval, id, status, salt) — generated by backend per user context.
     * @param _signature EIP712 signature from backend authorizing the claim.
     *
     * Reverts if: pledge not found or ended, salt reused, signature invalid, too early to claim,
     * no rewards left, user has inufficient token balance or contract reward pool is insufficient.
     */
    function claimRewards(bytes calldata _encodedData, bytes memory _signature) external nonReentrant whenNotPaused {
        (uint256 amount, uint256 interval, bytes32 id, bytes32 status, bytes32 salt, uint256 expiry) =
        abi.decode(_encodedData, (uint256, uint256, bytes32, bytes32, bytes32, uint256));

        if (amount == 0 || id == bytes32(0) || status == bytes32(0) || salt == bytes32(0) || interval == 0 || expiry == 0) revert InvalidInput();
        if (usedSalts[salt]) revert SaltAlreadyUsed();

        Pledge storage userPledge = pledges[msg.sender];

        if (id != userPledge.id) revert PledgeNotFound();
        if (userPledge.isPledgeEnded) revert PledgeEnded();
        if (token.balanceOf(msg.sender) < amount) revert PledgeBalanceTooLow();
        if (block.timestamp < userPledge.startTime + EPOCH_DURATION) revert TooEarlyToClaim();
        if (userPledge.totalRewards <= userPledge.claimedRewards) revert NoRewardsLeft();

        usedSalts[salt] = true;

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            CLAIM_TYPEHASH,
            msg.sender,
            token,
            amount,
            interval,
            id,
            status,
            salt,
            expiry
        )));

        address signer = ECDSA.recover(digest, _signature);

        if (!isSigner[signer]) revert InvalidSigner();
        if (block.timestamp > expiry) revert SignatureExpired();

        (uint256 epochsPassed, uint256 claimableRewards, bool isEnded) = calculateRewards(msg.sender);

        if (token.balanceOf(address(this)) < claimableRewards) revert InsufficientRewardPool();

        userPledge.claimedRewards += claimableRewards;
        userPledge.lastClaimedEpoch = epochsPassed;

        if (isEnded == true) {
            userPledge.isPledgeEnded = true;
        }

        token.transfer(msg.sender, claimableRewards);

        emit Claimed(msg.sender, id, amount, interval, status, claimableRewards, epochsPassed, block.timestamp);
    }
    
    /**
     * @notice Initializes a new pledge tier. Only callable by the contract owner.
     * @dev Reverts if the tier already exists or input parameters are invalid.
     * @param _interval Duration of the tier in days (minimum 30) expressed as whole number(e.g., 30 for 30days).
     * @param _apr APR assigned to the tier, expressed in BPS (e.g., 1600 for 16%).
     * @param _isActive Boolean flag to activate the tier upon creation.
     */
    function setTier(
        uint256 _interval,
        uint256 _apr,
        bool _isActive
    ) external onlyOwner { 
        if (_apr == 0 || _interval < MIN_INTERVAL || _apr > MAX_APR) revert InvalidInput(); 
        
        Tier storage tier = tiers[_interval];
        if (tier.isActive) revert TierIsActive();
        
        tiers[_interval] = Tier({
            apr: _apr,
            isActive: _isActive
        });

        emit TierSet(_interval, _apr, _isActive);
    }

    /**
     * @notice Updates the APR of an existing tier. Only callable by the contract owner.
     * @dev Reverts if tier is inactive or parameters are invalid.
     * @param _interval Duration of the tier whose APR is being updated.
     * @param _apr New APR value, expressed as BPS (e.g., 1600 for 16%).
     */
    function setTierAPR(uint256 _interval, uint256 _apr) external onlyOwner {
        if (_interval == 0 || _apr == 0 || _apr > MAX_APR) revert InvalidInput();

        Tier storage tier = tiers[_interval];
        if (!tier.isActive) revert TierInactive();

        tier.apr = _apr;
        emit IntervalAprUpdated(_interval, _apr);
    }

    /**
     * @notice Updates the status of an existing tier. Only callable by the contract owner.
     * @dev Reverts if the new status is the same as the current one.
     * @param _interval Duration of the tier whose status is being updated.
     * @param _status New status for the tier (active/inactive).
     */
    function setTierStatus(uint256 _interval, bool _status) external onlyOwner {
        Tier storage tier = tiers[_interval];
        if (tier.isActive == _status) revert InvalidInput();

        tier.isActive = _status;
        emit IntervalStatusUpdated(_interval, _status);
    }

    /**
     * @notice Adds a backend signer. Only callable by the contract owner.
     * @param _signer Address of the signer to be added.
     */
    function addSigner(address _signer) external onlyOwner {
        if (_signer == address(0)) revert InvalidInput();

        isSigner[_signer] = true;
        emit SignerAdded(_signer);
    }

    /**
     * @notice Removes a backend signer. Only callable by the contract owner.
     * @param _signer Address of the signer to be removed.
     */
    function removeSigner(address _signer) external onlyOwner {
        if (_signer == address(0)) revert InvalidInput();
        if (!isSigner[_signer]) revert InvalidInput();

        isSigner[_signer] = false;
        emit SignerRemoved(_signer);
    }
    
    /**
     * @notice Withdraws tokens from the contract in case of emergency.
     * @dev Only callable by the contract owner.
     * @param _wallet Address to receive the withdrawn tokens.
     * @param _amount Amount of tokens to withdraw.
     */
    function emergencyWithdraw(address _wallet, uint256 _amount) external onlyOwner {
        if (token.balanceOf(address(this)) < _amount) revert InsufficientBalance();

        token.transfer(_wallet, _amount);
        emit EmergencyWithdraw(_wallet, _amount);
    }

    /**
     * @notice Pauses the contract, preventing certain functions from being executed.
     */
    function pausePledging() external onlyOwner {
        _pause();
    }
    /**
     * @notice Unpauses the contract, allowing functions to be executed again.
     */
    function unpausePledging() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Required function for UUPSUpgradeable to restrict upgraded to only owner.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(newImplementation != address(0), "Invalid address");
    }

    /** 
     * @notice Helper function to calculate the claimable rewards for a user based on elapsed epochs.
     * @dev used for calculating the total rewards claimable by the user based on their pledge status, 
     * and the number of epochs passed.
     * @param _user The address of the user whose rewards are being calculated.
     * @return epochsPassed The total number of epochs (time periods) that have passed since the pledge started.
     * @return claimableReward The amount of rewards the user can claim in the current epoch.
     * @return isEnded A boolean indicating whether the pledge has ended and all rewards have been claimed.
     */
    function calculateRewards(address _user) public view returns (uint256 , uint256, bool) {
        Pledge storage userPledge = pledges[_user];
                
        if (userPledge.id == bytes32(0) || userPledge.isPledgeEnded) revert PledgeNotFound();

        uint256 epochsPassed = (block.timestamp - userPledge.startTime) / EPOCH_DURATION;
        uint256 claimableEpochs = epochsPassed - userPledge.lastClaimedEpoch;

        if (claimableEpochs == 0) revert TooEarlyToClaim();

        uint256 claimableReward = (claimableEpochs * userPledge.monthlyRewards);
        bool isEnded = false;
        uint256 remainingRewards = userPledge.totalRewards - userPledge.claimedRewards;

        if (epochsPassed * 1 days >= userPledge.interval || claimableReward > remainingRewards){
            claimableReward = remainingRewards;
            isEnded = true;
        }
    
        return (epochsPassed, claimableReward, isEnded);
    }

    /**
     * @notice Helper function to calculate the total rewards based on amount, APR, and duration of interval.
     * @param _amount The amount of tokens the user pledged.
     * @param _apr The annual percentage rate (APR) applied to the pledge.
     * @param _duration The duration of the pledge, in seconds.
     * @return The total rewards that will be distributed to the user.
     */
    function calculateTotalRewards(
        uint256 _amount,
        uint256 _apr,
        uint256 _duration //in seconds
    ) public pure returns (uint256) {
        return (_amount * _apr * _duration) / (MAX_INTERVAL * BPS_DENOMINATOR);
    }

    /**
     * @notice Helper function to calculate the monthly rewards for a user based on their pledge amount and monthly APR.
     * @param _amount The amount of tokens the user pledged.
     * @param _apr The annual percentage rate (APR) applied to the pledge.
     * @return The monthly reward amount for the user pledge.
     */
    function calculateMonthlyRewards(
        uint256 _amount,
        uint256 _apr
    ) public pure returns (uint256) {
        return (_amount * _apr) / (MONTHS_IN_YEAR * BPS_DENOMINATOR);
    }
}