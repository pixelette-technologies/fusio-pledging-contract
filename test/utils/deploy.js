const { ethers, upgrades } = require("hardhat");

async function deployFusioPledge() {
  console.log("Fetching signers...");

  const [owner, addr1, addr2, ...others] = await ethers.getSigners();
  console.log("Got signers:", owner.address);

  // Deploy Token
  const Token = await ethers.getContractFactory("MockToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenDeployedAddress = await token.getAddress();
  console.log("🚀 ~ deployFusioPledge ~ tokenDeployedAddress:", tokenDeployedAddress)

  // Deploy FusioPledge
  const FusioPledge = await ethers.getContractFactory("FusioPledge");
  const fusioPledge = await upgrades.deployProxy(FusioPledge, [tokenDeployedAddress], {
    initializer: "initialize",
  });
  await fusioPledge.waitForDeployment();
  const fusioPledgeDeployedAddress = await fusioPledge.getAddress();
  console.log("🚀 ~ deployFusioPledge ~ fusioPledgeDeployedAddress:", fusioPledgeDeployedAddress)

  const amountToTransfer = ethers.parseEther("1000000"); 
  await token.connect(owner).transfer(fusioPledgeDeployedAddress, amountToTransfer);
  console.log(`Transferred ${amountToTransfer} tokens to FusioPledge contract at ${fusioPledgeDeployedAddress}`);

  return {
    owner,
    addr1,
    addr2,
    token,
    fusioPledge,
    others
  };
}

async function setupUserTokens(token, user, amount) {
  await token.transfer(user.address, ethers.parseEther(amount));
  await token.connect(user).approve(user.address, ethers.parseEther(amount));
}


module.exports = {
  deployFusioPledge,
  setupUserTokens
};
