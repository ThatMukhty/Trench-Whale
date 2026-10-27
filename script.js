// =========================================================
// TRENCH WHALE — BACKEND ENGINE & STATE MANAGEMENT
// =========================================================

const TOKEN_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000"; // Replace with your mainnet CA
const TOTAL_LIFESPAN_HOURS = 36;
const COOLDOWN_FEED_HOURS = 12;

// Supply Share Milestones mapped to dynamic image scale multipliers & dialogues
const WHALE_TIERS = [
  { maxShare: 0.0,   scale: 0.45, title: "FORM: NO WHALE YET 💀", dialogue: "Connect your wallet or stack tokens to spawn your beast!" },
  { maxShare: 0.1,   scale: 0.60, title: "FORM: TINY CALF 🍼", dialogue: "A fragile calf in shark-infested waters. Feed me!" },
  { maxShare: 0.5,   scale: 0.75, title: "FORM: SMALL CALF 🐟", dialogue: "Scavenging for plankton in the deep trench. Keep stacking." },
  { maxShare: 1.0,   scale: 0.90, title: "FORM: YOUNG WHALE 🦈", dialogue: "Starting to make waves. Don't let paper hands get you." },
  { maxShare: 2.5,   scale: 1.05, title: "FORM: BIG WHALE 🐳", dialogue: "The market feels every flick of my tail. We're growing!" },
  { maxShare: 5.0,   scale: 1.25, title: "FORM: ALPHA WHALE 🌊", dialogue: "Alpha status unlocked. Diamond chains activated!" },
  { maxShare: 10.0,  scale: 1.45, title: "FORM: MEGA WHALE ⚡", dialogue: "Absolute unit of the abyss. Tremble, non-believers." },
  { maxShare: 999.9, scale: 1.65, title: "FORM: TRENCH LEVIATHAN 👑", dialogue: "KING OF THE TRENCHES! Absolute market god status achieved!" }
];

let userWalletAddress = null;
let userTokenBalance = 0;
let totalSupplyShare = 0;
let currentHealthPercent = 100;
let timerInterval = null;

