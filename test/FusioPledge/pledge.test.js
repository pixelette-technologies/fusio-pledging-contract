const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getSignedPledgeData, DOMAIN, PLEDGE_TYPE } = require("../utils/signingUtils");
const { deployFusioPledge, setupUserTokens } = require("../utils/deploy");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("FusioPledge: pledge()", () => {
  let fusioPledge, token, owner, addr1, addr2;
  const interval = 365;
  const amount = ethers.parseEther("10", 18);

  beforeEach(async () => {
    ({ owner, addr1, addr2, token, fusioPledge } = await deployFusioPledge());
    await setupUserTokens(token, addr1, "10");

    // Setup active tiers
    await fusioPledge.connect(owner).setTier(interval, 2800, true); // 28% APR
    await fusioPledge.connect(owner).setTier(30, 1200, true); // Monthly tier
    await fusioPledge.connect(owner).addSigner(owner.address);
  });

  it("should allow a valid pledge", async () => {
    const { signature, encodedData, id, status } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount,
			interval,
			pledgeContract: fusioPledge,
    });

    await expect(fusioPledge.connect(addr1).pledge(encodedData, signature))
      .to.emit(fusioPledge, "Pledged")
      .withArgs(addr1.address, id, amount, interval, status, 2800, 1200, anyValue); // APRs and timestamp
  });

  it("should revert on zero amount", async () => {
    const { signature, encodedData } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount: 0,
			interval,
			pledgeContract: fusioPledge,
    });

    await expect(fusioPledge.connect(addr1).pledge(encodedData, signature)).to.be.revertedWithCustomError(fusioPledge, "InvalidInput");
  });

	it("should revert on zero interval", async () => {
		const { signature, encodedData } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount,
			interval: 0,
			pledgeContract: fusioPledge,
		});
	
		await expect(fusioPledge.connect(addr1).pledge(encodedData, signature)).to.be.revertedWithCustomError(fusioPledge, "InvalidInput");
	});

	it("should revert on zero ID", async () => {
		const { signature, encodedData } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount,
			interval,
			pledgeContract: fusioPledge,
			inValidId: true
		});
	
		await expect(fusioPledge.connect(addr1).pledge(encodedData, signature))
			.to.be.revertedWithCustomError(fusioPledge, "InvalidInput");
	});

	it("should revert on zero status", async () => {
		const { signature, encodedData } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount,
			interval,
			pledgeContract: fusioPledge,
			inValidStatus: true
		});
	
		await expect(fusioPledge.connect(addr1).pledge(encodedData, signature))
			.to.be.revertedWithCustomError(fusioPledge, "InvalidInput");
	});

	it("should revert on zero salt", async () => {
		const { signature, encodedData } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount,
			interval,
			pledgeContract: fusioPledge,
			inValidSalt: true,
		});
	
		await expect(fusioPledge.connect(addr1).pledge(encodedData, signature))
			.to.be.revertedWithCustomError(fusioPledge, "InvalidInput");
	});

  it("should revert if interval tier is inactive", async () => {
    await fusioPledge.connect(owner).setTierStatus(interval, false); // deactivate

    const { signature, encodedData } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount,
			interval,
			pledgeContract: fusioPledge,
    });

    await expect(fusioPledge.connect(addr1).pledge(encodedData, signature)).to.be.revertedWithCustomError(fusioPledge, "TierInactive");
  });

	it("should revert if monthly tier apr is zero", async () => {
    await fusioPledge.connect(owner).setTierStatus(30, false); // deactivate

    const { signature, encodedData } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount,
			interval,
			pledgeContract: fusioPledge,
    });

    await expect(fusioPledge.connect(addr1).pledge(encodedData, signature)).to.be.revertedWithCustomError(fusioPledge, "MonthlyTierInactive");
  });

  it("should revert on reused salt", async () => {
		const { signature, encodedData, status, salt, id } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount,
			interval,
			pledgeContract: fusioPledge,
    });
		
		await fusioPledge.connect(addr1).pledge(encodedData, signature);
		const provider = ethers.provider; // Access Hardhat's provider
  	const chainId = (await provider.getNetwork()).chainId;
		const domain = DOMAIN(fusioPledge.target, chainId);

		const data = {
			user: addr1.address,
			token: token.target,
			amount,
			interval,
			id,
			status,
			salt,
		};
    
		const signature2 = await owner.signTypedData(domain, { Pledge: PLEDGE_TYPE }, data);
		const encodedData2 = ethers.AbiCoder.defaultAbiCoder().encode(
			["uint256", "uint256", "bytes32", "bytes32", "bytes32"],
			[amount, interval, id, status, salt]
		);

  	await expect(fusioPledge.connect(addr1).pledge(encodedData2, signature2)).to.be.revertedWithCustomError(fusioPledge, "SaltAlreadyUsed");
  });

	it("should revert if user's balance is too low", async () => {
		await token.connect(addr1).transfer(addr2, amount);
		
		const { signature, encodedData } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount,
			interval,
			pledgeContract: fusioPledge,
		});
	
		// Expect the pledge to revert with PledgeBalanceTooLow error due to low balance
		await expect(fusioPledge.connect(addr1).pledge(encodedData, signature))
			.to.be.revertedWithCustomError(fusioPledge, "PledgeBalanceTooLow");
	});

  it("should revert on invalid signature", async () => {
    const fakeSigner = addr1;

		const { signature, encodedData } = await getSignedPledgeData({
			signer: fakeSigner,
			user: addr1,
			token,
			amount,
			interval,
			pledgeContract: fusioPledge
		});

    await expect(fusioPledge.connect(addr1).pledge(encodedData, signature)).to.be.revertedWithCustomError(fusioPledge, "InvalidSigner");
  });

	it("should revert if contract is paused", async () => {
		await fusioPledge.pausePledging();
	
		const { signature, encodedData } = await getSignedPledgeData({
			signer: owner,
			user: addr1,
			token,
			amount,
			interval,
			pledgeContract: fusioPledge,
		});
	
		await expect(fusioPledge.connect(addr1).pledge(encodedData, signature))
			.to.be.revertedWithCustomError(fusioPledge, "EnforcedPause");
	});
});
