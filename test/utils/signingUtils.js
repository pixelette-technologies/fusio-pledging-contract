const { ethers } = require("hardhat");

const DOMAIN = (contract, chainId) => {
  if (!ethers.isAddress(contract)) {
    throw new Error("Invalid address passed to DOMAIN");
  }
  return {
    name: "FusioPledge",
    version: "1",
    chainId,
    verifyingContract: contract,
  };
};

const getParams = async () => {
  const id = ethers.keccak256(ethers.toUtf8Bytes(Date.now().toString() + Math.random().toString()));
  const status = ethers.keccak256(ethers.toUtf8Bytes("active"));
  const salt = ethers.keccak256(ethers.toUtf8Bytes("salt-" + Math.random().toString()));
  return { id, status, salt };
}

const PLEDGE_TYPE = [
  { name: "user", type: "address" },
  { name: "token", type: "address" },
  { name: "amount", type: "uint256" },
  { name: "interval", type: "uint256" },
  { name: "id", type: "bytes32" },
  { name: "status", type: "bytes32" },
  { name: "salt", type: "bytes32" },
];

const CLAIM_TYPE = [
  { name: "user", type: "address" },
  { name: "token", type: "address" },
  { name: "amount", type: "uint256" },
  { name: "interval", type: "uint256" },
  { name: "id", type: "bytes32" },
  { name: "status", type: "bytes32" },
  { name: "salt", type: "bytes32" },
  { name: "expiry", type: "uint256" },
];

async function getSignedPledgeData({
  signer,
  user,
  token,
  amount,
  interval,
  pledgeContract,
  inValidId = false,
  inValidStatus = false,
  inValidSalt = false
}) {
  const pledgeContractAddress = await pledgeContract.getAddress()
  const provider = ethers.provider; // Access Hardhat's provider
  const chainId = (await provider.getNetwork()).chainId;
  const domain = DOMAIN(pledgeContractAddress, chainId);

  let id, status, salt;
  const { id: paramId, status: paramStatus, salt: paramSalt } = await getParams();
  inValidId ? id = ethers.ZeroHash : id = paramId;
  inValidStatus ? status = ethers.ZeroHash : status = paramStatus;
  inValidSalt ? salt = ethers.ZeroHash : salt = paramSalt;
  
  const data = {
    user: user.address,
    token: token.target,
    amount,
    interval,
    id,
    status,
    salt,
  };

  const signature = await signer.signTypedData(domain, { Pledge: PLEDGE_TYPE }, data);
  const encodedData =  ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "bytes32", "bytes32", "bytes32"],
    [amount, interval, id, status, salt]
  );

  return {
    signature,
    encodedData,
    id,
    status,
    salt
  };
}

async function getSignedClaimData({
  signer,
  user,
  token,
  amount,
  interval,
  id,
  pledgeContract,
  salt: providedSalt,
  expiryPassed = false,
  fullClaim = false
}) {
  const pledgeContractAddress = await pledgeContract.getAddress();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = DOMAIN(pledgeContractAddress, chainId);

  let status, salt;

  if (providedSalt) {
    ({ status } = await getParams());
    salt = providedSalt;
  } else {
    ({ status, salt } = await getParams());
  }

  const currentBlock = await ethers.provider.getBlock('latest');

  const expiry = fullClaim
    ? currentBlock.timestamp + 2 * 365 * 24 * 60 * 60 // Expiry in 2 years
    : expiryPassed
    ? currentBlock.timestamp - 60 // Expired 1 minute ago for preclaim
    : currentBlock.timestamp + 900; // Valid for the next 15 minutes for preclaim
  

  const value = {
    user: user.address,
    token: token.target,
    amount,
    interval,
    id,
    status,
    salt,
    expiry,
  };

  const claimSignature = await signer.signTypedData(domain, { Claim : CLAIM_TYPE }, value);

  const claimEncodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "bytes32", "bytes32", "bytes32", "uint256"],
    [amount, interval, id, status, salt, expiry]
  );

  return {
    claimSignature,
    claimEncodedData,
    status,
    salt
  };
}


module.exports = {
  DOMAIN,
  getParams,
  PLEDGE_TYPE,
  CLAIM_TYPE,
  getSignedPledgeData,
  getSignedClaimData,
};
