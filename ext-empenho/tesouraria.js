// ══════════════════════════════════════════════════════════════
//  tesouraria.js — Módulo Tesouraria
//  Contém apenas a definição da classe.
//  O bootstrap (instância + init) fica em content.js.
//
//  Carregado via content_scripts ANTES de content.js:
//    ["libs/pdf.min.js", "libs/pdf-lib.min.js", "tesouraria.js", "content.js"]
// ══════════════════════════════════════════════════════════════

class Tesouraria {
    // ──────────────────────────────────────────────────────────
    //  Construtor
    // ──────────────────────────────────────────────────────────
    constructor() {
        this.bearerToken = null;
        this.ativo       = false;
        this._btnEl      = null;

        // Bind para poder remover listeners depois se necessário
        this._onMessage = this._onMessage.bind(this);
        this._onToggle  = this._onToggle.bind(this);
    }

    // ══════════════════════════════════════════════════════════
    //  API pública
    // ══════════════════════════════════════════════════════════

    /** Registra listeners de token e de toggle, lê estado inicial do storage. */
    init() {
        window.addEventListener("message", this._onMessage);
        chrome.runtime.onMessage.addListener(this._onToggle);

        chrome.storage.local.get("tesouraria_ativo", (result) => {
            if (result.tesouraria_ativo) {
                this.ativo = true;
                this._tentarCriarBotao();
            }
        });
    }

    // ══════════════════════════════════════════════════════════
    //  Listeners internos
    // ══════════════════════════════════════════════════════════

    _onMessage(event) {
        if (event.source === window && event.data?.type === "EMPENHO_TOKEN") {
            this.bearerToken = event.data.token;
            console.debug("[Tesouraria] Token capturado.");
        }
    }

    _onToggle(msg) {
        if (msg.type !== "TESOURARIA_TOGGLE") return;
        this.ativo = msg.ativo;
        this.ativo ? this._tentarCriarBotao() : this._removerBotao();
    }

    // ══════════════════════════════════════════════════════════
    //  UI — Botão no header
    // ══════════════════════════════════════════════════════════

    _tentarCriarBotao() {
        if (document.getElementById("btn-empenho")) return;

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
        btn.id        = "btn-empenho";
        btn.innerText = "Processar Empenhos";

        Object.assign(btn.style, {
            padding:      "4px 12px",
            background:   "#006060",
            color:        "#fff",
            border:       "none",
            borderRadius: "4px",
            cursor:       "pointer",
            fontSize:     "12px",
            fontWeight:   "500",
            height:       "36px",
            marginRight:  "8px",
            display:      "inline-flex",
            alignItems:   "center",
            transition:   "background 0.2s",
        });

        btn.addEventListener("mouseenter", () => { if (!btn.disabled) btn.style.background = "#004545"; });
        btn.addEventListener("mouseleave", () => { if (!btn.disabled) btn.style.background = "#006060"; });
        btn.addEventListener("click",      () => this._onClickProcessar(btn));

        containerPai.insertBefore(btn, containerPai.firstChild);
        this._btnEl = btn;
    }

    _removerBotao() {
        document.getElementById("btn-empenho")?.remove();
        this._btnEl = null;
    }

    _setBtnTexto(texto, desabilitado = false) {
        const btn = document.getElementById("btn-empenho");
        if (!btn) return;
        btn.innerText        = texto;
        btn.disabled         = desabilitado;
        btn.style.background = desabilitado ? "#888" : "#006060";
    }

