const hre = require("hardhat");

async function main() {
    const mockToken =  await hre.ethers.getContractFactory("contracts/MockToken.sol:MockToken");
    console.log("Deployment started");
    const MockToken =  await mockToken.deploy();
    await MockToken.waitForDeployment();
    const deployedAddress = await MockToken.getAddress();
    console.log("Mock Token deployed to", deployedAddress);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});