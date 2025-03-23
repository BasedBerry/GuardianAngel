const KEYWORD = "chess"; // Customize your keyword here

// -------------------------------
// Utility
// -------------------------------
function titleMatches(text) {
  return text.toLowerCase().includes(KEYWORD.toLowerCase());
}

// -------------------------------
// Feed Logic (Regular Videos)
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
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.warn("[EXTENSION][FEED] 'Not interested' option not found.");
    }
  }, 500);
}

function scanFeed() {
  const videos = document.querySelectorAll("ytd-rich-item-renderer");

  videos.forEach(video => {
    if (video.dataset.notInterestedClicked === "true") return;

    const titleEl = video.querySelector("#video-title");
    if (!titleEl) return;

    const title = titleEl.innerText.trim();
    if (titleMatches(title)) {
      console.log(`[EXTENSION][FEED] Match: "${title}"`);
      markFeedVideoNotInterested(video);
    }
  });
}

// -------------------------------
// Shorts Logic (Now Uses Visible Card)
// -------------------------------
let lastHandledShortsTitle = null;

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
  }, 500);
}

function scanShorts() {
  const currentTitle = getVisibleShortsTitle();
  if (!currentTitle) return;

  if (currentTitle === lastHandledShortsTitle) return;

  console.log(`[EXTENSION][SHORTS] Current Shorts title: "${currentTitle}"`);

  if (titleMatches(currentTitle)) {
    console.log(`[EXTENSION][SHORTS] Title matches "${KEYWORD}". Taking action...`);
    markVisibleShortAsNotRecommended();
    lastHandledShortsTitle = currentTitle;
  } else {
    lastHandledShortsTitle = currentTitle;
  }
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

// Run every 4 seconds
setInterval(runExtensionLoop, 4000);

// Initial run
if (!location.href.includes("/shorts/")) {
  logAllFeedVideoTitles();
}
runExtensionLoop();
