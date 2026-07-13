// Inject the reader into the active tab when the toolbar icon is clicked.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) { return; }
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['rsvp-reader.js'] });
});
