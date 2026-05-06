// ══════════════════════════════════════════════════════════════
//  empenho-consulta.js — Módulo Consulta de Empenho
//
//  Responsabilidades:
//    • Inserir diretamente no header: campo de número, radio buttons
//      de tipo e botão "Buscar" — sem modal
//    • Contornar CORS delegando o fetch ao background.js via
//      chrome.runtime.sendMessage({ type: "EMPENHO_FETCH", url })
//    • Inserir o JSON retornado no dx-html-editor da página
//
//  Ativação em conjunto com o módulo Contabilidade:
//    • STORAGE_KEY  → "contabilidade_ativo"
//    • Toggle msg   → CONTABILIDADE_TOGGLE
//
//  REQUISITO no background.js — adicione este bloco:
//
//    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
//      if (msg.type === "EMPENHO_FETCH") {
//        fetch(msg.url)
//          .then(r => r.json())
//          .then(data => sendResponse({ ok: true,  data }))
//          .catch(err => sendResponse({ ok: false, error: err.message }));
//        return true; // mantém canal aberto (async)
//      }
//    });
// ══════════════════════════════════════════════════════════════

class EmpenhoConsulta {

    // ──────────────────────────────────────────────────────────
    //  Constantes
    // ──────────────────────────────────────────────────────────
    static BASE_URL = "https://transparencia.reginopolis.sp.gov.br:8080/transparencia/VersaoJson/Despesas/";
    static STORAGE_KEY = "contabilidade_ativo";
    static WRAPPER_ID = "empenho-header-wrapper";
    static ANO = "2026";

    //static TIPOS_EMPENHO = ["AD", "AN", "DA", "ES", "EX", "GL", "OR"];
    static TIPOS_EMPENHO = ["AD", "AN", "DA", "EX", "GL", "OR"];
    static TIPO_PADRAO = "OR";

    // ──────────────────────────────────────────────────────────
    //  Construtor
    // ──────────────────────────────────────────────────────────
    constructor() {
        this.ativo = false;
        this._onToggle = this._onToggle.bind(this);
    }

    // ══════════════════════════════════════════════════════════
    //  Init
    // ══════════════════════════════════════════════════════════

    async init() {
        chrome.runtime.onMessage.addListener(this._onToggle);

        chrome.storage.local.get(EmpenhoConsulta.STORAGE_KEY, (result) => {
            if (result[EmpenhoConsulta.STORAGE_KEY]) {
                this.ativo = true;
                this._tentarCriarUI();
            }
        });
    }

    // ══════════════════════════════════════════════════════════
    //  Toggle (mesmo sinal do módulo Contabilidade)
    // ══════════════════════════════════════════════════════════

    _onToggle(msg) {
        if (msg.type !== "CONTABILIDADE_TOGGLE") return;
        this.ativo = msg.ativo;
        this.ativo ? this._tentarCriarUI() : this._removerUI();
    }

    // ══════════════════════════════════════════════════════════
    //  UI — inline no header (sem modal)
    // ══════════════════════════════════════════════════════════

