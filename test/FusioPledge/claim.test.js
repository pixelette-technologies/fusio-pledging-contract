const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getSignedPledgeData, getSignedClaimData } = require("../utils/signingUtils");
const { deployFusioPledge, setupUserTokens } = require("../utils/deploy");
const { fastForwardEpochs, calculateRewardForDuration } = require("../utils/helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("FusioPledge: claimRewards()", () => {
  let fusioPledge, token, owner, addr1, addr2;
  const interval = 365;
  const amount = ethers.parseEther("10");
	let pledgeId;

  beforeEach(async () => {
    ({ owner, addr1, addr2, token, fusioPledge } = await deployFusioPledge());
    await setupUserTokens(token, addr1, "10");
    await fusioPledge.connect(owner).setTier(interval, 2800, true);
    await fusioPledge.connect(owner).setTier(30, 1200, true);
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

  it("should allow a valid claim and update user balance", async () => {
    await fastForwardEpochs();
  
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    const before = await token.balanceOf(addr1.address);
  
    await expect(
      fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature)
    ).to.emit(fusioPledge, "Claimed");
  
    const after = await token.balanceOf(addr1.address);
    const expectedReward = calculateRewardForDuration(amount, 1200, 1);
  
    expect(after - before).to.equal(expectedReward);
  });

  it("should revert if any of the input parameters are invalid", async () => {
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount: 0, // invalid amount
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
    await expect(fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature))
      .to.be.revertedWithCustomError(fusioPledge, "InvalidInput");
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

  it("should revert if user's balance is too low", async () => {
    await fastForwardEpochs();

    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount: ethers.parseEther("20"),  // Amount greater than balance
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    await expect(fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature))
      .to.be.revertedWithCustomError(fusioPledge, "PledgeBalanceTooLow");
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

  it("should revert on expired signature for preclaim after 15 minutes for pre-claim", async () => {
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

  it("should allow claim of correct monthly reward after 1 month (30 days)", async () => {
    await fastForwardEpochs(); 
  
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    const before = await token.balanceOf(addr1.address);
  
    await fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature);
  
    const after = await token.balanceOf(addr1.address);
    const expectedMonthlyReward = calculateRewardForDuration(amount, 1200, 1);
  
    expect(after - before).to.equal(expectedMonthlyReward);
  });

  it("should not allow claiming rewards after only 20 days (partial epoch) and revert with TooEarlyToClaim", async () => {
    await fastForwardEpochs(1, { customDays: 20 });

    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    await expect(
      fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature)
    ).to.be.revertedWithCustomError(fusioPledge, "TooEarlyToClaim");
  });

  it("should allow the user to claim the correct total rewards after 2 months (60 days), including any unclaimed rewards from the previous months", async () => {
    await fastForwardEpochs(2); 
  
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    const before = await token.balanceOf(addr1.address);
  
    await fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature);
  
    const after = await token.balanceOf(addr1.address);
  
    const expectedMonthlyReward = calculateRewardForDuration(amount, 1200, 1);
    const rewardsaAfterThreeMonth = expectedMonthlyReward * BigInt(2);
  
    expect(after - before).to.equal(rewardsaAfterThreeMonth);
  });

  it("should only allow claim for 1 month if 1.5 months have passed", async () => {
    await fastForwardEpochs(1, { customDays: 45 });

    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    const before = await token.balanceOf(addr1.address);  
  
    await fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature);
  
    const after = await token.balanceOf(addr1.address);  
  
    const expectedReward = calculateRewardForDuration(amount, 1200, 1);
  
    expect(after - before).to.equal(expectedReward);
  });

  it("should allow user to claim correct rewards after 1 month, skip 1 month, and then claim after 3 months", async () => {
    await fastForwardEpochs(1);
  
    const { claimSignature: firstClaimSignature, claimEncodedData: firstClaimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });

    await fusioPledge.connect(addr1).claimRewards(firstClaimEncodedData, firstClaimSignature);    
    await fastForwardEpochs(2);
  
    const { claimSignature: secondClaimSignature, claimEncodedData: secondClaimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    const beforeSecondClaim = await token.balanceOf(addr1.address);
    console.log("🚀 ~ it ~ beforeSecondClaim:", beforeSecondClaim)
  
    await fusioPledge.connect(addr1).claimRewards(secondClaimEncodedData, secondClaimSignature);
  
    const afterSecondClaim = await token.balanceOf(addr1.address);
    console.log("🚀 ~ it ~ afterSecondClaim:", afterSecondClaim)
    
    const expectedMonthlyReward = calculateRewardForDuration(amount, 1200, 1);
    console.log("🚀 ~ it ~ expectedMonthlyReward:", expectedMonthlyReward)

    const totalRewardsFortwoMonths = expectedMonthlyReward * BigInt(2);
    console.log("🚀 ~ it ~ totalRewardsFortwoMonths:", totalRewardsFortwoMonths)

    expect(afterSecondClaim - beforeSecondClaim).to.equal(totalRewardsFortwoMonths);
  });

  it("should allow user to claim remaining rewards after 12 months if they have claimed rewards for the previous 11 months", async () => {
    await fastForwardEpochs(11);
    
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    await fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature);
  
    await fastForwardEpochs(1, { is12thMonth: true });
  
    const expectedTotalRewards = calculateRewardForDuration(amount, 2800, 12);
    const expectedClaimedRewards = calculateRewardForDuration(amount, 1200, 1) * BigInt(11);
    const remainingRewards = expectedTotalRewards - expectedClaimedRewards;

    console.log(`Total Rewards for 12 months: ${expectedTotalRewards}`);
    console.log(`Claimed Rewards for 11 months: ${expectedClaimedRewards}`);
    console.log(`Remaining Rewards: ${remainingRewards}`);
  
    const { claimSignature: finalClaimSignature, claimEncodedData: finalClaimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    const beforeFinalClaim = await token.balanceOf(addr1.address);
    console.log("🚀 ~ it ~ beforeFinalClaim:", beforeFinalClaim)
  
    await fusioPledge.connect(addr1).claimRewards(finalClaimEncodedData, finalClaimSignature);
  
    const afterFinalClaim = await token.balanceOf(addr1.address);
    console.log("🚀 ~ it ~ afterFinalClaim:", afterFinalClaim);
    
    expect(afterFinalClaim - beforeFinalClaim).to.equal(remainingRewards);
  });

  it("should allow claim of correct total rewards after full duration(365 days) if no previous claims", async () => {
    await fastForwardEpochs(12, { is12thMonth: true });
  
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    const before = await token.balanceOf(addr1.address);
    console.log("🚀 ~ it ~ before:", before)
  
    await fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature);
  
    const after = await token.balanceOf(addr1.address);
    console.log("🚀 ~ it ~ after:", after)
  
    const expectedTotalRewards = calculateRewardForDuration(amount, 2800, 12);
    console.log("🚀 ~ it ~ expectedTotalRewards:", expectedTotalRewards)
  
    expect(after - before).to.equal(expectedTotalRewards);
  });

  it("should revert on expired signature after a year for full claim", async () => {
    await fastForwardEpochs(12, { is12thMonth: true });
  
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
      fullClaim: true // This ensures the signature expires in 2 years
    });
  
    await network.provider.send("evm_increaseTime", [(2 * 365 * 24 * 60 * 60)]);
    await network.provider.send("evm_mine");
  
    await expect(
      fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature)
    ).to.be.revertedWithCustomError(fusioPledge, "SignatureExpired");
  });

  it("should update lastClaimedEpoch correctly after each claim", async () => {
    await fastForwardEpochs(1);
  
    const before = (await fusioPledge.pledges(addr1.address)).lastClaimedEpoch;
  
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    await fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature);
  
    const after = (await fusioPledge.pledges(addr1.address)).lastClaimedEpoch;
  
    expect(after).to.equal(before + 1n);
  });

  it("should fail if total rewards already claimed", async () => {
    await fastForwardEpochs(1, { is12thMonth: true });
  
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    await fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature);

    const { claimSignature: claimSignature2, claimEncodedData: claimEncodedData2} = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
    
    await expect(
      fusioPledge.connect(addr1).claimRewards(claimEncodedData2, claimSignature2)
    ).to.be.revertedWithCustomError(fusioPledge,"PledgeEnded");
  });

  it("should not allow multiple back-to-back claims in the same epoch", async () => {
    await fastForwardEpochs(1);
  
    const { claimSignature , claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    await fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature);

    const { claimSignature: claimSignature2, claimEncodedData: claimEncodedData2 } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    await expect(
      fusioPledge.connect(addr1).claimRewards(claimEncodedData2, claimSignature2)
    ).to.be.revertedWithCustomError(fusioPledge, "TooEarlyToClaim");
  });

  it("should fail if a user tries to claim on behalf of another address", async () => {
    await setupUserTokens(token, addr2, "10");
    const pledgeData = await getSignedPledgeData({
      signer: owner,
      user: addr2,
      token,
      amount,
      interval,
      pledgeContract: fusioPledge,
    });

    const { signature, encodedData, id: addr2Id } = pledgeData;

    await fusioPledge.connect(addr2).pledge(encodedData, signature);
    await fastForwardEpochs(1);
  
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: addr2Id,
      pledgeContract: fusioPledge,
    });

    await expect(
      fusioPledge.connect(addr2).claimRewards(claimEncodedData, claimSignature)
    ).revertedWithCustomError(fusioPledge, "InvalidSigner");
  });

  it("should revert if there are insufficient funds in the reward pool", async () => {
    await fastForwardEpochs(1);
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
  
    // Drain all tokens from the contract's reward pool
    const fusioPledgeBalance = await token.balanceOf(fusioPledge.target);
    await fusioPledge.connect(owner).emergencyWithdraw(owner.address, fusioPledgeBalance);

    const fusioPledgeBalance2 = await token.balanceOf(fusioPledge.target);
    console.log("🚀 ~ it ~ fusioPledgeBalance2:", fusioPledgeBalance2)
  
    await expect(fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature))
      .to.be.revertedWithCustomError(fusioPledge, "InsufficientRewardPool");
  });

  it("should revert if contract is paused", async () => {	
    await fusioPledge.pausePledging();
		await fastForwardEpochs(1);
    const { claimSignature, claimEncodedData } = await getSignedClaimData({
      signer: owner,
      user: addr1,
      token,
      amount,
      interval,
      id: pledgeId,
      pledgeContract: fusioPledge,
    });
	
		await expect(fusioPledge.connect(addr1).claimRewards(claimEncodedData, claimSignature))
			.to.be.revertedWithCustomError(fusioPledge, "EnforcedPause");
	});
});