    async _onClickProcessar() {
        this._setBtnTexto("Processando…", true);
        try {
            await this.executarChamada();
            this._setBtnTexto("Concluído ✔", false);
        } catch (err) {
            console.error("[Tesouraria] Erro na execução:", err);
            this._setBtnTexto(`Erro ❌ — ${err.message}`, false);
        } finally {
            setTimeout(() => this._setBtnTexto("Processar Empenhos", false), 4000);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Helpers de negócio
    // ══════════════════════════════════════════════════════════

    _getFolderId() {
        const match = window.location.pathname.match(/^\/admin\/inbox\/folder\/(\d+)/);
        return match ? match[1] : null;
    }

    async _baixarPDF(id) {
        try {
            const resp = await fetch(`/server/api/files/arquivos/${id}/download`, {
                headers: { Authorization: this.bearerToken },
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status} ao baixar arquivo id=${id}`);
            return await resp.arrayBuffer();
        } catch (err) {
            console.error(`[Tesouraria] Falha ao baixar PDF id=${id}:`, err);
            throw err;
        }
    }

    async _pdfContemEmpenho(arrayBuffer) {
        try {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
            for (let i = 1; i <= pdf.numPages; i++) {
                const page   = await pdf.getPage(i);
                const content = await page.getTextContent();
                const texto  = content.items.map((x) => x.str).join(" ").toUpperCase();

                if (
                    texto.includes("NOTA EMPENHO") ||
                    texto.includes("NOTA DE LIQUIDAÇÃO") ||
                    texto.includes("PARCELA P/ PAGAMENTO")
                ) return true;
            }
            return false;
        } catch (err) {
            console.error("[Tesouraria] Erro ao analisar conteúdo do PDF:", err);
            return false;
        }
    }

    async _cortarPDF(arrayBuffer, numero, ano) {
        try {
            const pdf    = await PDFLib.PDFDocument.load(arrayBuffer);
            const novo   = await PDFLib.PDFDocument.create();
            const pagina = pdf.getPages()[0];

            const { width, height } = pagina.getSize();
            const marginLeft  = 40;
            const marginRight = 20;
            const cropWidth   = width - marginLeft - marginRight;
            const cropHeight  = height / 2;

            const embeddedPage = await novo.embedPage(pagina, {
                left:   marginLeft,
                right:  width - marginRight,
                bottom: height / 2,
                top:    height,
            });

            const novaPagina = novo.addPage([cropWidth, cropHeight]);
            novaPagina.drawPage(embeddedPage, { x: 0, y: 0, width: cropWidth, height: cropHeight });

            // Carimbo número/ano
            const texto     = `${numero}/${ano}`;
            const font      = await novo.embedFont(PDFLib.StandardFonts.HelveticaBold);
            const fontSize  = 12;
            const padding   = 5;
            const boxWidth  = font.widthOfTextAtSize(texto, fontSize) + padding * 2;
            const boxHeight = font.heightAtSize(fontSize) + padding * 2;
            const x = cropWidth  - boxWidth  - 5;
            const y = cropHeight - boxHeight - 5;

            novaPagina.drawRectangle({
                x, y, width: boxWidth, height: boxHeight,
                borderWidth: 1,
                color:       PDFLib.rgb(1, 1, 1),
                borderColor: PDFLib.rgb(0, 0, 0),
            });

            novaPagina.drawText(texto, {
                x: x + padding, y: y + padding,
                size: fontSize, font,
                color: PDFLib.rgb(0, 0, 0),
            });

            return await novo.save();
        } catch (err) {
            console.error("[Tesouraria] Erro ao recortar PDF:", err);
            throw err;
        }
    }

    /** Busca recursivamente todos os anexos PDF dentro de um objeto JSON. */
    _buscarPDFs(obj) {
        let resultados = [];
        if (Array.isArray(obj)) {
            for (const item of obj) resultados = resultados.concat(this._buscarPDFs(item));
        } else if (obj && typeof obj === "object") {
            if (obj.arquivo_fta && obj.content_type_fta === "application/pdf") {
                resultados.push({ id_arq_fta: obj.id_arq_fta });
            }
            for (const key of Object.keys(obj)) {
                resultados = resultados.concat(this._buscarPDFs(obj[key]));
            }
        }
        return resultados;
    }

    // ══════════════════════════════════════════════════════════
    //  Execução principal
    // ══════════════════════════════════════════════════════════

    async executarChamada() {
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("libs/pdf.worker.min.js");

        const folderId = this._getFolderId();
        if (!this.bearerToken) throw new Error("Token não capturado. Navegue por qualquer página do sistema primeiro.");
        if (!folderId)         throw new Error("Pasta não identificada na URL.");

        const pdfFinal            = await PDFLib.PDFDocument.create();
        const processosComEmpenho = new Set();

        // 1. Lista de fluxos da pasta
        let lista = [];
        try {
            const response = await fetch(
                `/server/api/fluxo/inbox/${folderId}?sort=datamovimento_cai,desc`,
                { headers: { Authorization: this.bearerToken } }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status} ao buscar inbox`);
            const data = await response.json();
            lista = data.data || data.results || data;
        } catch (err) {
            console.error("[Tesouraria] Erro ao buscar lista de fluxos:", err);
            throw err;
        }

        // 2. Itera fluxos
        let i = 0;
        for (const item of lista) {
            i++;
            this._setBtnTexto(`Processando ${i}/${lista.length}`, true);

            const id_fxo = item.id_fxo;
            if (!id_fxo) continue;

            try {
                const respTramites = await fetch(
                    `/server/api/fluxo/inbox/${folderId}/fluxos/${id_fxo}/tramites?limit=20&offset=0&sort=num_ftr,desc`,
                    { headers: { Authorization: this.bearerToken } }
                );
                if (!respTramites.ok) throw new Error(`HTTP ${respTramites.status} nos trâmites id_fxo=${id_fxo}`);

                const dataTramites  = await respTramites.json();
                const listaTramites = dataTramites.data || dataTramites.results || dataTramites;
                const arquivos      = this._buscarPDFs(listaTramites);

                for (const arq of arquivos) {
                    if (processosComEmpenho.has(id_fxo)) break;

                    let buffer;
                    try {
                        buffer = await this._baixarPDF(arq.id_arq_fta);
                    } catch (_) {
                        continue; // PDF inacessível — segue para o próximo
                    }

                    if (await this._pdfContemEmpenho(buffer)) {
                        processosComEmpenho.add(id_fxo);
                        try {
                            const cortado = await this._cortarPDF(buffer.slice(0), item.numero_fxo, item.ano_fxo);
                            const pdfTmp  = await PDFLib.PDFDocument.load(cortado);
                            const pages   = await pdfFinal.copyPages(pdfTmp, pdfTmp.getPageIndices());
                            pages.forEach((p) => pdfFinal.addPage(p));
                        } catch (errCorte) {
                            console.error(`[Tesouraria] Erro ao processar empenho id_fxo=${id_fxo}:`, errCorte);
                        }
                        break;
                    }
                }
            } catch (errFluxo) {
                console.error(`[Tesouraria] Erro no fluxo id_fxo=${id_fxo}:`, errFluxo);
                // Não interrompe — continua para o próximo item
            }
        }

        // 3. Gera e abre PDF final
        try {
            const finalBytes = await pdfFinal.save();
            const blob       = new Blob([finalBytes], { type: "application/pdf" });
            window.open(URL.createObjectURL(blob));
        } catch (err) {
            console.error("[Tesouraria] Erro ao gerar PDF final:", err);
            throw err;
        }
    }
}