    _tentarCriarUI() {
        if (document.getElementById(EmpenhoConsulta.WRAPPER_ID)) return;

        const seletores = [
            "flow-header-notifications",
            "fuse-fullscreen",
            ".ms-auto",
        ];

        let containerPai = null;
        for (const sel of seletores) {
            const el = document.querySelector(sel);
            if (el?.parentElement) { containerPai = el.parentElement; break; }
        }

        if (!containerPai) {
            setTimeout(() => this._tentarCriarUI(), 2000);
            return;
        }

        // ── Wrapper externo ───────────────────────────────────
        const wrapper = document.createElement("div");
        wrapper.id = EmpenhoConsulta.WRAPPER_ID;
        Object.assign(wrapper.style, {
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            marginRight: "8px",
            height: "36px",
            flexShrink: "0",
        });

        // ── Campo numérico ────────────────────────────────────
        const input = document.createElement("input");
        input.id = "empenho-numero-input";
        input.type = "number";
        input.min = "1";
        input.placeholder = "Nº Empenho";
        Object.assign(input.style, {
            width: "110px",
            height: "28px",
            padding: "0 8px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontSize: "12px",
            outline: "none",
            boxSizing: "border-box",
            background: "#fff",
            color: "#222",
        });
        input.addEventListener("focus", () => { input.style.borderColor = "#1a5276"; });
        input.addEventListener("blur", () => { input.style.borderColor = "#ccc"; });

        // ── Separador ─────────────────────────────────────────
        const sep = () => {
            const d = document.createElement("div");
            Object.assign(d.style, {
                width: "1px", height: "22px",
                background: "rgba(0,0,0,0.15)", flexShrink: "0",
            });
            return d;
        };

        // ── Radio buttons de tipo ─────────────────────────────
        const radiosWrapper = document.createElement("div");
        Object.assign(radiosWrapper.style, {
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            flexWrap: "nowrap",
        });

        EmpenhoConsulta.TIPOS_EMPENHO.forEach((tipo) => {
            const lbl = document.createElement("label");
            Object.assign(lbl.style, {
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "11px",
                color: "#333",
                cursor: "pointer",
                userSelect: "none",
                padding: "2px 5px",
                borderRadius: "3px",
                transition: "background 0.15s, font-weight 0.1s",
                fontWeight: tipo === EmpenhoConsulta.TIPO_PADRAO ? "600" : "400",
                background: tipo === EmpenhoConsulta.TIPO_PADRAO ? "rgba(26,82,118,0.10)" : "transparent",
            });

            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "empenho-tipo-header";
            radio.value = tipo;
            radio.id = `empenho-tipo-h-${tipo}`;
            radio.checked = (tipo === EmpenhoConsulta.TIPO_PADRAO);
            Object.assign(radio.style, {
                cursor: "pointer", accentColor: "#1a5276", margin: "0",
            });

            radio.addEventListener("change", () => {
                // Reseta todos os labels
                document.querySelectorAll('input[name="empenho-tipo-header"]').forEach(r => {
                    r.parentElement.style.background = "transparent";
                    r.parentElement.style.fontWeight = "400";
                });
                // Destaca o selecionado
                lbl.style.background = "rgba(26,82,118,0.10)";
                lbl.style.fontWeight = "600";
            });

            const span = document.createElement("span");
            span.innerText = tipo;

            lbl.appendChild(radio);
            lbl.appendChild(span);
            radiosWrapper.appendChild(lbl);
        });

        // ── Botão Buscar ──────────────────────────────────────
        const btn = document.createElement("button");
        btn.id = "empenho-btn-buscar";
        Object.assign(btn.style, {
            height: "28px",
            padding: "0 12px",
            background: "#1a5276",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "500",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            transition: "background 0.2s",
            whiteSpace: "nowrap",
        });
        btn.innerHTML = `<i class="fas fa-search" style="font-size:10px"></i> Buscar`;

        btn.addEventListener("mouseenter", () => { if (!btn.disabled) btn.style.background = "#1f618d"; });
        btn.addEventListener("mouseleave", () => { if (!btn.disabled) btn.style.background = "#1a5276"; });
        btn.addEventListener("click", () => this._onClickBuscar(input, btn));

        // Enter no campo dispara busca
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });

        // ── Erro inline ───────────────────────────────────────
        const erro = document.createElement("span");
        erro.id = "empenho-erro-inline";
        Object.assign(erro.style, {
            fontSize: "11px",
            color: "#c0392b",
            whiteSpace: "nowrap",
            display: "none",
        });

        // ── Montagem ──────────────────────────────────────────
        wrapper.appendChild(input);
        wrapper.appendChild(sep());
        wrapper.appendChild(radiosWrapper);
        wrapper.appendChild(sep());
        wrapper.appendChild(btn);
        wrapper.appendChild(erro);

        containerPai.insertBefore(wrapper, containerPai.firstChild);
    }

    _removerUI() {
        document.getElementById(EmpenhoConsulta.WRAPPER_ID)?.remove();
    }

    // ══════════════════════════════════════════════════════════
    //  Handler do botão Buscar
    // ══════════════════════════════════════════════════════════

    async _onClickBuscar(input, btn) {
        const numero = parseInt(input.value, 10);
        const erroEl = document.getElementById("empenho-erro-inline");

        if (!numero || numero < 1) {
            this._mostrarErro(erroEl, "Informe um número válido.");
            return;
        }

        const tipoEl = document.querySelector('input[name="empenho-tipo-header"]:checked');
        if (!tipoEl) {
            this._mostrarErro(erroEl, "Selecione o tipo.");
            return;
        }

        this._mostrarErro(erroEl, null);
        this._setBtnEstado(btn, true);

        try {
            const dados = await this._consultarViaBackground(numero, tipoEl.value);
            this._inserirNoEditor(dados, numero, tipoEl.value);
        } catch (err) {
            // console.error("[EmpenhoConsulta] Erro:", err);
            this._mostrarErro(erroEl, err.message);
        } finally {
            this._setBtnEstado(btn, false);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Fetch delegado ao background.js (sem CORS)
    // ══════════════════════════════════════════════════════════

    _consultarViaBackground(numero, tipo) {
        const params = new URLSearchParams({
            ConectarExercicio: EmpenhoConsulta.ANO,
            Listagem: "DetalhesEmpenhoPorNumeroEmpenho",
            intNumeroEmpenho: numero,
            strTipoEmpenho: tipo,
            Empresa: "1",
            bolMostrarFornecedor: "False",
        });

        const url = `${EmpenhoConsulta.BASE_URL}?${params.toString()}`;

        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: "EMPENHO_FETCH", url }, (resp) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (!resp?.ok) {
                    return reject(new Error(resp?.error ?? "Erro desconhecido no background."));
                }
                resolve(resp.data);
            });
        });
    }

    // ══════════════════════════════════════════════════════════
    //  Inserção no dx-html-editor
    // ══════════════════════════════════════════════════════════

    _inserirNoEditor(dados, numero, tipo) {
        const item = Array.isArray(dados) ? (dados[0] ?? {}) : (dados ?? {});
        const html = this._montarHtmlEmpenho(item, numero, tipo);

        // Estratégia 1: Quill direto via .ql-editor
        // O __dxWidget__ não está exposto nesta versão Angular/DX — o Quill
        // é a camada real de edição e aceita innerHTML + disparo de evento.
        const qlEditor = document.querySelector("flow-html-editor .ql-editor")
            ?? document.querySelector(".ql-editor");

        if (qlEditor) {
            qlEditor.focus();
            qlEditor.innerHTML = html;
            qlEditor.dispatchEvent(new Event("input", { bubbles: true }));
            qlEditor.dispatchEvent(new Event("change", { bubbles: true }));
            console.debug("[EmpenhoConsulta] Conteúdo inserido via .ql-editor.", dados);
            return;
        }

        console.error("[EmpenhoConsulta] .ql-editor não encontrado na página.");
        this._mostrarErro(document.getElementById("empenho-erro-inline"), "Editor não encontrado.");
    }

    /**
     * Monta o HTML inserido no editor.
     * Substitua os placeholders pelos campos reais do JSON retornado.
     * Dica: após uma busca bem-sucedida, o objeto completo é logado no
     * console como "[EmpenhoConsulta] Conteúdo inserido no editor."
     */

    _montarHtmlEmpenho(item, numero, tipo) {
        // ══════════════════════════════════════════════════════
        //  ↓↓↓  ADAPTE OS CAMPOS CONFORME O RETORNO DA API  ↓↓↓
        // ══════════════════════════════════════════════════════
        return `
<p><strong>DADOS DO EMPENHO:</strong>
<strong>EMPENHO N.º:</strong> ${numero}/${item["ANO"] ?? ""} &nbsp;|&nbsp; <strong>TIPO:</strong> ${tipo}
<strong>Ficha:</strong> ${item["FICHA"] ?? ""}
<strong>Recurso:</strong> ${item["VINCULO"] ?? ""}
<strong>DADOS DO FORNECEDOR</strong>
<strong>Nome:</strong> ${item["NOME"] ?? ""}
<strong>CNPJ/CPF:</strong> ${item["INSMF"] ?? ""}</p>
        `.trim();
        // ══════════════════════════════════════════════════════
        //  ↑↑↑  FIM DA ESTRUTURA                             ↑↑↑
        // ══════════════════════════════════════════════════════
    }

    // ══════════════════════════════════════════════════════════
    //  Helpers de UI
    // ══════════════════════════════════════════════════════════

    _setBtnEstado(btn, carregando) {
        if (!btn) return;
        btn.disabled = carregando;
        btn.style.background = carregando ? "#7f8c8d" : "#1a5276";
        btn.style.cursor = carregando ? "not-allowed" : "pointer";
        btn.innerHTML = carregando
            ? `<svg width="12" height="12" viewBox="0 0 40 40" style="vertical-align:middle;margin-right:4px">
                 <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="5"/>
                 <circle cx="20" cy="20" r="16" fill="none" stroke="#fff" stroke-width="5"
                   stroke-dasharray="60 44" stroke-linecap="round" transform-origin="center">
                   <animateTransform attributeName="transform" type="rotate"
                     from="0" to="360" dur="0.9s" repeatCount="indefinite"/>
                 </circle></svg>Buscando…`
            : `<i class="fas fa-search" style="font-size:10px"></i> Buscar`;
    }

    _mostrarErro(el, msg) {
        if (!el) return;
        if (msg) { el.innerText = msg; el.style.display = "inline"; }
        else { el.innerText = ""; el.style.display = "none"; }
    }
}