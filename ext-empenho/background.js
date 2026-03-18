chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (
        changeInfo.status === "loading" &&
        tab.url?.includes("reginopolis.flowdocs.com.br:2053/admin/inbox/folder/")
    ) {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ["interceptor.js"],
            world: "MAIN",
        }).catch(err => console.error("Erro ao injetar interceptor:", err));
    }
});
 