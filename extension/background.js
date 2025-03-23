chrome.runtime.onInstalled.addListener(() => {
  console.log("[EXTENSION] Installed.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getAuthToken") {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error("Auth error:", chrome.runtime.lastError.message);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        console.log("[EXTENSION][AUTH] Got OAuth token:", token);
        sendResponse({ token });
      }
    });

    return true; // Required for async sendResponse
  }
});
