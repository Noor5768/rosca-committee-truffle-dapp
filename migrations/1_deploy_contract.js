// Deploys both contracts to the network chosen with `truffle migrate`.
const RoscaCommittee = artifacts.require("RoscaCommittee"); // contracts/SmartContract.sol
const MemberReviews = artifacts.require("MemberReviews");   // contracts/MemberReviews.sol

module.exports = async function (deployer) {
  const contribution = web3.utils.toWei("0.1", "ether"); // each member pays 0.1 ETH per round
  const committeeSize = 2;                               // 2 members = 2 rounds

  // 1. Deploy the committee contract with its two constructor arguments.
  await deployer.deploy(RoscaCommittee, contribution, committeeSize);
  const committee = await RoscaCommittee.deployed();

  // 2. Deploy the reviews contract and give it the committee's address.
  await deployer.deploy(MemberReviews, committee.address);
};
