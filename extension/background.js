// Inject the reader into the active tab when the toolbar icon is clicked.
// world: 'MAIN' shares the page's window with the bookmarklet so the
// window.rsvpInstance singleton guard sees instances from either activation.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) { return; }
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['rsvp-reader.js'], world: 'MAIN' })
    .catch((err) => console.warn('RSVP Reader: cannot run on this page.', err));
});
