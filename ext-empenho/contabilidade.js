// ══════════════════════════════════════════════════════════════
//  contabilidade.js — Módulo Contabilidade
//
//  Responsabilidades:
//    • Buscar processos da caixa de entrada da Contabilidade
//      (inbox/73) e filtrar os que possuem data no título
//    • Carregar o mapeamento data → id_pas (assets/pastas.json)
//    • Mover cada processo para a pasta correspondente via PUT
//    • Exibir overlay bloqueante durante o processamento
//    • Integrar ao sistema de toggle do background.js
// ══════════════════════════════════════════════════════════════

class Contabilidade {
    // ──────────────────────────────────────────────────────────
    //  Constantes
    // ──────────────────────────────────────────────────────────
    static INBOX_ID = 73;
    static INBOX_URL = `https://reginopolis.flowdocs.com.br:2053/server/api/fluxo/inbox/${Contabilidade.INBOX_ID}?limit=999`;
    static MOVER_URL = `https://reginopolis.flowdocs.com.br:2053/server/api/fluxo/inbox/pastas/${Contabilidade.INBOX_ID}`;
    static REGEX_DATA = /\b\d{1,2}[\/\.]\d{1,2}[\/\.](\d{2}|\d{4})\b/g;
    static STORAGE_KEY = "contabilidade_ativo";

    // ──────────────────────────────────────────────────────────
    //  Construtor
    // ──────────────────────────────────────────────────────────
    constructor(getToken) {
        /**
         * @param {() => string|null} getToken  Função que retorna o Bearer Token
         *   capturado pelo interceptor (compartilhado entre módulos via closure
         *   ou getter da instância Tesouraria/global).
         */
        this._getToken = getToken;
        this.ativo = false;
        this._pastas = [];   // cache do assets/pastas.json

        this._onToggle = this._onToggle.bind(this);
    }

    // ══════════════════════════════════════════════════════════
    //  API pública
    // ══════════════════════════════════════════════════════════

    async init() {
        chrome.runtime.onMessage.addListener(this._onToggle);

        // Estado inicial
        chrome.storage.local.get(Contabilidade.STORAGE_KEY, (result) => {
            if (result[Contabilidade.STORAGE_KEY]) {
                this.ativo = true;
                this._tentarCriarBotao();
            }
        });

        // Pré-carrega pastas.json
        await this._carregarPastas();
    }

    // ══════════════════════════════════════════════════════════
    //  Toggle (mensagem do background)
    // ══════════════════════════════════════════════════════════

    _onToggle(msg) {
        if (msg.type !== "CONTABILIDADE_TOGGLE") return;
        this.ativo = msg.ativo;
        this.ativo ? this._tentarCriarBotao() : this._removerBotao();
    }

    // ══════════════════════════════════════════════════════════
    //  Assets — carrega mapeamento data → id_pas
    // ══════════════════════════════════════════════════════════

