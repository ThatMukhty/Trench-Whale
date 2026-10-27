/* ================================================================= */
/* TRENCH WHALE | PRODUCTION-READY BACKEND ENGINE (`script.js`)       */
/* ================================================================= */

const CONFIG = {
  TOKEN_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
  CHAIN_ID: "0x1", // Ethereum Mainnet (or "0xaa36a7" for Sepolia Testnet)
  VITALITY_HOURS: 36,
  FEED_COOLDOWN_HOURS: 12
};

let state = {
  walletConnected: false,
  walletAddress: "",
  sharePercent: 2.40,
  verifiedTokens: "1,250,400",
  lastFedTimestamp: 0,
  lastCheckinDate: "",
  vitalityExpiresAt: Date.now() + (CONFIG.VITALITY_HOURS * 3600 * 1000)
};

let connectedWalletAddress = "";
const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheDOM();
  loadStateFromStorage();
  initEventListeners();
  startVitalityLoop();
  checkAutoReconnect();
  updateUI();
});

function cacheDOM() {
  els.btnConnectWallet = document.getElementById("btnConnectWallet");
  els.walletStatusDot = document.getElementById("walletStatusDot");
  els.walletAddressDisplay = document.getElementById("walletAddressDisplay");
  els.statShare = document.getElementById("statShare");
  els.statTokens = document.getElementById("statTokens");
  els.whaleImage = document.getElementById("whaleImage");
  els.whaleImageWrap = document.getElementById("whaleImageWrap");
  els.tierTitle = document.getElementById("tierTitle");
  els.healthPercent = document.getElementById("healthPercent");
  els.healthBarFill = document.getElementById("healthBarFill");
  els.countdownTimer = document.getElementById("countdownTimer");
  els.healthWarning = document.getElementById("healthWarning");
  els.btnFeedX = document.getElementById("btnFeedX");
  els.btnDailyCheckin = document.getElementById("btnDailyCheckin");
  els.btnDownloadCard = document.getElementById("btnDownloadCard");
  els.btnCopyCA = document.getElementById("btnCopyCA");
  els.contractAddress = document.getElementById("contractAddress");
  els.walletModal = document.getElementById("walletModal");
  els.btnCloseWalletModal = document.getElementById("btnCloseWalletModal");
  els.alarmOverlay = document.getElementById("alarmOverlay");
  els.whaleDialogue = document.getElementById("whaleDialogue");
  els.cardCanvas = document.getElementById("cardCanvas");
}

function initEventListeners() {
  els.btnConnectWallet.addEventListener("click", openWalletModal);
  els.btnCloseWalletModal.addEventListener("click", closeWalletModal);
  
  document.querySelectorAll("[data-close-modal]").forEach(el => {
    el.addEventListener("click", closeWalletModal);
  });

  // Bind click listener for all 6 wallet modal options
  document.querySelectorAll(".wallet-opt").forEach(btn => {
    btn.addEventListener("click", (e) => window.connectSelectedWallet(e.target.dataset.wallet));
  });

  els.btnFeedX.addEventListener("click", handleFeedAction);
  els.btnDailyCheckin.addEventListener("click", handleDailyCheckin);
  els.btnDownloadCard.addEventListener("click", generateFlexCard);
  els.btnCopyCA.addEventListener("click", copyContractAddress);

  if (CONFIG.TOKEN_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    els.contractAddress.textContent = CONFIG.TOKEN_CONTRACT_ADDRESS;
  }
}

function loadStateFromStorage() {
  const saved = localStorage.getItem("trench_whale_state");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.lastFedTimestamp = parsed.lastFedTimestamp || 0;
      state.lastCheckinDate = parsed.lastCheckinDate || "";
      if (parsed.vitalityExpiresAt && parsed.vitalityExpiresAt > Date.now()) {
        state.vitalityExpiresAt = parsed.vitalityExpiresAt;
      }
    } catch (e) {
      console.error("Failed to parse storage state", e);
    }
  }
}

function saveStateToStorage() {
  localStorage.setItem("trench_whale_state", JSON.stringify({
    lastFedTimestamp: state.lastFedTimestamp,
    lastCheckinDate: state.lastCheckinDate,
    vitalityExpiresAt: state.vitalityExpiresAt
  }));
}

function openWalletModal() {
  if (state.walletConnected) {
    alert(`Connected EVM Address: ${state.walletAddress}`);
    return;
  }
  if (els.walletModal) els.walletModal.hidden = false;
}

function closeWalletModal() {
  if (els.walletModal) els.walletModal.hidden = true;
}

// AUTO-RECONNECT (PERSISTENCE)
async function checkAutoReconnect() {
  const isPreviouslyConnected = localStorage.getItem("trench_whale_connected") === "true";
  const savedAddress = localStorage.getItem("trench_whale_address");

  if (isPreviouslyConnected && typeof window.ethereum !== "undefined") {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      const accounts = await provider.send("eth_accounts", []);
      if (accounts && accounts.length > 0) {
        updateWalletUI(accounts[0]);
      } else if (savedAddress) {
        updateWalletUI(savedAddress);
      }
    } catch (e) {
      if (savedAddress) updateWalletUI(savedAddress);
    }
  } else if (isPreviouslyConnected && savedAddress) {
    updateWalletUI(savedAddress);
  }
}

