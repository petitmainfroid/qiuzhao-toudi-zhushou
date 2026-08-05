async function disableAutomaticPanelOpening(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
}

void disableAutomaticPanelOpening();

chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== "number") return;
  void chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onInstalled.addListener((details) => {
  void disableAutomaticPanelOpening();
  if (details.reason === "install") {
    void chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(() => {
  void disableAutomaticPanelOpening();
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "OPEN_OPTIONS"
  ) {
    void chrome.runtime.openOptionsPage();
  }
});

export {};
