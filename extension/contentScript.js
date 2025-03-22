// ============================
//  CONFIG
// ============================




// import OpenAI from "openai";
// const client = new OpenAI();
//
// const response = await client.responses.create({
//     model: "gpt-4o",
//     input: "Write a one-sentence bedtime story about a unicorn."
// });
//
// console.log(response.output_text);


const KEYWORD = "Jeopardy";         // case-insensitive match
const SCAN_INTERVAL = 3000;      // scan every 5 seconds

console.log("[EXTENSION] Content script loaded on YouTube.");

// ============================
//  FUNCTIONS
// ============================

/**
 * Checks if the given title contains KEYWORD (case-insensitive).
 */
function titleContainsKeyword(titleText, keyword) {
    // Convert both strings to lowercase
    const lowerTitle = (titleText || "").toLowerCase();
    const lowerKeyword = (keyword || "").toLowerCase();
    return lowerTitle.includes(lowerKeyword);
}

/**
 * Attempts to click "Not Interested" for a specific video item.
 */
function markNotInterested(videoElement) {
    try {
        console.log("[EXTENSION] markNotInterested() called.");

        // Find the 3-dot "More" button within this video item
        const moreButton = videoElement.querySelector("button#button[aria-label]");
        if (!moreButton) {
            console.warn("[EXTENSION] No 'More' (3-dot) button found in this video element. Skipping...");
            return;
        }

        console.log("[EXTENSION] Clicking the 3-dot 'More' button...");
        moreButton.click();

        // Wait a bit for the menu to appear
        setTimeout(() => {
            console.log("[EXTENSION] Looking for the 'Not interested' menu item...");
            // (If your language isn't English, change this text to match your locale)
            const menuItems = document.querySelectorAll("tp-yt-paper-item[role='option']");
            let foundNotInterested = false;
            for (const item of menuItems) {
                const itemText = item.innerText.trim().toLowerCase();
                if (itemText === "not interested") {
                    console.log("[EXTENSION] Found 'Not interested' in the menu, clicking it...");
                    item.click();
                    foundNotInterested = true;
                    break;
                }
            }
            if (!foundNotInterested) {
                console.warn("[EXTENSION] 'Not interested' item not found. Possibly YouTube changed the text/DOM.");
            }
        }, 500);

    } catch (error) {
        console.error("[EXTENSION] Error in markNotInterested():", error);
    }
}

/**
 * Scans all video elements on the page for the KEYWORD.
 */
function scanVideos() {
    try {
        console.log("[EXTENSION] Scanning for videos...");

        // On YouTube homepage, recommended videos often appear in <ytd-rich-item-renderer>
        const videos = document.querySelectorAll("ytd-rich-item-renderer");

        console.log(`[EXTENSION] Found ${videos.length} total items (video cards, ads, etc.) in the feed.`);

        for (const video of videos) {
            // Skip if we've already checked this video
            if (video.dataset.notInterestedChecked === "1") {
                continue;
            }

            const titleEl = video.querySelector("#video-title");
            if (titleEl) {
                const titleText = titleEl.innerText;
                console.log(`[EXTENSION] Video title: "${titleText}"`);

                // If title includes KEYWORD (case-insensitive)
                if (titleContainsKeyword(titleText, KEYWORD)) {
                    console.log(`[EXTENSION] Title contains keyword "${KEYWORD}". Attempting 'Not Interested'...`);
                    markNotInterested(video);
                }
            } else {
                // It's common that some <ytd-rich-item-renderer> elements are ads or placeholders with no #video-title
                console.warn("[EXTENSION] Could not find a #video-title element in this item. Skipping...");
            }

            // Mark this item so we don't check it again
            video.dataset.notInterestedChecked = "1";
        }
    } catch (err) {
        console.error("[EXTENSION] Error in scanVideos():", err);
    }
}

// ============================
//  MAIN EXECUTION FLOW
// ============================

// 1) Initial scan after a short delay to let the page load
setTimeout(() => {
    console.log("[EXTENSION] Initial scan after 1 second delay...");
    scanVideos();
}, 1000);

// 2) Periodic rescans, in case the feed updates or we missed anything
setInterval(() => {
    console.log(`[EXTENSION] Periodic scan every ${SCAN_INTERVAL / 1000} seconds.`);
    scanVideos();
}, SCAN_INTERVAL);

// 3) MutationObserver to detect newly inserted videos (e.g., infinite scroll)
const feedContainer = document.querySelector("ytd-rich-grid-renderer #contents");
if (feedContainer) {
    console.log("[EXTENSION] Setting up MutationObserver on feed container.");
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    // If it's a new recommended video
                    if (addedNode.matches("ytd-rich-item-renderer")) {
                        console.log("[EXTENSION] A new video item was added. Checking title...");
                        const titleEl = addedNode.querySelector("#video-title");
                        if (titleEl) {
                            const titleText = titleEl.innerText;
                            console.log(`[EXTENSION] New video title: "${titleText}"`);
                            if (titleContainsKeyword(titleText, KEYWORD)) {
                                console.log(`[EXTENSION] New video title contains "${KEYWORD}". Marking 'Not Interested'...`);
                                markNotInterested(addedNode);
                            }
                        } else {
                            console.log("[EXTENSION] The new element doesn't have #video-title. Possibly not a normal video card.");
                        }
                        addedNode.dataset.notInterestedChecked = "1";
                    }
                }
            }
        }
    });
    observer.observe(feedContainer, { childList: true, subtree: true });
} else {
    console.warn("[EXTENSION] Could not find the main feed container (ytd-rich-grid-renderer #contents).");
    console.warn("[EXTENSION] The MutationObserver won't be set up. Feed changes might not be caught immediately.");
}