// =================================================================
// YOUR WALLET CONNECTION CODE (EXTENDED FOR ALL 6 WALLETS)
// =================================================================
window.connectSelectedWallet = async function(walletType) {
  let provider = null;

  try {
    // 1. Detect specific wallet providers injected into browser
    if (walletType === 'phantom') {
      provider = (window.phantom && window.phantom.ethereum) || (window.phantom && window.phantom.solana) || window.ethereum;
    } else if (walletType === 'coinbase') {
      provider = window.coinbaseWalletExtension || window.ethereum;
    } else if (walletType === 'trust') {
      provider = window.trustwallet || window.ethereum;
    } else if (walletType === 'metamask' || walletType === 'robinhood' || walletType === 'rainbow') {
      provider = window.ethereum;
    }

    // 2. Mobile deep-linking handler if provider isn't injected
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (!provider && isMobile) {
      const currentUrl = encodeURIComponent(window.location.href);
      const cleanHost = window.location.host + window.location.pathname;

      if (walletType === 'metamask') {
        window.location.href = `https://metamask.app.link/dapp/${cleanHost}`;
        return;
      } else if (walletType === 'phantom') {
        window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}`;
        return;
      } else if (walletType === 'trust') {
        window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${currentUrl}`;
        return;
      } else if (walletType === 'coinbase') {
        window.location.href = `https://go.cb-w.com/dapp?url=${currentUrl}`;
        return;
      } else if (walletType === 'rainbow') {
        window.location.href = `https://rainbow.me/app/open?url=${currentUrl}`;
        return;
      } else if (walletType === 'robinhood') {
        window.location.href = `https://robinhood.com`;
        return;
      }
    }

    if (!provider) {
      alert(`Please install or open ${walletType.toUpperCase()} browser extension or app.`);
      return;
    }

    // 3. Prompt user's wallet to connect and fetch active EVM address
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    
    if (accounts && accounts.length > 0) {
      // 4. Capture the active Ethereum wallet address automatically
      connectedWalletAddress = accounts[0];

      // Request network switch if configured
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CONFIG.CHAIN_ID }],
        });
      } catch (e) {
        console.warn('Chain switch declined or unhandled:', e);
      }

      // Update UI & save connection persistence
      updateWalletUI(connectedWalletAddress);
      
      closeWalletModal();
    }
  } catch (err) {
    console.error('Wallet error:', err);
    alert('Wallet connection failed: ' + (err.message || 'User cancelled'));
  }
};

// =================================================================
// HELPER: UPDATE WALLET UI & SAVE STATE
// =================================================================
function updateWalletUI(address) {
  state.walletConnected = true;
  state.walletAddress = address;
  connectedWalletAddress = address;

  localStorage.setItem("trench_whale_connected", "true");
  localStorage.setItem("trench_whale_address", address);

  // Attempt live balance query if contract address is set
  if (CONFIG.TOKEN_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" && typeof window.ethereum !== "undefined") {
    const web3Provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    fetchOnChainData(web3Provider, address);
  } else {
    // Default baseline values for live demo
    state.sharePercent = 3.85;
    state.verifiedTokens = "4,200,000";
  }

  updateUI();
  triggerDialogue("EVM Wallet Linked: " + address.substring(0, 6) + "..." + address.substring(address.length - 4));
}

async function fetchOnChainData(provider, address) {
  try {
    const abi = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"];
    const contract = new ethers.Contract(CONFIG.TOKEN_CONTRACT_ADDRESS, abi, provider);
    
    const balanceBN = await contract.balanceOf(address);
    const supplyBN = await contract.totalSupply();
    
    const userTokens = parseFloat(ethers.utils.formatUnits(balanceBN, 18));
    const totalSupply = parseFloat(ethers.utils.formatUnits(supplyBN, 18));
    
    state.verifiedTokens = userTokens.toLocaleString(undefined, {maximumFractionDigits: 0});
    state.sharePercent = totalSupply > 0 ? Number(((userTokens / totalSupply) * 100).toFixed(2)) : 0.01;
    
    updateUI();
  } catch (e) {
    console.warn("On-chain fetch skipped.", e);
  }
}

