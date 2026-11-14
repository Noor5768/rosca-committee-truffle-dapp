const RoscaCommittee = artifacts.require("RoscaCommittee");
const MemberReviews = artifacts.require("MemberReviews");

const CONTRIBUTION = web3.utils.toWei("0.1", "ether");

async function expectRevert(promise, text) {
  try { await promise; } catch (e) { assert.include(e.message, text); return; }
  assert.fail("Expected a revert containing: " + text);
}

contract("RoscaCommittee + MemberReviews", (accounts) => {
  const [alice, bob, carol] = accounts;
  let committee, reviews;

  beforeEach(async () => {
    committee = await RoscaCommittee.new(CONTRIBUTION, 2);
    reviews = await MemberReviews.new(committee.address);
  });

  async function fillAndFinish() {
    await committee.join({ from: alice });
    await committee.join({ from: bob });
    await committee.contribute({ from: alice, value: CONTRIBUTION });
    await committee.contribute({ from: bob, value: CONTRIBUTION });  // round 1 done
    await committee.contribute({ from: alice, value: CONTRIBUTION });
    await committee.contribute({ from: bob, value: CONTRIBUTION });  // round 2 done
  }

  it("deploys with the right settings", async () => {
    const info = await committee.getRoundInfo();
    assert.equal(info.contributionWei.toString(), CONTRIBUTION);
    assert.equal(info.size.toString(), "2");
    assert.equal(info.memberCount.toString(), "0");
    assert.equal(info.completed, false);
  });

  it("lets members join in order and blocks a second seat", async () => {
    await committee.join({ from: alice });
    await committee.join({ from: bob });
    assert.deepEqual(await committee.getMembers(), [alice, bob]);
    await expectRevert(committee.join({ from: alice }), "Already a member");
    await expectRevert(committee.join({ from: carol }), "Committee is full");
  });

  it("blocks contributions until the committee is full", async () => {
    await committee.join({ from: alice });
    await expectRevert(committee.contribute({ from: alice, value: CONTRIBUTION }), "Committee not full yet");
  });

  it("only accepts the exact amount, once per round, from members", async () => {
    await committee.join({ from: alice });
    await committee.join({ from: bob });
    await expectRevert(committee.contribute({ from: alice, value: 1 }), "Send the exact contribution");
    await expectRevert(committee.contribute({ from: carol, value: CONTRIBUTION }), "Not a member");
    await committee.contribute({ from: alice, value: CONTRIBUTION });
    assert.equal(await committee.hasPaid(alice), true);
    await expectRevert(committee.contribute({ from: alice, value: CONTRIBUTION }), "Already paid this round");
  });

  it("pays the whole pot to the first member when everyone has paid", async () => {
    await committee.join({ from: alice });
    await committee.join({ from: bob });
    await committee.contribute({ from: alice, value: CONTRIBUTION });
    const before = web3.utils.toBN(await web3.eth.getBalance(alice));
    await committee.contribute({ from: bob, value: CONTRIBUTION }); // bob pays the gas, alice receives
    const after = web3.utils.toBN(await web3.eth.getBalance(alice));
    assert.equal(after.sub(before).toString(), web3.utils.toWei("0.2", "ether"));
    const info = await committee.getRoundInfo();
    assert.equal(info.currentRound.toString(), "1");
    assert.equal(info.recipient, bob);
  });

  it("finishes after every member has received the pot", async () => {
    await fillAndFinish();
    const info = await committee.getRoundInfo();
    assert.equal(info.completed, true);
    await expectRevert(committee.contribute({ from: alice, value: CONTRIBUTION }), "Committee finished");
  });

  it("keeps no ETH stuck in the contract after a finished committee", async () => {
    await fillAndFinish();
    assert.equal(await web3.eth.getBalance(committee.address), "0");
  });

  it("reviews: blocked until the committee has finished", async () => {
    await committee.join({ from: alice });
    await committee.join({ from: bob });
    await expectRevert(reviews.rateMember(bob, 5, "Great", { from: alice }), "Committee not finished yet");
  });

  it("reviews: members rate each other and the average is stored", async () => {
    await fillAndFinish();
    await reviews.rateMember(bob, 5, "Always paid on time", { from: alice });
    const [avg, count] = Object.values(await reviews.getAverageRating(bob));
    assert.equal(avg.toString(), "500");
    assert.equal(count.toString(), "1");
    const r = await reviews.getReview(bob, 0);
    assert.equal(r.reviewer, alice);
    assert.equal(r.comment, "Always paid on time");
    assert.equal(await reviews.hasRated(alice, bob), true);
  });

  it("reviews: rejects self-reviews, repeats, bad stars and outsiders", async () => {
    await fillAndFinish();
    await expectRevert(reviews.rateMember(alice, 5, "me", { from: alice }), "You cannot rate yourself");
    await expectRevert(reviews.rateMember(bob, 6, "x", { from: alice }), "Stars must be 1 to 5");
    await expectRevert(reviews.rateMember(bob, 0, "x", { from: alice }), "Stars must be 1 to 5");
    await expectRevert(reviews.rateMember(bob, 4, "x", { from: carol }), "Only committee members can rate");
    await expectRevert(reviews.rateMember(carol, 4, "x", { from: alice }), "Rated address is not a member");
    await reviews.rateMember(bob, 4, "ok", { from: alice });
    await expectRevert(reviews.rateMember(bob, 5, "again", { from: alice }), "Already rated this member");
  });
});