// Standard ERC-20 Minimal ABI
const minABI = [
  { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" },
  { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" },
  { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" }
];

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
  setupUIBindings();
  initHealthTimer();
  autoConnectSession();
  updateContractUI();
});

function updateContractUI() {
  const caEl = document.getElementById('contractAddress');
  if (caEl) caEl.innerText = TOKEN_CONTRACT_ADDRESS;
}

// --- DOM EVENT LISTENERS & MODAL CONTROLS ---
function setupUIBindings() {
  const modal = document.getElementById('walletModal');
  const btnConnect = document.getElementById('btnConnectWallet');
  const btnCloseModal = document.getElementById('btnCloseWalletModal');
  const backdrop = modal?.querySelector('[data-close-modal]');
  const btnCopyCA = document.getElementById('btnCopyCA');
  const btnBuy = document.getElementById('btnBuy');
  const btnFeedX = document.getElementById('btnFeedX');
  const btnCheckin = document.getElementById('btnDailyCheckin');
  const btnCard = document.getElementById('btnDownloadCard');

  // Modal Toggles
  btnConnect?.addEventListener('click', () => { if(modal) modal.hidden = false; });
  btnCloseModal?.addEventListener('click', () => { if(modal) modal.hidden = true; });
  backdrop?.addEventListener('click', () => { if(modal) modal.hidden = true; });

  // Wallet Option Selection
  document.querySelectorAll('.wallet-opt').forEach(opt => {
    opt.addEventListener('click', async (e) => {
      if(modal) modal.hidden = true;
      const walletType = e.currentTarget.getAttribute('data-wallet');
      
      if (window.ethereum) {
        try {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          await provider.send("eth_requestAccounts", []);
          const signer = provider.getSigner();
          userWalletAddress = await signer.getAddress();
          localStorage.setItem('whale_connected_wallet', userWalletAddress);
          handleSuccessfulConnection();
          return;
        } catch (err) {
          console.warn("Injected provider connection declined/failed:", err);
        }
      }
      handleMobileDeepLink(walletType);
    });
  });

  // Copy CA Action
  btnCopyCA?.addEventListener('click', () => {
    navigator.clipboard.writeText(TOKEN_CONTRACT_ADDRESS).then(() => {
      btnCopyCA.innerText = "COPIED!";
      setTimeout(() => btnCopyCA.innerText = "COPY CA", 2000);
    });
  });

  // Robinhood Buy Action
  btnBuy?.addEventListener('click', (e) => {
    e.preventDefault();
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    window.open(isMobile ? "https://wallet.robinhood.com/" : "https://robinhood.com/us/en/about/crypto/", "_blank");
  });

  // Action Buttons
  btnFeedX?.addEventListener('click', handleTweetFeed);
  btnCheckin?.addEventListener('click', handleDailyCheckin);
  btnCard?.addEventListener('click', generateFlexCard);

  // Check initial cooldown UI states on load
  checkButtonCooldowns();
}

// --- SESSION PERSISTENCE ---
async function autoConnectSession() {
  const savedAddress = localStorage.getItem('whale_connected_wallet');
  if (savedAddress && window.ethereum) {
    userWalletAddress = savedAddress;
    handleSuccessfulConnection();
  }
}

async function handleSuccessfulConnection() {
  const addrDisplay = document.getElementById('walletAddressDisplay');
  const btnConnect = document.getElementById('btnConnectWallet');
  const dot = document.getElementById('walletStatusDot');

  if (userWalletAddress) {
    const shortened = `${userWalletAddress.substring(0, 6)}...${userWalletAddress.substring(38)}`;
    if (addrDisplay) addrDisplay.innerText = shortened;
    if (btnConnect) btnConnect.innerText = "WALLET CONNECTED";
    if (dot) dot.classList.add('is-online');
  }

  await fetchOnChainData();
}

async function fetchOnChainData() {
  if (TOKEN_CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    // Demo Mock Data Mode for testing before mainnet token deployment
    totalSupplyShare = 2.40;
    userTokenBalance = 240000;
    updateDashboardUI();
    return;
  }

  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const contract = new ethers.Contract(TOKEN_CONTRACT_ADDRESS, minABI, provider);

    const [rawBalance, rawSupply, decimals] = await Promise.all([
      contract.balanceOf(userWalletAddress),
      contract.totalSupply(),
      contract.decimals()
    ]);

    userTokenBalance = parseFloat(ethers.utils.formatUnits(rawBalance, decimals));
    const totalSupply = parseFloat(ethers.utils.formatUnits(rawSupply, decimals));

    totalSupplyShare = totalSupply > 0 ? (userTokenBalance / totalSupply) * 100 : 0;
    updateDashboardUI();
  } catch (err) {
    console.error("On-chain fetch error:", err);
  }
}

// --- 36-HOUR PERSISTENT VITALITY CLOCK ENGINE ---
function initHealthTimer() {
  let deathTimestamp = localStorage.getItem('whale_death_timestamp');
  const now = Date.now();
  const totalMsLifespan = TOTAL_LIFESPAN_HOURS * 60 * 60 * 1000;

  // Initialize once and never reset on browser refresh
  if (!deathTimestamp || isNaN(deathTimestamp)) {
    deathTimestamp = now + totalMsLifespan;
    localStorage.setItem('whale_death_timestamp', deathTimestamp);
  } else {
    deathTimestamp = parseInt(deathTimestamp);
  }

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    const currentTime = Date.now();
    const msRemaining = deathTimestamp - currentTime;

    if (msRemaining <= 0) {
      currentHealthPercent = 0;
      updateHealthUI(0, 0, 0);
      updateDashboardUI();
      clearInterval(timerInterval);
      return;
    }

    currentHealthPercent = Math.min(100, Math.max(0, (msRemaining / totalMsLifespan) * 100));

    const totalSeconds = Math.floor(msRemaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    updateHealthUI(hours, minutes, seconds);
  }, 1000);
}

