// ══════════════════════════════════════════════════════════════
//  background.js — Service Worker
//  Responsabilidades:
//    • Criar e gerenciar o menu de contexto (popup switch)
//    • Injetar interceptor.js no mundo MAIN quando necessário
//    • Controlar estado ativo/inativo do módulo Tesouraria
// ══════════════════════════════════════════════════════════════

const STORAGE_KEY = "tesouraria_ativo";
const MENU_ID     = "toggle-tesouraria";
const TARGET_URL  = "reginopolis.flowdocs.com.br:2053/admin/inbox/folder/";

// ──────────────────────────────────────────────────────────────
//  Estado inicial: lê do storage (padrão = false)
// ──────────────────────────────────────────────────────────────
async function getModuloAtivo() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] ?? false;
}

async function setModuloAtivo(valor) {
    await chrome.storage.local.set({ [STORAGE_KEY]: valor });
}

// ──────────────────────────────────────────────────────────────
//  Menu de contexto — ícone da extensão
// ──────────────────────────────────────────────────────────────
async function criarMenu() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: MENU_ID,
            title: "Tesouraria: Carregando…",
            contexts: ["action"],
        });
    });
    await atualizarTituloMenu();
}

async function atualizarTituloMenu() {
    const ativo = await getModuloAtivo();
    chrome.contextMenus.update(MENU_ID, {
        title: ativo
            ? "✅ Tesouraria: ATIVADO  (clique para desativar)"
            : "⬜ Tesouraria: DESATIVADO  (clique para ativar)",
    });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId !== MENU_ID) return;

    const atual = await getModuloAtivo();
    const novo  = !atual;
    await setModuloAtivo(novo);
    await atualizarTituloMenu();

    // Notifica todas as abas abertas do flowdocs sobre a mudança
    const tabs = await chrome.tabs.query({ url: `*://${TARGET_URL}*` });
    for (const tab of tabs) {
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: "TESOURARIA_TOGGLE",
                ativo: novo,
            });
        } catch (_) {
            // Tab pode não ter o content script pronto ainda — ignorar
        }
    }
});

// ──────────────────────────────────────────────────────────────
//  Injeção do interceptor.js no mundo MAIN
// ──────────────────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (
        changeInfo.status !== "loading" ||
        !tab.url?.includes(TARGET_URL)
    ) return;

    const ativo = await getModuloAtivo();
    if (!ativo) return;

    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["interceptor.js"],
            world: "MAIN",
        });
    } catch (err) {
        console.error("[Tesouraria] Erro ao injetar interceptor:", err);
    }
});

// ──────────────────────────────────────────────────────────────
//  Inicialização
// ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(criarMenu);
chrome.runtime.onStartup.addListener(criarMenu);