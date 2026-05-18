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
//  Injeção dos scripts quando a aba chega via redirect externo
//
//  PROBLEMA: o app desktop abre /credentials/login?...&continueTo=
//  /admin/inbox/folder/... O evento "loading" captura a URL ainda
//  como /credentials/login, que não bate com TARGET_URL, então
//  nem o interceptor nem os content scripts são injetados.
//
//  SOLUÇÃO: escutar "complete" (URL final já resolvida) e injetar
//  tanto o interceptor quanto os content scripts manualmente se
//  eles ainda não estiverem presentes na aba.
// ──────────────────────────────────────────────────────────────

// Abas onde os content scripts já foram injetados nesta sessão
const _scriptsInjetados = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // "loading" limpa o flag — nova navegação na mesma aba
    if (changeInfo.status === "loading") {
        _scriptsInjetados.delete(tabId);
        return;
    }

    // Só age quando a página terminou de carregar
    if (changeInfo.status !== "complete") return;

    // Verifica se a URL final é a alvo
    const url = tab.url ?? "";
    if (!url.includes(TARGET_URL)) return;

    // ── Injeção do interceptor.js (mundo MAIN) ────────────────
    const estados    = await Promise.all(MODULOS.map((m) => getModuloAtivo(m.storageKey)));
    const algumAtivo = estados.some(Boolean);

    if (algumAtivo) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files:  ["interceptor.js"],
                world:  "MAIN",
            });
        } catch (err) {
            console.error("[Background] Erro ao injetar interceptor:", err);
        }
    }

    // ── Injeção dos content scripts (mundo ISOLATED) ──────────
    // Necessário quando a aba chega via redirect externo, pois
    // o manifest só injeta em navegações diretas para a URL alvo.
    if (_scriptsInjetados.has(tabId)) return;
    _scriptsInjetados.add(tabId);

    try {
        // Testa se o content script já está ativo pedindo um ping
        await chrome.tabs.sendMessage(tabId, { type: "PING" });
        // Se chegou aqui, já está rodando — não injeta de novo
    } catch (_) {
        // Não respondeu: injeta os scripts na mesma ordem do manifest
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: [
                    "libs/pdf.min.js",
                    "libs/pdf-lib.min.js",
                    "tesouraria.js",
                    "contabilidade.js",
                    "empenho-consulta.js",
                    "content.js",
                ],
            });
            console.debug(`[Background] Content scripts injetados na aba ${tabId} (via redirect).`);
        } catch (err) {
            console.error("[Background] Erro ao injetar content scripts:", err);
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    _scriptsInjetados.delete(tabId);
});

// ──────────────────────────────────────────────────────────────
//  Proxy de fetch para contornar CORS (usado pelo EmpenhoConsulta)
// ──────────────────────────────────────────────────────────────
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