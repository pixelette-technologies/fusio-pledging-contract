const { ethers } = require("hardhat");
const { Wallet } = require("ethers");
require('dotenv').config();

async function generateSignature() {
    try {
        console.log("🚀 Starting signature generation...");

        const domain = {
            name: "FusioPledge",
            version: "1",
            chainId: 31337, //97, 
            verifyingContract: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" //0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 token address
        };
        console.log("✅ Domain data set:", domain);

        const types = {
            Pledge: [
                { name: "user", type: "address" },
                { name: "token", type: "address" },
                { name: "amount", type: "uint256" },
                { name: "interval", type: "uint256" },
                { name: "id", type: "bytes32" },
                { name: "status", type: "bytes32" },
                { name: "salt", type: "bytes32" }
            ]
        };

        const pledgeData = {
            user: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
            token: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
            amount: ethers.parseUnits("100", 18),
            interval: 30, //days
            id: ethers.keccak256(ethers.toUtf8Bytes("unique-id")),
            status: ethers.keccak256(ethers.toUtf8Bytes("active")),
            salt: ethers.keccak256(ethers.toUtf8Bytes("random-value"))
        };
        console.log("Pledge data created:", pledgeData);

        const privateKey = "process.env.PRIVATE_KEY_HARDHAT"; 
        if (!privateKey || privateKey.length !== 66) {
            throw new Error("Invalid or missing private key!");
        }
        const signer = new Wallet(privateKey);
        console.log("Signer initialized:", signer.address);

        const signature = await signer.signTypedData(domain, types, pledgeData);
        console.log("Signature generated:", signature);

        return signature;
    } catch (error) {
        console.error("Error generating signature:", error);
    }
}

generateSignature()
    .then(() => console.log("🎉 Signature process completed successfully"))
    .catch(err => console.error("🚨 Unexpected error:", err));
