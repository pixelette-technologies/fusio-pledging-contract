const fastForwardEpochs = async (epochs = 1, options = {}) => {
  const dayInSeconds = 24 * 60 * 60;
  let totalSeconds;

  if (options.customDays) {
    totalSeconds = options.customDays * dayInSeconds;
  } else if (options.is12thMonth) {
    totalSeconds = 365 * dayInSeconds;
  } else {
    totalSeconds = 30 * dayInSeconds * epochs;
  }

  await network.provider.send("evm_increaseTime", [totalSeconds]);
  await network.provider.send("evm_mine");
};

function calculateRewardForDuration(pledgedAmount, aprBasisPoints, months) {
  const basisPoints = 10000;
  const rewardForDuration = (pledgedAmount * BigInt(aprBasisPoints) * BigInt(months)) / BigInt(basisPoints * 12);
  return rewardForDuration;
}

module.exports = {
  fastForwardEpochs,
  calculateRewardForDuration
};
