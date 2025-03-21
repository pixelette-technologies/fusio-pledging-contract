// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";

contract FusioPledge is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, EIP712Upgradeable {
    using ECDSA for bytes32;

    bytes32 private constant PLEDGE_CLAIM_TYPEHASH = keccak256(
        "Pledge(address user,address token,uint256 amount,uint256 interval, bytes32 id,bytes32 status,bytes32 salt)"
    );

    IERC20 public token;
    mapping(address => Pledge) public pledges;
    mapping(uint256 => Tier) public tiers;
    mapping(address => bool) public isSigner;
    mapping(bytes32 => bool) public usedSalts;
    
    struct Pledge {
        uint256 amount;
        uint256 startTime;
        uint256 endTime;
        uint256 interval;
        uint256 totalRewards;
        bytes32 id;
    }

    struct Tier {
        uint256 id;
        uint256 apr;
        bool isActive;
    }

    event Pledged(address indexed user, bytes32 id, uint256 amount, uint256 interval, bytes32 status, uint256 startTime, uint256 endTime);
    event Claimed(address indexed user, bytes32 id, uint256 amount, uint256 interval, bytes32 status, uint256 rewards, uint256 timestamp);
    event TierSet(uint256 indexed tierId, uint256 interval, uint256 apr, bool isActive);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event PledgeCancelled(address indexed user);
    
    function initialize(
        address _tokenAddress
        ) public initializer {
         __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __EIP712_init("FusioPledge", "1");

        token = IERC20(_tokenAddress);
    }

    function pledge(bytes calldata _encodedData, bytes memory _signature) external {
        (uint256 amount, uint256 interval, bytes32 id, bytes32 status, bytes32 salt) = 
        abi.decode(_encodedData, (uint256, uint256, bytes32, bytes32, bytes32));

        require(amount != 0, "invalid Amount");
        require(id != bytes32(0), "invalid id");
        require(status != bytes32(0), "invalid status");
        require(salt != bytes32(0), "invalid salt");
        require(tiers[interval].isActive, "invalid interval");
        require(!usedSalts[salt], "Salt already used"); // the salt itself creates a unique signature so only used salts check will be enough to have unique signature
        require(pledges[msg.sender].id != id, "Pledge already exists");
        require(token.balanceOf(msg.sender) >= amount, "Insufficient balance");

        usedSalts[salt] = true;

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            PLEDGE_CLAIM_TYPEHASH,
            msg.sender,
            address(token),
            amount,
            interval,
            id,
            status,
            salt
        )));

        address signer = ECDSA.recover(digest, _signature);
        require(isSigner[signer], "Invalid Signer");

        uint256 startTime = block.timestamp;
        uint256 duration = interval * 1 days;
        uint256 endTime = startTime + duration;
        uint256 totalRewards = (amount * tiers[interval].apr * duration) / (365 days * 100);

        pledges[msg.sender] = Pledge({
            amount: amount,  
            startTime: startTime,
            endTime: endTime,
            interval:duration,
            totalRewards: totalRewards,
            id: id
        });

        emit Pledged(msg.sender,id, amount, interval, status, startTime, endTime);      
    }

    function claim(bytes calldata _encodedData, bytes memory _signature) external nonReentrant {
        (uint256 amount, uint256 interval, bytes32 id, bytes32 status, bytes32 salt) = 
        abi.decode(_encodedData, (uint256, uint256, bytes32, bytes32, bytes32));

        require(amount != 0, "invalid Amount");
        require(id != bytes32(0), "invalid id");
        require(status != bytes32(0), "invalid status");
        require(salt != bytes32(0), "invalid salt");
        require(tiers[interval].isActive, "invalid interval");
        require(!usedSalts[salt], "Salt already used");
        require(token.balanceOf(msg.sender) >= amount, "Insufficient balance");

        Pledge storage userPledge = pledges[msg.sender];

        require(id == userPledge.id, "No Pledge exists");
        require(block.timestamp >= userPledge.endTime, "Pledge period not completed");
        require(userPledge.totalRewards > 0, "No rewards available");

        usedSalts[salt] = true;

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            PLEDGE_CLAIM_TYPEHASH,
            msg.sender,
            address(token),
            amount,
            interval,
            id,
            status,
            salt
        )));

        address signer = ECDSA.recover(digest, _signature);
        require(isSigner[signer], "Invalid Signer");

        uint256 rewards = userPledge.totalRewards;
        userPledge.totalRewards = 0;
        userPledge.id = bytes32(0);

        token.transfer(msg.sender, rewards);
        emit Claimed(msg.sender, id, amount, interval, status, rewards, block.timestamp);
    }

    function setTier(
        uint256 _tierId,
        uint256 _interval,
        uint256 _apr,
        bool _isActive
    ) external onlyOwner {
        require(_tierId != 0, "Invalid tier ID");
        require(_interval != 0, "Interval must be greater than 0");
        require(_apr <= 100, "APR too high");
        Tier storage tier = tiers[_interval];
        require(!tier.isActive, "Tier already exists");

        tiers[_interval] = Tier({
            id: _tierId,
            apr: _apr,
            isActive: _isActive
        });

        emit TierSet(_tierId, _interval, _apr, _isActive);
    }

    function setTierAPR(uint256 _interval, uint256 _apr) external onlyOwner {
        require(_apr != 0, "invalid apr");
        require(_apr <= 100, "APR too high"); //APR percentage cannot be more than 100
        Tier storage tier = tiers[_interval];
        require(tier.id != 0, "Tier does not exist");
        tier.apr = _apr;
        emit TierSet(tier.id, _interval, _apr, tier.isActive);
   }

    function setTierStatus(uint256 _interval, bool _status) external onlyOwner {
        Tier storage tier = tiers[_interval];
        require(tier.id != 0, "Tier does not exist");
        tier.isActive = _status;
        emit TierSet(tier.id, _interval, tier.apr, _status);
   }

    function addSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Bad Signer");
        isSigner[_signer] = true;
        emit SignerAdded(_signer);
    }
    function removeSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Bad Signer");
        require(isSigner[_signer], "Not a signer");
        isSigner[_signer] = false;
        emit SignerRemoved(_signer);
    }
    function cancelPledge(address _user) external onlyOwner {
        require(_user != address(0), "Invalid address");
        require(pledges[_user].amount != 0, "No active pledge");
        delete pledges[_user];
        emit PledgeCancelled(_user);  
    }

    function emergencyWithdraw(uint256 _amount) external onlyOwner {
        require(token.balanceOf(address(this)) >= _amount, "Insufficient balance");
        token.transfer(msg.sender, _amount);
    }
    //proxy amdin functions
}