function updateHealthUI(hours, minutes, seconds) {
  const fill = document.getElementById('healthBarFill');
  const pct = document.getElementById('healthPercent');
  const clock = document.getElementById('countdownTimer');
  const warning = document.getElementById('healthWarning');
  const whaleImg = document.getElementById('whaleImage');

  if (fill) {
    fill.style.width = `${currentHealthPercent}%`;
    fill.classList.remove('is-low', 'is-critical');
    if (currentHealthPercent < 25) {
      fill.classList.add('is-critical');
    } else if (currentHealthPercent < 50) {
      fill.classList.add('is-low');
    }
  }

  if (pct) pct.innerText = `${Math.round(currentHealthPercent)}%`;

  if (clock) {
    const fH = String(hours).padStart(2, '0');
    const fM = String(minutes).padStart(2, '0');
    const fS = String(seconds).padStart(2, '0');
    clock.innerText = `${fH}:${fM}:${fS}`;
  }

  if (warning) {
    if (currentHealthPercent <= 0) {
      warning.innerText = "💀 YOUR WHALE HAS BEEN RUGGED! Stack tokens or feed to revive.";
      warning.classList.add('is-danger');
      if (whaleImg) whaleImg.style.filter = "grayscale(100%) brightness(25%)";
    } else {
      warning.innerText = "Feed your whale before the timer hits zero or get RUGGED!";
      warning.classList.remove('is-danger');
    }
  }
}

function restoreHealth(percentageBoost) {
  const now = Date.now();
  const currentDeathTimestamp = parseInt(localStorage.getItem('whale_death_timestamp') || now);
  const totalMsLifespan = TOTAL_LIFESPAN_HOURS * 60 * 60 * 1000;

  const boostMs = (percentageBoost / 100) * totalMsLifespan;
  const newDeathTimestamp = Math.min(now + totalMsLifespan, currentDeathTimestamp + boostMs);

  localStorage.setItem('whale_death_timestamp', newDeathTimestamp);
  initHealthTimer();
}

// --- FEEDING & CHECK-IN MECHANICS WITH COOLDOWN LOCKS ---
function checkButtonCooldowns() {
  const btnCheckin = document.getElementById('btnDailyCheckin');
  const lastCheckin = localStorage.getItem('whale_last_checkin_date');
  const todayStr = new Date().toDateString();

  if (lastCheckin === todayStr && btnCheckin) {
    btnCheckin.setAttribute('disabled', 'true');
    btnCheckin.innerText = "CHECKED IN TODAY ✓";
  }
}

function handleDailyCheckin() {
  const btnCheckin = document.getElementById('btnDailyCheckin');
  const lastCheckin = localStorage.getItem('whale_last_checkin_date');
  const todayStr = new Date().toDateString();

  if (lastCheckin === todayStr) {
    alert("⚠️ You have already claimed your daily check-in today. Come back tomorrow!");
    return;
  }

  localStorage.setItem('whale_last_checkin_date', todayStr);
  restoreHealth(25);
  checkButtonCooldowns();
  alert("🎉 Daily check-in successful! +25% Health restored.");
}

function handleTweetFeed() {
  const lastTweet = parseInt(localStorage.getItem('whale_last_tweet_time') || '0');
  const hoursSince = (Date.now() - lastTweet) / (1000 * 60 * 60);

  if (hoursSince < COOLDOWN_FEED_HOURS) {
    const timeLeft = (COOLDOWN_FEED_HOURS - hoursSince).toFixed(1);
    alert(`⏳ X Feed Cooldown active. You can tweet again in ${timeLeft} hours.`);
    return;
  }

  localStorage.setItem('whale_last_tweet_time', Date.now());
  restoreHealth(50);

  const tweetText = `My Trench Whale is scaling up at ${totalSupplyShare.toFixed(2)}% supply share! Feed the beast or get rugged. CA: ${TOKEN_CONTRACT_ADDRESS}`;
  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
}

