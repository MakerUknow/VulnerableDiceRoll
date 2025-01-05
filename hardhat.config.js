require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      mining: {
        auto: false,
        interval: 0
      },
      allowBlocksWithSameTimestamp: true
    }
  }
};