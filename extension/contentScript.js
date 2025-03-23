let oauthToken = null;
let authToken = null;
let lastHandledShortsTitle = null;
const matchedFeedVideos = new Set();

// -------------------------------
// GPT Relevance Check via Backend
// -------------------------------
async function isRelevantToKeyword(title) {
  if (!authToken) {
    console.warn("[EXTENSION] No backend auth token available");
    return false;
  }

  try {
    const response = await fetch("http://localhost:3000/analyze-title", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authToken,
      },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      console.warn("[EXTENSION] Server returned non-200:", response.status);
      return false;
    }

    const data = await response.json();
    return !!data.relevant;
  } catch (error) {
    console.error("[EXTENSION] Failed to call backend:", error);
    return false;
  }
}

// -------------------------------
// Feed Logic
// -------------------------------
function markFeedVideoNotInterested(video) {
  const moreButton = video.querySelector('button#button[aria-label]');
  if (!moreButton) {
    console.warn("[EXTENSION][FEED] 3-dot menu not found. Will retry.");
    return false;
  }

  moreButton.click();

  setTimeout(() => {
    const menuItems = document.querySelectorAll('tp-yt-paper-item[role="option"]');
    let clicked = false;

    for (const item of menuItems) {
      const text = item.innerText.trim().toLowerCase();
      if (text === "not interested") {
        console.log("[EXTENSION][FEED] Clicking 'Not interested'...");
        item.click();
        video.dataset.notInterestedClicked = "true";
        matchedFeedVideos.delete(video);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.warn("[EXTENSION][FEED] 'Not interested' option not found.");
    }
  }, 220);
}

function scanFeed() {
  const videos = document.querySelectorAll("ytd-rich-item-renderer");

  videos.forEach(video => {
    if (video.dataset.notInterestedClicked === "true") return;

    const titleEl = video.querySelector("#video-title");
    if (!titleEl) return;

    const title = titleEl.innerText.trim();

    if (matchedFeedVideos.has(video)) {
      console.log(`[EXTENSION][FEED] Retrying GPT-confirmed: "${title}"`);
      markFeedVideoNotInterested(video);
      return;
    }

    isRelevantToKeyword(title).then((relevant) => {
      if (relevant) {
        console.log(`[EXTENSION][FEED] GPT matched: "${title}"`);
        matchedFeedVideos.add(video);
        markFeedVideoNotInterested(video);
      }
    });
  });
}

// -------------------------------
// Shorts Logic
// -------------------------------
function getVisibleShortCard() {
  const cards = document.querySelectorAll("ytd-reel-video-renderer, ytd-reel-player-renderer");

  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const centerY = window.innerHeight / 2;
    if (rect.top <= centerY && rect.bottom >= centerY) {
      return card;
    }
  }

  return null;
}

function getVisibleShortsTitle() {
  const card = getVisibleShortCard();
  if (!card) return null;

  const h2 = card.querySelector('yt-shorts-video-title-view-model h2');
  if (!h2) return null;

  const spans = h2.querySelectorAll('span');
  return Array.from(spans).map(s => s.innerText.trim()).join(' ').trim();
}

function markVisibleShortAsNotRecommended() {
  const moreButton = document.querySelector(
    'ytd-reel-player-overlay-renderer button[aria-label*="More actions"], ' +
    'ytd-reel-player-overlay-renderer button[aria-label*="Menu"]'
  );

  if (!moreButton) {
    console.warn("[EXTENSION][SHORTS] 3-dot menu not found. Will retry...");
    return;
  }

  console.log("[EXTENSION][SHORTS] Clicking 3-dot menu...");
  moreButton.click();

  setTimeout(() => {
    const menuItems = document.querySelectorAll('tp-yt-paper-item[role="option"]');
    let found = false;

    for (const item of menuItems) {
      const text = item.innerText.trim().toLowerCase();
      if (text.includes("don't recommend")) {
        console.log("[EXTENSION][SHORTS] Clicking 'Don't recommend this channel'...");
        item.click();
        found = true;
        break;
      }
    }

    if (!found) {
      console.warn("[EXTENSION][SHORTS] Menu opened, but 'Don't recommend' not found.");
    }
  }, 220);
}

function scanShorts() {
  const currentTitle = getVisibleShortsTitle();
  if (!currentTitle || currentTitle === lastHandledShortsTitle) return;

  console.log(`[EXTENSION][SHORTS] Current Shorts title: "${currentTitle}"`);

  isRelevantToKeyword(currentTitle).then((relevant) => {
    if (relevant) {
      console.log(`[EXTENSION][SHORTS] GPT matched: "${currentTitle}"`);
      markVisibleShortAsNotRecommended();
    }
    lastHandledShortsTitle = currentTitle;
  });
}

// -------------------------------
// One-time Feed Title Log
// -------------------------------
function logAllFeedVideoTitles() {
  const videos = document.querySelectorAll("ytd-rich-item-renderer");
  console.log(`[EXTENSION][INIT] Found ${videos.length} videos in the feed:`);

  videos.forEach((video, i) => {
    const titleEl = video.querySelector("#video-title");
    const title = titleEl?.innerText?.trim() || "[NO TITLE FOUND]";
    console.log(`${i + 1}. ${title}`);
  });
}

// -------------------------------
// Dispatcher
// -------------------------------
function runExtensionLoop() {
  if (location.href.includes("/shorts/")) {
    scanShorts();
  } else {
    scanFeed();
  }
}

// -------------------------------
// Init
// -------------------------------
function initExtension() {
  // Get YouTube OAuth token
  chrome.runtime.sendMessage({ type: "getAuthToken" }, (response) => {
    if (response?.token) {
      oauthToken = response.token;
      console.log("[EXTENSION] Got OAuth token:", oauthToken);
    } else {
      console.warn("[EXTENSION] Failed to get OAuth token:", response?.error);
    }
  });

  // Get backend auth token and trigger background flow
  chrome.storage.local.get(['authToken'], ({ authToken: storedToken }) => {
    if (storedToken) {
      authToken = storedToken;
      console.log("[EXTENSION] Got backend auth token:", authToken);

      // ✅ Trigger search + like flow in background
      chrome.runtime.sendMessage({ type: "searchAndLikeFromPreferences" }, (response) => {
        if (response?.status) {
          console.log("[EXTENSION] Search & like flow triggered:", response.status);
        } else {
          console.warn("[EXTENSION] Could not start search & like flow:", response?.error);
        }
      });

      runExtensionLoop();
      if (!location.href.includes("/shorts/")) {
        logAllFeedVideoTitles();
      }

      setInterval(runExtensionLoop, 2600);
    } else {
      console.warn("[EXTENSION] No backend auth token found. Please log in via popup.");
    }
  });
}

initExtension();