// --- UI DASHBOARD & DYNAMIC SIZE RENDERING ---
function updateDashboardUI() {
  const statShare = document.getElementById('statShare');
  const statTokens = document.getElementById('statTokens');
  const whaleImage = document.getElementById('whaleImage');
  const tierTitle = document.getElementById('tierTitle');
  const whaleDialogue = document.getElementById('whaleDialogue');
  const badgeChain = document.getElementById('badgeChain');
  const badgeLambo = document.getElementById('badgeLambo');

  if (statShare) statShare.innerText = `${totalSupplyShare.toFixed(2)}%`;
  if (statTokens) statTokens.innerText = userTokenBalance.toLocaleString();

  // Determine Tier and Scale based on Supply Share
  let activeTier = WHALE_TIERS[0];
  for (let tier of WHALE_TIERS) {
    if (totalSupplyShare >= tier.maxShare) {
      activeTier = tier;
    }
  }

  if (tierTitle) tierTitle.innerText = activeTier.title;
  if (whaleDialogue) whaleDialogue.innerText = `"${activeTier.dialogue}"`;

  // Apply pure size-driven scale transform & background blending on the master image
  if (whaleImage) {
    whaleImage.style.transform = `scale(${activeTier.scale})`;
    whaleImage.style.mixBlendMode = 'screen'; // Seamlessly knocks out white background against CRT dark backdrop
  }

  // Elite Holder Flex Badges toggle
  if (totalSupplyShare >= 5.0) {
    badgeChain?.classList.add('is-active');
    badgeLambo?.classList.add('is-active');
  } else {
    badgeChain?.classList.remove('is-active');
    badgeLambo?.classList.remove('is-active');
  }

  updateLeaderboardUI();
}

function updateLeaderboardUI() {
  const lbAddr1 = document.getElementById('lbAddr1');
  const lbShare1 = document.getElementById('lbShare1');
  const lbAddr2 = document.getElementById('lbAddr2');
  const lbShare2 = document.getElementById('lbShare2');
  const lbAddr3 = document.getElementById('lbAddr3');
  const lbShare3 = document.getElementById('lbShare3');

  if (lbAddr1) lbAddr1.innerText = "0x71C...89a2";
  if (lbShare1) lbShare1.innerText = "8.40%";
  if (lbAddr2) lbAddr2.innerText = "0x34A...12f4";
  if (lbShare2) lbShare2.innerText = "4.20%";
  if (lbAddr3) lbAddr3.innerText = "0x98B...ee01";
  if (lbShare3) lbShare3.innerText = "2.10%";
}

function handleMobileDeepLink(walletType) {
  const currentUrl = encodeURIComponent(window.location.href);
  const hostPath = window.location.host + window.location.pathname;

  if (walletType === 'metamask') window.location.href = `https://metamask.app.link/dapp/${hostPath}`;
  else if (walletType === 'robinhood') window.location.href = `https://wallet.robinhood.com/ul/browse/${currentUrl}`;
  else if (walletType === 'phantom') window.location.href = `https://phantom.app/ul/browse/${currentUrl}`;
  else if (walletType === 'coinbase') window.location.href = `https://go.cb-w.com/dapp?cb_url=${currentUrl}`;
  else if (walletType === 'trust') window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${currentUrl}`;
  else if (walletType === 'rainbow') window.location.href = `https://rainbow.me/m/dapp?url=${currentUrl}`;
}

// --- HTML5 CANVAS FLEX CARD GENERATOR ---
function generateFlexCard() {
  const canvas = document.getElementById('cardCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#040914';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border frame
  ctx.strokeStyle = '#00d8ff';
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

  // Title
  ctx.fillStyle = '#00d8ff';
  ctx.font = 'bold 44px "Chakra Petch", monospace';
  ctx.fillText('TRENCH WHALE STATUS CARD', 60, 110);

  // Supply Share
  ctx.fillStyle = '#00ff66';
  ctx.font = 'bold 38px "Chakra Petch", monospace';
  ctx.fillText(`SUPPLY SHARE: ${totalSupplyShare.toFixed(2)}%`, 60, 190);

  // Tokens
  ctx.fillStyle = '#ffffff';
  ctx.font = '28px "JetBrains Mono", monospace';
  ctx.fillText(`BAG: ${userTokenBalance.toLocaleString()} TOKENS`, 60, 250);

  // Vitality
  ctx.fillStyle = '#fbbf24';
  ctx.font = '28px "JetBrains Mono", monospace';
  ctx.fillText(`VITALITY: ${Math.round(currentHealthPercent)}% HEALTH`, 60, 310);

  // Footer Tagline
  ctx.fillStyle = '#6f88ad';
  ctx.font = '22px "JetBrains Mono", monospace';
  ctx.fillText('ROBINHOOD LAUNCH • FEED OR GET RUGGED', 60, 550);

  // Trigger Download
  const link = document.createElement('a');
  link.download = 'trench-whale-flex.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}