// ----------------------------
// Token Handling (with refresh support)
// ----------------------------
function getFreshAuthToken(callback) {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
      console.error("[EXTENSION] Failed to get token:", chrome.runtime.lastError?.message || "No token");
      return callback(null);
    }

    console.log("[EXTENSION] Got token:", token);
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
// YouTube API Helpers
// ----------------------------
function searchVideos(token, query = "Professor Live Basketball", max = 6) {
  console.log("[EXTENSION] Starting searchVideos with token:", token);

  return fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${max}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then(res => {
      console.log("[EXTENSION] Search response status:", res.status);
      if (!res.ok) {
        return res.text().then(text => {
          console.error("[EXTENSION] Search API error body:", text);
          if (res.status === 401) throw new Error("unauthorized");
          throw new Error("search_failed");
        });
      }
      return res.json();
    })
    .then(data => {
      console.log("[EXTENSION] Search data received:", data);
      const videoIds = data.items?.map(item => item.id.videoId).filter(Boolean) || [];
      return videoIds;
    });
}

function likeVideo(videoId, token) {
  console.log(`[EXTENSION] Liking video: ${videoId}`);
  return fetch(`https://www.googleapis.com/youtube/v3/videos/rate?id=${videoId}&rating=like`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  }).then(res => {
    console.log(`[EXTENSION] Like response status for ${videoId}:`, res.status);
    if (!res.ok) {
      return res.text().then(text => {
        console.warn(`[EXTENSION] Failed to like video ${videoId}. Body:`, text);
        if (res.status === 401) throw new Error("unauthorized");
        throw new Error("like_failed");
      });
    } else {
      console.log(`[EXTENSION] Successfully liked video: ${videoId}`);
    }
  });
}

// ----------------------------
// Search and Like Flow
// ----------------------------
function searchAndLike(token) {
  searchVideos(token)
    .then(videoIds => {
      console.log("[EXTENSION] Attempting to like videos:", videoIds);
      return Promise.all(videoIds.map(id => likeVideo(id, token)));
    })
    .catch(err => {
      if (err.message === "unauthorized") {
        console.warn("[EXTENSION] Token unauthorized. Refreshing and retrying...");
        refreshTokenAndRetry(searchAndLike);
      } else {
        console.error("[EXTENSION] YouTube API error:", err);
      }
    });
}

// ----------------------------
// Message Listener: likeSearchResults
// ----------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "likeSearchResults") {
    console.log("[EXTENSION] Starting search and like flow...");
    getFreshAuthToken((token) => {
      if (token) {
        searchAndLike(token);
        sendResponse({ status: "Search and like flow triggered" });
      } else {
        sendResponse({ error: "Failed to get token" });
      }
    });

    return true; // Keeps message port open for async sendResponse
  }

  // ----------------------------
  // Message Listener: getAuthToken
  // ----------------------------
  if (message.type === "getAuthToken") {
    getFreshAuthToken((token) => {
      if (token) {
        console.log("[EXTENSION] Returning token to sender");
        sendResponse({ token });
      } else {
        sendResponse({ error: "Failed to get token" });
      }
    });

    return true;
  }
});
