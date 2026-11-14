// Frontend for the Truffle project. Contract addresses and ABIs are read from
// Truffle's build files, so nothing needs to be copied by hand.
const GANACHE_CHAIN_ID = 1337; // Ganache's default chain id (change it if your Ganache shows another one)

let provider, signer, account, committee, reviews, contributionWei = 0n;
const $ = id => document.getElementById(id);
const short = a => a.slice(0, 6) + "..." + a.slice(-4);
const eth = w => ethers.formatEther(w) + " ETH";
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

function say(msg, isErr) {
  $("status").textContent = msg;
  $("status").className = isErr ? "err" : "";
}

async function loadArtifact(name) {
  const res = await fetch("../build/contracts/" + name + ".json");
  if (!res.ok) throw new Error("Could not load build/contracts/" + name + ".json. Run truffle migrate and open the project's main folder in VS Code.");
  return res.json();
}

function addressOf(artifact) {
  const ids = Object.keys(artifact.networks || {});
  if (!ids.length) throw new Error(artifact.contractName + " is not deployed yet. Run truffle migrate.");
  return artifact.networks[ids[ids.length - 1]].address;
}

async function switchToGanache() {
  const hex = "0x" + GANACHE_CHAIN_ID.toString(16);
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: hex }]);
  } catch (e) {
    const unknown = e.code === 4902 || (e.error && e.error.code === 4902) || /4902|Unrecognized chain/i.test(e.message || "");
    if (!unknown) throw e;
    await provider.send("wallet_addEthereumChain", [{
      chainId: hex,
      chainName: "Ganache Local",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["http://127.0.0.1:7545"]
    }]);
  }
}

async function connect() {
  if (!window.ethereum) return say("MetaMask not found. Install the extension and reload.", true);
  try {
    const [cArt, rArt] = await Promise.all([loadArtifact("RoscaCommittee"), loadArtifact("MemberReviews")]);
    const cAddr = addressOf(cArt), rAddr = addressOf(rArt);

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    if ((await provider.getNetwork()).chainId !== BigInt(GANACHE_CHAIN_ID)) {
      await switchToGanache();
      provider = new ethers.BrowserProvider(window.ethereum);
    }
    signer = await provider.getSigner();
    account = await signer.getAddress();
    committee = new ethers.Contract(cAddr, cArt.abi, signer);
    reviews = new ethers.Contract(rAddr, rArt.abi, signer);

    $("acct").textContent = account;
    $("net").textContent = "Ganache Local (" + GANACHE_CHAIN_ID + ")";
    $("addrC").textContent = cAddr;
    $("addrR").textContent = rAddr;
    $("refreshBtn").disabled = false;
    window.ethereum.on("accountsChanged", () => location.reload());
    window.ethereum.on("chainChanged", () => location.reload());
    say("Wallet connected.");
    await refresh();
  } catch (e) {
    say("Could not connect: " + (e.shortMessage || e.message), true);
  }
}

async function refresh() {
  try {
    $("bal").textContent = Number(ethers.formatEther(await provider.getBalance(account))).toFixed(3) + " ETH";
    const [contrib, size, count, round, paidNow, recipient, done] = await committee.getRoundInfo();
    const members = await committee.getMembers();
    const paidFlags = await Promise.all(members.map(m => committee.hasPaid(m)));
    contributionWei = contrib;

    $("contrib").textContent = eth(contrib);
    $("pot").textContent = eth(contrib * size);
    $("count").textContent = count + " of " + size;
    $("round").textContent = done ? "finished" : (Number(round) + 1) + " of " + size;
    $("paid").textContent = paidNow + " of " + size;
    $("recipient").textContent = done ? "Committee finished" :
      (count < size ? "Waiting for members to join" : short(recipient));

    const list = $("members");
    list.innerHTML = "";
    if (members.length === 0) list.innerHTML = "<li>No members yet. Be the first to join.</li>";
    members.forEach((m, i) => {
      const li = document.createElement("li");
      li.textContent = (i + 1) + ". " + short(m) + (same(m, account) ? " (you)" : "") +
        (!done && count == size ? (paidFlags[i] ? "  paid" : "  waiting") : "");
      if (!done && count == size && m === recipient) li.className = "next";
      list.appendChild(li);
    });

    const myIndex = members.findIndex(m => same(m, account));
    const isMember = myIndex >= 0;
    $("joinBtn").disabled = isMember || count >= size;
    $("payBtn").disabled = !isMember || count < size || done || !!paidFlags[myIndex];

    await refreshRatings(members, isMember, done);
  } catch (e) {
    say("Could not read the contracts. Is Ganache running, and did you run truffle migrate? " + (e.shortMessage || e.message), true);
  }
}

async function refreshRatings(members, isMember, done) {
  // rating form: only other members that this account has not rated yet
  const others = members.filter(m => !same(m, account));
  const ratedFlags = await Promise.all(others.map(m => reviews.hasRated(account, m)));
  const open = others.filter((m, i) => !ratedFlags[i]);
  const select = $("rateTarget");
  select.innerHTML = "";
  open.forEach(m => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = short(m);
    select.appendChild(o);
  });
  const canRate = done && isMember && open.length > 0;
  ["rateTarget", "rateStars", "rateComment", "rateBtn"].forEach(id => $(id).disabled = !canRate);
  $("rateNote").textContent = !done ? "Ratings open when the committee has finished all its rounds." :
    !isMember ? "Only committee members can rate." :
    open.length === 0 ? "You have rated every other member. Thank you." :
    "Pick a member and leave a rating.";

  // everyone's ratings
  const rep = $("repList");
  rep.innerHTML = "";
  for (const m of members) {
    const [avg, n] = await reviews.getAverageRating(m);
    const li = document.createElement("li");
    const head = document.createElement("b");
    head.textContent = short(m) + (same(m, account) ? " (you)" : "") + ": " +
      (n == 0 ? "no ratings yet" : (Number(avg) / 100).toFixed(1) + " stars from " + n + " rating" + (n == 1 ? "" : "s"));
    li.appendChild(head);
    for (let i = 0; i < Number(n); i++) {
      const [reviewer, stars, comment] = await reviews.getReview(m, i);
      const p = document.createElement("div");
      p.className = "review";
      p.textContent = stars + " stars by " + short(reviewer) + (comment ? ": " + comment : "");
      li.appendChild(p);
    }
    rep.appendChild(li);
  }
}

async function send(label, action) {
  try {
    say("Confirm \"" + label + "\" in MetaMask...");
    const tx = await action();
    say("Transaction sent. Waiting for confirmation...");
    const receipt = await tx.wait();
    say(label + " confirmed in block " + receipt.blockNumber + ".");
    const li = document.createElement("li");
    li.textContent = label + ": " + tx.hash;
    $("txLog").prepend(li);
    await refresh();
  } catch (e) {
    say("Failed: " + (e.reason || e.shortMessage || e.message), true);
  }
}

$("connectBtn").onclick = connect;
$("refreshBtn").onclick = refresh;
$("joinBtn").onclick = () => send("Join committee", () => committee.join());
$("payBtn").onclick = () => send("Pay contribution", () => committee.contribute({ value: contributionWei }));
$("rateBtn").onclick = () => send("Submit rating", () =>
  reviews.rateMember($("rateTarget").value, Number($("rateStars").value), $("rateComment").value.trim()));
