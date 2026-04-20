(() => {
  const toggle = document.getElementById("enableToggle");
  const scanBtn = document.getElementById("scanBtn");
  const statusMsg = document.getElementById("statusMsg");

  chrome.storage.sync.get(["enabled"], (res) => {
    toggle.checked = res.enabled !== false;
  });

  toggle.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: toggle.checked });
  });

  function showStatus() {
    statusMsg.textContent = "filled!";
    statusMsg.classList.add("show");
    scanBtn.classList.add("success");
    scanBtn.innerHTML = "✓ DONE";
    setTimeout(() => {
      statusMsg.classList.remove("show");
      scanBtn.classList.remove("success");
      scanBtn.innerHTML = '<span>⚡</span> FILL NOW';
    }, 2000);
  }

  scanBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { action: "manualScan" }, () => {
        // Explicitly check lastError to suppress the "port closed" warning
        if (chrome.runtime.lastError) {
          console.debug("AutoFill:", chrome.runtime.lastError.message);
        }
        showStatus();
      });
    });
  });
})();
