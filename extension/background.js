// ----------------------------
// Token Handling (with refresh support)
// ----------------------------
function getFreshAuthToken(callback) {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
      console.error("[EXTENSION] Failed to get token:", chrome.runtime.lastError?.message || "No token");
      return callback(null);
    }

    console.log("[EXTENSION] Got OAuth token:", token);
    setTimeout(() => callback(token), 200); // slight delay prevents race conditions
  });
}

function refreshTokenAndRetry(callback) {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (!token) return getFreshAuthToken(callback);

    chrome.identity.removeCachedAuthToken({ token }, () => {
      console.log("[EXTENSION] Removed stale token:", token);
      getFreshAuthToken(callback);
    });
  });
}

// ----------------------------
// Backend: Get recommended channels from GPT
// ----------------------------
function fetchRecommendedChannels(backendToken) {
  return fetch("http://localhost:3000/recommended-channels", {
    headers: {
      Authorization: backendToken
    }
  })
    .then(res => res.json())
    .then(data => data.channels || []);
}

// ----------------------------
// YouTube API Helpers
// ----------------------------
function searchVideos(ytToken, query, max = 3) {
  return fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${max}`, {
    headers: {
      Authorization: `Bearer ${ytToken}`
    }
  })
    .then(res => {
      if (!res.ok) {
        return res.text().then(text => {
          console.error("[EXTENSION] Search API error:", text);
          throw new Error("search_failed");
        });
      }
      return res.json();
    })
    .then(data => (data.items || []).map(item => item.id.videoId).filter(Boolean));
}

function likeVideo(videoId, ytToken) {
  return fetch(`https://www.googleapis.com/youtube/v3/videos/rate?id=${videoId}&rating=like`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ytToken}`
    }
  }).then(res => {
    if (!res.ok) {
      return res.text().then(text => {
        console.warn(`[EXTENSION] Failed to like video ${videoId}. Body:`, text);
        throw new Error("like_failed");
      });
    }
    console.log(`[EXTENSION] Successfully liked video: ${videoId}`);
  });
}

// ----------------------------
// GPT-based search + like flow
// ----------------------------
function searchAndLikeFromPreferences(ytToken, backendToken) {
  fetchRecommendedChannels(backendToken).then(channels => {
    console.log("[EXTENSION] Recommended channels:", channels);

    return Promise.all(
      channels.map(channel =>
        searchVideos(ytToken, channel, 1).then(videoIds =>
          Promise.all(videoIds.map(id => likeVideo(id, ytToken)))
        )
      )
    );
  }).then(() => {
    console.log("[EXTENSION] Finished liking recommended content");
  }).catch(err => {
    console.error("[EXTENSION] Error in search/like flow:", err);
    if (err.message === "unauthorized") {
      console.warn("[EXTENSION] YouTube token expired, refreshing...");
      refreshTokenAndRetry((newYtToken) => {
        if (!newYtToken) return;
        searchAndLikeFromPreferences(newYtToken, backendToken);
      });
    }
  });
}

// ----------------------------
// Message Listener
// ----------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "searchAndLikeFromPreferences") {
    console.log("[EXTENSION] Received message to start search-and-like flow");

    // Get both tokens: YouTube + backend
    getFreshAuthToken((ytToken) => {
      if (!ytToken) {
        console.error("[EXTENSION] Could not get YouTube OAuth token");
        sendResponse({ error: "No YouTube token" });
        return;
      }

      chrome.storage.local.get(["authToken"], ({ authToken }) => {
        if (!authToken) {
          console.error("[EXTENSION] No backend auth token");
          sendResponse({ error: "No backend token" });
          return;
        }

        searchAndLikeFromPreferences(ytToken, authToken);
        sendResponse({ status: "Started search and like flow" });
      });
    });

    return true; // Keep async channel open
  }

  // Token passthrough for content script
  if (message.type === "getAuthToken") {
    getFreshAuthToken((token) => {
      if (token) {
        sendResponse({ token });
      } else {
        sendResponse({ error: "Failed to get token" });
      }
    });

    return true;
  }
});
