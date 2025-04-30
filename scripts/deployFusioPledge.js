const hre = require("hardhat");

async function main() {
    const fusioToken = "0x91E4096B0af686a6c1aac303fcf98cAdB82F4089"; 
    const fusioPledge =  await hre.ethers.getContractFactory("contracts/FusioPledge.sol:FusioPledge");
    console.log("Deployment started");
    const FusioPledge =  await upgrades.deployProxy(fusioPledge, [fusioToken], {
        initializer: "initialize",
    });
    // const FusioPledge = await upgrades.upgradeProxy("address", FusioPledgeV2);
    await FusioPledge.waitForDeployment();
    const deployedAddress = await FusioPledge.getAddress();
    console.log("Fusio pledging contract deployed to", deployedAddress);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});