    async _carregarPastas() {
        try {
            const url = chrome.runtime.getURL("assets/pastas.json");
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status} ao carregar pastas.json`);
            this._pastas = await resp.json();
            console.debug(`[Contabilidade] ${this._pastas.length} pastas carregadas.`);
        } catch (err) {
            console.error("[Contabilidade] Erro ao carregar pastas.json:", err);
        }
    }

    /**
     * Recebe uma string de data extraída do título (ex: "05/03" ou "5.3.2026")
     * e retorna o id_pas correspondente, ou null se não encontrado.
     */
    _resolverPasta(dataStr) {
        // Normaliza para DD/MM (ignora o ano se presente)
        const partes = dataStr.split(/[\/\.]/);
        if (partes.length < 2) return null;

        const dia = partes[0].padStart(2, "0");
        const mes = partes[1].padStart(2, "0");
        const chave = `${dia}/${mes}`;

        const entrada = this._pastas.find((p) => p.data === chave);
        return entrada ? entrada.id_pas : null;
    }

    // ══════════════════════════════════════════════════════════
    //  UI — Botão no header
    // ══════════════════════════════════════════════════════════

    _tentarCriarBotao() {
        if (document.getElementById("btn-contabilidade")) return;

        const seletores = [
            "flow-header-notifications",
            "fuse-fullscreen",
            ".ms-auto",
        ];

        let containerPai = null;
        for (const sel of seletores) {
            const el = document.querySelector(sel);
            if (el?.parentElement) {
                containerPai = el.parentElement;
                break;
            }
        }

        if (!containerPai) {
            setTimeout(() => this._tentarCriarBotao(), 2000);
            return;
        }

        const btn = document.createElement("button");
        btn.id = "btn-contabilidade";
        btn.innerText = "Organizar Contabilidade";

        Object.assign(btn.style, {
            padding: "4px 12px",
            background: "#006060",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "500",
            height: "36px",
            marginRight: "8px",
            display: "inline-flex",
            alignItems: "center",
            transition: "background 0.2s",
        });

        btn.addEventListener("mouseenter", () => { if (!btn.disabled) btn.style.background = "#006060"; });
        btn.addEventListener("mouseleave", () => { if (!btn.disabled) btn.style.background = "#006060"; });
        btn.addEventListener("click", () => this._onClickOrganizar(btn));

        containerPai.insertBefore(btn, containerPai.firstChild);
    }

    _removerBotao() {
        document.getElementById("btn-contabilidade")?.remove();
    }

    _setBtnTexto(texto, desabilitado = false) {
        const btn = document.getElementById("btn-contabilidade");
        if (!btn) return;
        btn.innerText = texto;
        btn.disabled = desabilitado;
        btn.style.background = desabilitado ? "#5d6d7e" : "#006060";
        btn.style.cursor = desabilitado ? "not-allowed" : "pointer";
    }

    // ══════════════════════════════════════════════════════════
    //  Overlay bloqueante
    // ══════════════════════════════════════════════════════════

    _criarOverlay() {
        if (document.getElementById("contabilidade-overlay")) return;

        const overlay = document.createElement("div");
        overlay.id = "contabilidade-overlay";

        Object.assign(overlay.style, {
            position: "fixed",
            inset: "0",
            zIndex: "999999",
            background: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(2px)",
            cursor: "not-allowed",
        });

        // Card central
        const card = document.createElement("div");
        Object.assign(card.style, {
            background: "#fff",
            borderRadius: "10px",
            padding: "32px 48px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            minWidth: "320px",
            cursor: "default",
        });

        // Spinner SVG
        const spinner = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        spinner.setAttribute("width", "40");
        spinner.setAttribute("height", "40");
        spinner.setAttribute("viewBox", "0 0 40 40");
        spinner.innerHTML = `
            <circle cx="20" cy="20" r="16"
                fill="none" stroke="#d0d7de" stroke-width="4"/>
            <circle cx="20" cy="20" r="16"
                fill="none" stroke="#006060" stroke-width="4"
                stroke-dasharray="60 44"
                stroke-linecap="round"
                transform-origin="center">
                <animateTransform attributeName="transform" type="rotate"
                    from="0" to="360" dur="0.9s" repeatCount="indefinite"/>
            </circle>`;

        const titulo = document.createElement("div");
        titulo.id = "contabilidade-overlay-titulo";
        Object.assign(titulo.style, {
            fontSize: "15px",
            fontWeight: "600",
            color: "#006060",
        });
        titulo.innerText = "Organizando processos…";

        const detalhe = document.createElement("div");
        detalhe.id = "contabilidade-overlay-detalhe";
        Object.assign(detalhe.style, {
            fontSize: "13px",
            color: "#555",
        });
        detalhe.innerText = "Aguarde, não feche esta aba.";

        card.appendChild(spinner);
        card.appendChild(titulo);
        card.appendChild(detalhe);
        overlay.appendChild(card);

        // Bloqueia cliques que passem pelo card
        overlay.addEventListener("click", (e) => e.stopPropagation());

        document.body.appendChild(overlay);
    }

    _atualizarOverlay(titulo, detalhe) {
        const t = document.getElementById("contabilidade-overlay-titulo");
        const d = document.getElementById("contabilidade-overlay-detalhe");
        if (t) t.innerText = titulo;
        if (d) d.innerText = detalhe;
    }

    _removerOverlay() {
        document.getElementById("contabilidade-overlay")?.remove();
    }

    // ══════════════════════════════════════════════════════════
    //  Handler do clique
    // ══════════════════════════════════════════════════════════

    async _onClickOrganizar() {
        this._setBtnTexto("Processando…", true);
        this._criarOverlay();

        try {
            await this._executar();
            this._atualizarOverlay("Concluído ✔", "Todos os processos foram organizados.");
            await this._aguardar(2000);
        } catch (err) {
            console.error("[Contabilidade] Erro na execução:", err);
            this._atualizarOverlay("Erro ❌", err.message);
            await this._aguardar(3500);
        } finally {
            this._atualizarOverlay("Concluído ✔", "Recarregando página…");
            await this._aguardar(2000);
            this._removerOverlay();
            location.reload();
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Execução principal
    // ══════════════════════════════════════════════════════════

    async _executar() {
        const token = this._getToken();
        if (!token) throw new Error("Token não capturado. Navegue por qualquer página do sistema primeiro.");

        // 1. Garante que as pastas estão carregadas
        if (this._pastas.length === 0) await this._carregarPastas();
        if (this._pastas.length === 0) throw new Error("Mapeamento de pastas (pastas.json) não pôde ser carregado.");

        // 2. Busca processos do inbox 73
        this._atualizarOverlay("Buscando processos…", `Consultando inbox ${Contabilidade.INBOX_ID}…`);

        let lista = [];
        try {
            const resp = await fetch(Contabilidade.INBOX_URL, {
                headers: { Authorization: token },
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar inbox ${Contabilidade.INBOX_ID}`);
            const json = await resp.json();
            lista = json.data || json.results || json;
        } catch (err) {
            console.error("[Contabilidade] Erro ao buscar inbox:", err);
            throw err;
        }

        console.debug(`[Contabilidade] ${lista.length} processos encontrados no inbox.`);

        // 3. Filtra processos com data no título
        const comData = lista.filter((item) => {
            const titulo = item.titulo_fxo || "";
            Contabilidade.REGEX_DATA.lastIndex = 0; // reset do estado da regex global
            return Contabilidade.REGEX_DATA.test(titulo);
        });

        console.debug(`[Contabilidade] ${comData.length} processos com data no título.`);

        if (comData.length === 0) {
            this._atualizarOverlay("Nenhum processo encontrado", "Não há processos com data no título.");
            await this._aguardar(2000);
            return;
        }

        // 4. Agrupa processos por id_pas (evita uma chamada PUT por processo)
        //    Map<id_pas, id_fxo[]>
        const grupos = new Map();
        const semPasta = [];

        for (const item of comData) {
            const titulo = item.titulo_fxo || "";
            Contabilidade.REGEX_DATA.lastIndex = 0;
            const match = Contabilidade.REGEX_DATA.exec(titulo);
            if (!match) continue;

            const id_pas = this._resolverPasta(match[0]);

            if (!id_pas) {
                semPasta.push({ id_fxo: item.id_fxo, titulo });
                console.warn(`[Contabilidade] Sem pasta para "${match[0]}" (id_fxo=${item.id_fxo})`);
                continue;
            }

            if (!grupos.has(id_pas)) grupos.set(id_pas, []);
            grupos.get(id_pas).push(item.id_fxo);
        }

        // 5. Envia um PUT por pasta, com todos os id_fxo do grupo
        let pastaIdx = 0;
        const totalPastas = grupos.size;

        for (const [id_pas, ids] of grupos.entries()) {
            pastaIdx++;
            this._atualizarOverlay(
                `Movendo processos… (${pastaIdx}/${totalPastas})`,
                `Pasta ${id_pas} ← ${ids.length} processo(s)`
            );
            // console.log(ids);
            // console.log(token);
            try {
                const resp = await fetch(Contabilidade.MOVER_URL, {
                    method: "PUT",
                    headers: {
                        Authorization: token,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(ids),
                });

                if (!resp.ok) {
                    const corpo = await resp.text().catch(() => "");
                    throw new Error(`HTTP ${resp.status} ao mover para pasta ${id_pas}: ${corpo}`);
                }
                console.debug(`[Contabilidade] Pasta ${id_pas} ← ids [${ids.join(", ")}] movidos.`);
            } catch (err) {
                console.error(`[Contabilidade] Erro ao mover para pasta ${id_pas}:`, err);
            } finally {
                await this._aguardar(250);
            }
        }

        if (semPasta.length > 0) {
            console.warn("[Contabilidade] Processos sem pasta mapeada:", semPasta);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Utilitário
    // ══════════════════════════════════════════════════════════

    _aguardar(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}