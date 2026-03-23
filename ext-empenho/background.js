// ══════════════════════════════════════════════════════════════
//  background.js — Service Worker
//  Responsabilidades:
//    • Criar e gerenciar menus de contexto (um por módulo)
//    • Injetar interceptor.js no mundo MAIN quando necessário
//    • Controlar estado ativo/inativo de cada módulo via storage
// ══════════════════════════════════════════════════════════════

const TARGET_URL      = "reginopolis.flowdocs.com.br:2053/admin/inbox/folder/";
const TARGET_URL_TABS = "https://reginopolis.flowdocs.com.br:2053/admin/inbox/folder/*";

// ──────────────────────────────────────────────────────────────
//  Definição dos módulos gerenciados
// ──────────────────────────────────────────────────────────────
const MODULOS = [
    {
        id:          "toggle-tesouraria",
        storageKey:  "tesouraria_ativo",
        msgType:     "TESOURARIA_TOGGLE",
        labelAtivo:  "✅ Tesouraria: ATIVADO  (clique para desativar)",
        labelInativo: "⬜ Tesouraria: DESATIVADO  (clique para ativar)",
    },
    {
        id:          "toggle-contabilidade",
        storageKey:  "contabilidade_ativo",
        msgType:     "CONTABILIDADE_TOGGLE",
        labelAtivo:  "✅ Contabilidade: ATIVADO  (clique para desativar)",
        labelInativo: "⬜ Contabilidade: DESATIVADO  (clique para ativar)",
    },
];

// ──────────────────────────────────────────────────────────────
//  Helpers de storage
// ──────────────────────────────────────────────────────────────
async function getModuloAtivo(storageKey) {
    const result = await chrome.storage.local.get(storageKey);
    return result[storageKey] ?? false;
}

async function setModuloAtivo(storageKey, valor) {
    await chrome.storage.local.set({ [storageKey]: valor });
}

// ──────────────────────────────────────────────────────────────
//  Menu de contexto — clique direito no ícone da extensão
// ──────────────────────────────────────────────────────────────
async function criarMenus() {
    chrome.contextMenus.removeAll(async () => {
        // Separador visual de título (não clicável)
        chrome.contextMenus.create({
            id:       "header-modulos",
            title:    "── Módulos ──",
            contexts: ["action"],
            enabled:  false,
        });

        for (const mod of MODULOS) {
            chrome.contextMenus.create({
                id:       mod.id,
                title:    "Carregando…",
                contexts: ["action"],
            });
        }

        await atualizarTitulosMenus();
    });
}

async function atualizarTitulosMenus() {
    for (const mod of MODULOS) {
        const ativo = await getModuloAtivo(mod.storageKey);
        chrome.contextMenus.update(mod.id, {
            title: ativo ? mod.labelAtivo : mod.labelInativo,
        });
    }
}

chrome.contextMenus.onClicked.addListener(async (info) => {
    const mod = MODULOS.find((m) => m.id === info.menuItemId);
    if (!mod) return;

    const atual = await getModuloAtivo(mod.storageKey);
    const novo  = !atual;
    await setModuloAtivo(mod.storageKey, novo);
    await atualizarTitulosMenus();

    // Notifica todas as abas abertas do Flowdocs
    const tabs = await chrome.tabs.query({ url: TARGET_URL_TABS });
    for (const tab of tabs) {
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: mod.msgType,
                ativo: novo,
            });
        } catch (_) {
            // Aba pode não ter o content script pronto — ignorar silenciosamente
        }
    }
});

// ──────────────────────────────────────────────────────────────
//  Injeção do interceptor.js (mundo MAIN) — só se algum módulo ativo
// ──────────────────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (
        changeInfo.status !== "loading" ||
        !tab.url?.includes(TARGET_URL)
    ) return;

    // Injeta se qualquer módulo estiver ativo
    const estados = await Promise.all(
        MODULOS.map((m) => getModuloAtivo(m.storageKey))
    );
    const algumAtivo = estados.some(Boolean);
    if (!algumAtivo) return;

    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["interceptor.js"],
            world: "MAIN",
        });
    } catch (err) {
        console.error("[Background] Erro ao injetar interceptor:", err);
    }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "EMPENHO_FETCH") {
        fetch(msg.url)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} — ${r.statusText}`);
                return r.json();
            })
            .then((data) => sendResponse({ ok: true,  data }))
            .catch((err) => sendResponse({ ok: false, error: err.message }));
 
        return true; // mantém o canal aberto para resposta assíncrona
    }
});

// ──────────────────────────────────────────────────────────────
//  Inicialização
// ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(criarMenus);
chrome.runtime.onStartup.addListener(criarMenus);