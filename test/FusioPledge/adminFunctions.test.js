const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployFusioPledge } = require("../utils/deploy");

describe("FusioPledge Admin Functions", function () {
  let owner, addr1, addr2;
  let fusioPledge, token;
  const initialAmount = ethers.parseEther("1000000");

  beforeEach(async function () {
    ({ owner, addr1, addr2, token, fusioPledge } = await deployFusioPledge());
    console.log("addr1:", addr1); // This should show the signer object with the `address` property

  });

  describe("setTier", function () {
    it("should allow owner to set a tier", async function () {
      await fusioPledge.setTier(30, 1600, true); //16%
      const tier = await fusioPledge.tiers(30);
      expect(tier.apr).to.equal(1600);
      expect(tier.isActive).to.equal(true);
    });

    it("should revert if tier APR is 0", async function () {
      await expect(fusioPledge.setTier(30, 0, true)).to.be.revertedWithCustomError(fusioPledge, "InvalidInput");
    });

    it("should revert if tier interval is below minimum", async function () {
      await expect(fusioPledge.setTier(0, 1600, true)).to.be.revertedWithCustomError(fusioPledge, "InvalidInput");
    });

    it("should revert if tier is already active", async function () {
      await fusioPledge.setTier(30, 1600, true);
      await expect(fusioPledge.setTier(30, 1600, true)).to.be.revertedWithCustomError(fusioPledge, "TierIsActive");
    });

    it("should revert if called by non-owner", async function () {
      await expect(fusioPledge.connect(addr1).setTier(30, 1000, true)).to.be.revertedWithCustomError(fusioPledge, "OwnableUnauthorizedAccount");
    });
  });

  describe("setTierAPR", function () {
    it("should allow owner to set APR", async function () {
      await fusioPledge.setTier(30, 1000, true);
      await fusioPledge.setTierAPR(30, 1500);
      const tier = await fusioPledge.tiers(30);
      expect(tier.apr).to.equal(1500);
    });

    it("should revert if tier is inactive", async function () {
      await expect(fusioPledge.setTierAPR(30, 1500)).to.be.revertedWithCustomError(fusioPledge, "TierInactive");
    });

    it("should revert if called by non-owner", async function () {
      await expect(fusioPledge.connect(addr1).setTierAPR(30, 1500)).to.be.revertedWithCustomError(fusioPledge, "OwnableUnauthorizedAccount");
    });
  });

  describe("setTierStatus", function () {
    it("should allow owner to update tier status", async function () {
      await fusioPledge.setTier(30, 1000, true);
      await fusioPledge.setTierStatus(30, false);
      const tier = await fusioPledge.tiers(30);
      expect(tier.isActive).to.equal(false);
    });

    it("should revert if tier status is already the same", async function () {
      await fusioPledge.setTier(30, 1000, true);
      await expect(fusioPledge.setTierStatus(30, true)).to.be.revertedWithCustomError(fusioPledge, "InvalidInput");
    });

    it("should revert if called by non-owner", async function () {
      await expect(fusioPledge.connect(addr1).setTierStatus(30, false)).to.be.revertedWithCustomError(fusioPledge, "OwnableUnauthorizedAccount");
    });
  });

  describe("addSigner", function () {
    it("should allow owner to add a signer", async function () {
      await fusioPledge.addSigner(addr1.address);
      expect(await fusioPledge.isSigner(addr1.address)).to.equal(true);
    });

    it("should revert if called by non-owner", async function () {
      await expect(fusioPledge.connect(addr1).addSigner(addr2.address)).to.be.revertedWithCustomError(fusioPledge, "OwnableUnauthorizedAccount");
    });
  });

  describe("removeSigner", function () {
    it("should allow owner to remove a signer", async function () {
      await fusioPledge.addSigner(addr1.address);
      await fusioPledge.removeSigner(addr1.address);
      expect(await fusioPledge.isSigner(addr1.address)).to.equal(false);
    });

    it("should revert if signer is not added", async function () {
      await expect(fusioPledge.removeSigner(addr1.address)).to.be.revertedWithCustomError(fusioPledge, "InvalidInput");
    });

    it("should revert if called by non-owner", async function () {
      await expect(fusioPledge.connect(addr1).removeSigner(addr2.address)).to.be.revertedWithCustomError(fusioPledge, "OwnableUnauthorizedAccount");
    });
  });

  describe("emergencyWithdraw", function () {
    it("should allow owner to withdraw tokens", async function () {
      await fusioPledge.emergencyWithdraw(owner.address, initialAmount);
      expect(await token.balanceOf(fusioPledge.target)).to.equal(0);
      expect(await token.balanceOf(owner.address)).to.equal('10000000000000000000000000');
    });

    it("should revert if withdrawal amount is greater than balance", async function () {
			const contractBalance = await token.balanceOf(fusioPledge.target);
			console.log("Contract balance:", contractBalance.toString());
			const excessiveAmount = contractBalance + 1n; // add 1 to make sure it's more
      await expect(fusioPledge.emergencyWithdraw(owner.address, excessiveAmount)).to.be.revertedWithCustomError(fusioPledge, "InsufficientBalance");
    });

    it("should revert if called by non-owner", async function () {
      await expect(fusioPledge.connect(addr1).emergencyWithdraw(owner.address, initialAmount)).to.be.revertedWithCustomError(fusioPledge, "OwnableUnauthorizedAccount");
    });
  });
});
