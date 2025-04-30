const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getSignedPledgeData, getSignedClaimData } = require("../utils/signingUtils");
const { deployFusioPledge, setupUserTokens } = require("../utils/deploy");
const { fastForwardEpochs } = require("../utils/helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("FusioPledge: claimRewards()", () => {
  let fusioPledge, token, owner, addr1;
  const interval = 365;
  const amount = ethers.parseEther("10");
	let pledgeId;

  beforeEach(async () => {
    ({ owner, addr1, token, fusioPledge } = await deployFusioPledge());
    await setupUserTokens(token, addr1, "10000");

    await fusioPledge.connect(owner).setTier(interval, 2800, true);
    await fusioPledge.connect(owner).setTier(30, 1600, true);
    await fusioPledge.connect(owner).addSigner(owner.address);

		const pledgeData = await getSignedPledgeData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      pledgeContract: fusioPledge,
    });

    const { signature, encodedData, id } = pledgeData;

    await fusioPledge.connect(addr1).pledge(encodedData, signature);

		pledgeId = id;
  });

  it("should allow a valid claim", async () => {
		const contractBalance = await token.balanceOf(fusioPledge.target);
    console.log("Contract balance before claim:", ethers.formatUnits(contractBalance, 18));

    await fastForwardEpochs();
    console.log("successfully added time");

    const { claimSignature, claimEncodedData, status: claimStatus } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });

    console.log("claimEncodedData:", claimEncodedData);
    console.log("claimSignature:", claimSignature);

    await expect(fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature))
      .to.emit(fusioPledge, "Claimed")
      .withArgs(addr1.address, pledgeId, amount, interval, claimStatus, anyValue, 1, anyValue);
  });

  it("should revert if claim is too early", async () => {
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });

    await expect(fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature)).to.be.revertedWithCustomError(fusioPledge, "TooEarlyToClaim");
  });

  it("should revert on reused salt", async () => {
    await fastForwardEpochs();

    const { claimSignature: claimSignature1, claimEncodedData: claimEncodedData1, salt } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });

    await fusioPledge.connect(addr1).claimRewards(claimEncodedData1, claimSignature1);

    const { claimSignature: claimSignature2, claimEncodedData: claimEncodedData2 } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
			salt
    });

    await expect(fusioPledge.connect(addr1).claimRewards(claimEncodedData2, claimSignature2)).to.be.revertedWithCustomError(fusioPledge, "SaltAlreadyUsed");
  });

  it("should revert on expired signature", async () => {
    await fastForwardEpochs();

    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
			expiryPassed: true
    });

    await expect(fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature)).to.be.revertedWithCustomError(fusioPledge, "SignatureExpired");
  });

  it("should revert on invalid signer", async () => {
    await fastForwardEpochs();

		const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: addr1, // invalid signer,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });

    await expect(fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature)).to.be.revertedWithCustomError(fusioPledge, "InvalidSigner");
  });
});
