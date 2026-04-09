// ── Context menu: right-click selected text → "Add to VocabMaster" ──

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-to-vocab",
    title: 'Add "%s" to VocabMaster',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "add-to-vocab" && info.selectionText) {
    // Store the selected text so the popup can read it
    chrome.storage.local.set({
      capturedWord: info.selectionText.trim(),
      capturedAt: Date.now(),
    });
    // Open the popup programmatically
    chrome.action.openPopup();
  }
});