// VITALITY & COUNTDOWN LOOP
function startVitalityLoop() {
  setInterval(() => {
    const now = Date.now();
    const timeLeft = state.vitalityExpiresAt - now;

    if (timeLeft <= 0) {
      els.countdownTimer.textContent = "00:00:00 (RUGGED)";
      els.healthPercent.textContent = "0%";
      els.healthBarFill.style.width = "0%";
      els.healthBarFill.style.backgroundColor = "var(--danger-red)";
      triggerPanicAlarm(true);
      return;
    }

    const totalDuration = CONFIG.VITALITY_HOURS * 3600 * 1000;
    const percentRemaining = Math.max(0, Math.min(100, (timeLeft / totalDuration) * 100));

    els.healthPercent.textContent = `${percentRemaining.toFixed(1)}%`;
    els.healthBarFill.style.width = `${percentRemaining}%`;

    if (percentRemaining < 10) {
      triggerPanicAlarm(true);
      els.healthBarFill.style.backgroundColor = "var(--danger-red)";
    } else {
      triggerPanicAlarm(false);
      els.healthBarFill.style.backgroundColor = "var(--neon-cyan)";
    }

    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    els.countdownTimer.textContent = 
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
}

function triggerPanicAlarm(active) {
  if (els.alarmOverlay) els.alarmOverlay.hidden = !active;
}

function handleFeedAction() {
  const now = Date.now();
  const cooldownMs = CONFIG.FEED_COOLDOWN_HOURS * 3600 * 1000;
  
  if (now - state.lastFedTimestamp < cooldownMs) {
    const remainingHours = ((cooldownMs - (now - state.lastFedTimestamp)) / (1000 * 60 * 60)).toFixed(1);
    alert(`Whale is full! Feed cooldown active. Try again in ${remainingHours} hours.`);
    return;
  }

  state.vitalityExpiresAt = Math.max(state.vitalityExpiresAt, now) + (12 * 3600 * 1000);
  state.lastFedTimestamp = now;
  saveStateToStorage();

  const tweetText = encodeURIComponent(`My Trench Whale is breaching the abyss on @TrenchWhale! Supply share: ${state.sharePercent}%. Feed your beast or get rugged.`);
  window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
  
  triggerDialogue("Delicious liquidity! Vitality restored by +50%.");
  updateUI();
}

function handleDailyCheckin() {
  const todayStr = new Date().toDateString();
  if (state.lastCheckinDate === todayStr) {
    alert("Daily check-in already claimed today. Return tomorrow!");
    return;
  }

  state.vitalityExpiresAt += (24 * 3600 * 1000);
  state.lastCheckinDate = todayStr;
  saveStateToStorage();

  triggerDialogue("Daily check-in verified. Diamond hands hold strong.");
  updateUI();
}

function updateUI() {
  if (state.walletConnected && state.walletAddress) {
    els.walletStatusDot.classList.add("connected");
    const shortened = `${state.walletAddress.substring(0, 6)}...${state.walletAddress.substring(state.walletAddress.length - 4)}`;
    els.walletAddressDisplay.textContent = shortened;
    els.btnConnectWallet.textContent = "CONNECTED";
    els.healthWarning.textContent = "Vitality clock active. Feed regularly.";
  }

  els.statShare.textContent = `${state.sharePercent}%`;
  els.statTokens.textContent = state.verifiedTokens;

  let scaleFactor = 0.78;
  let tierName = "BABY TRENCH SHARK 🦈";
  
  if (state.sharePercent >= 5.0) {
    scaleFactor = 1.15;
    tierName = "GOD-TIER LEVIATHAN 🐋👑";
  } else if (state.sharePercent >= 2.0) {
    scaleFactor = 0.95;
    tierName = "ALPHA WHALE 🐋";
  } else if (state.sharePercent >= 0.5) {
    scaleFactor = 0.85;
    tierName = "CHAD DOLPHIN 🐬";
  }

  els.whaleImageWrap.style.transform = `scale(${scaleFactor})`;
  els.tierTitle.textContent = tierName;
}

function triggerDialogue(text) {
  if (els.whaleDialogue) {
    els.whaleDialogue.textContent = text;
    setTimeout(() => {
      if (els.whaleDialogue.textContent === text) {
        els.whaleDialogue.textContent = "Connect wallet to awaken your leviathan.";
      }
    }, 5000);
  }
}

function copyContractAddress() {
  const caText = els.contractAddress.textContent;
  navigator.clipboard.writeText(caText).then(() => {
    els.btnCopyCA.textContent = "COPIED!";
    setTimeout(() => els.btnCopyCA.textContent = "COPY CA", 2000);
  });
}

function generateFlexCard() {
  const canvas = els.cardCanvas;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#040914";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#00d8ff";
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

  ctx.fillStyle = "#00d8ff";
  ctx.font = "bold 48px 'Chakra Petch', sans-serif";
  ctx.fillText("TRENCH WHALE TERMINAL", 90, 130);

  ctx.fillStyle = "#e2f1ff";
  ctx.font = "28px 'JetBrains Mono', monospace";
  ctx.fillText(`HOLDER: ${state.walletAddress || "ANONYMOUS TRENCH TRADER"}`, 90, 190);
  ctx.fillText(`SUPPLY SHARE: ${state.sharePercent}%`, 90, 250);
  ctx.fillText(`TIER: ${els.tierTitle.textContent}`, 90, 310);

  ctx.fillStyle = "#7a9cc6";
  ctx.font = "22px 'JetBrains Mono', monospace";
  ctx.fillText("FEED OR GET RUGGED • TRENCHWHALE.APP", 90, 530);

  const link = document.createElement("a");
  link.download = "trench-whale-flex-card.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}