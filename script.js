/* ================================================================= */
/* TRENCH WHALE | PRODUCTION-READY BACKEND ENGINE (`script.js`)       */
/* ================================================================= */

const CONFIG = {
  TOKEN_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
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

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheDOM();
  loadStateFromStorage();
  initEventListeners();
  startVitalityLoop();
  checkAutoReconnect(); // Automatically reconnect if previously connected
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

  document.querySelectorAll(".wallet-opt").forEach(btn => {
    btn.addEventListener("click", (e) => connectWalletProvider(e.target.dataset.wallet));
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
  // If already connected, clicking wallet button can copy or show status
  if (state.walletConnected) {
    alert(`Connected Wallet: ${state.walletAddress}`);
    return;
  }
  els.walletModal.hidden = false;
}

function closeWalletModal() {
  els.walletModal.hidden = true;
}

// AUTO-RECONNECT: Check if user already connected previously in this browser session
async function checkAutoReconnect() {
  if (typeof window.ethereum !== "undefined") {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      // Check already authorized accounts without prompting popup
      const accounts = await provider.send("eth_accounts", []);
      if (accounts && accounts.length > 0) {
        state.walletConnected = true;
        state.walletAddress = accounts[0];
        localStorage.setItem("trench_whale_connected", "true");
        updateUI();
      }
    } catch (err) {
      console.warn("Auto-reconnect check failed", err);
    }
  } else if (localStorage.getItem("trench_whale_connected") === "true") {
    // Fallback persisted session
    const savedAddr = localStorage.getItem("trench_whale_address");
    if (savedAddr) {
      state.walletConnected = true;
      state.walletAddress = savedAddr;
      updateUI();
    }
  }
}

// DIRECT EVM WALLET CONNECTION (EIP-1193 API)
async function connectWalletProvider(providerName) {
  closeWalletModal();
  try {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      
      // Request account access using standard EIP-1193 provider API
      const accounts = await provider.send("eth_requestAccounts", []);
      
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        state.walletConnected = true;
        state.walletAddress = address;
        
        // Save persistence so user doesn't have to connect again
        localStorage.setItem("trench_whale_connected", "true");
        localStorage.setItem("trench_whale_address", address);

        if (CONFIG.TOKEN_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
          await fetchOnChainData(provider, address);
        } else {
          state.sharePercent = 3.85;
          state.verifiedTokens = "4,200,000";
        }

        updateUI();
        triggerDialogue("Wallet connected successfully. Leviathan active.");
      }
    } else {
      alert("No EVM-compatible Web3 wallet found. Please install MetaMask or open inside a Web3 browser.");
    }
  } catch (err) {
    console.error("Wallet connection user rejection or error:", err);
  }
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
  } catch (e) {
    console.warn("On-chain fetch skipped.", e);
  }
}

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
  if (active) {
    els.alarmOverlay.hidden = false;
  } else {
    els.alarmOverlay.hidden = true;
  }
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
    // Shorten address for display while retaining full address internally
    const shortenedAddr = `${state.walletAddress.substring(0, 6)}...${state.walletAddress.substring(state.walletAddress.length - 4)}`;
    els.walletAddressDisplay.textContent = shortenedAddr;
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