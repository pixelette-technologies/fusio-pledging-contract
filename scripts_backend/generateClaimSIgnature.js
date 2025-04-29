const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("🚀 Starting process...");

    const fusioPledgeAddress = "0x76996B33d097618ce96bDdda870398C50c81c4d9"; // replace this with the current deployed address
    const provider = new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL); //replace this with the current rpc url
    
    const backendSigner = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY, provider); // replace this with verified signer the wallet who will sign the message
    const userSigner = new ethers.Wallet(process.env.USER_KEY, provider); // User wallet address in case directly intercating through the script

    console.log("📌 Backend Signer:", backendSigner.address); 
    console.log("📌 User Signer:", userSigner.address);

    const user = backendSigner.address; 
    const token = "0x91E4096B0af686a6c1aac303fcf98cAdB82F4089"; // Token Address //replace for mainnet
    const amount = ethers.parseEther("10"); // 10 Tokens
    const interval = 12; //minutes
   
    // const id = "0x9c0127535a91e38e0fcf4b8ba187c3b466864eafc4d2971dcc832a1acf1102cc";  //while claimimg use this one and replace with the id you used for pledge should be smae one
    const id = ethers.keccak256(ethers.toUtf8Bytes(Date.now().toString() + Math.random().toString())); //make it same the id for the pledge if pledge against that user exists
    const status = ethers.keccak256(ethers.toUtf8Bytes("active"));
    const salt = ethers.keccak256(ethers.toUtf8Bytes("salt-" + Math.random().toString()));
    const expiry = 1745584285;

    console.log("📌 Generated Pledge Data:", { id, status, salt });

    const domain = {
        name: "FusioPledge",
        version: "1",
        chainId: 97, // change it to the mainnet id 56
        verifyingContract: fusioPledgeAddress,
    };

    const types = {
        Claim: [
            { name: "user", type: "address" },
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "interval", type: "uint256" },
            { name: "id", type: "bytes32" },
            { name: "status", type: "bytes32" },
            { name: "salt", type: "bytes32" },
            { name: "expiry", type: "uint256"},
        ]
    };

    const pledgeData = { user, token, amount, interval, id, status, salt, expiry };

    console.log("📌 Pledge Data:", pledgeData);

    const signature = await backendSigner.signTypedData(domain, types, pledgeData);
    console.log("✍️ Signature:", signature);

    const recoveredSigner = ethers.verifyTypedData(domain, types, pledgeData, signature);
    console.log("🔍 Recovered Signer:", recoveredSigner);

    if (recoveredSigner.toLowerCase() !== backendSigner.address.toLowerCase()) {
        throw new Error("❌ Signature verification failed!");
    }

    const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
        [ "uint256", "uint256", "bytes32", "bytes32", "bytes32", "uint256"],
        [ amount, interval, id, status, salt, expiry]
    );
    console.log("Encoded Data:", encodedData);
    
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        [ "uint256", "uint256", "bytes32", "bytes32", "bytes32", "uint256"],
        encodedData
    );
    console.log("Decoded Interval:", decoded[1].toString());
    console.log("Decoded amount:", decoded[0].toString());
    console.log("Decoded id:", decoded[2].toString());
    console.log("Decoded status:", decoded[3].toString());
    console.log("Decoded salt:", decoded[4].toString());
    console.log("Decoded status:", decoded[5].toString());
}

main().catch((error) => {
    console.error("🚨 Fatal Error:", error);
    process.exit(1);
});
