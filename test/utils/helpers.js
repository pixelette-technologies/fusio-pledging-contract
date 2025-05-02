const fastForwardEpochs = async () => {
  const dayInSeconds = 24 * 60 * 60; // 1 day in seconds
  const thirtyDaysInSeconds = 30 * dayInSeconds; // 30 days in seconds
  await network.provider.send("evm_increaseTime", [thirtyDaysInSeconds]);
  await network.provider.send("evm_mine");
};

module.exports = {
  fastForwardEpochs,
};
