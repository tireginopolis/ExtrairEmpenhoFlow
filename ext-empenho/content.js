// ─────────────────────────────────────────────
//  Recebe o token do interceptor.js (world: MAIN)
// ─────────────────────────────────────────────
let bearerToken = null;

window.addEventListener("message", (event) => {
    if (event.source === window && event.data?.type === "EMPENHO_TOKEN") {
        bearerToken = event.data.token;
        // console.log("🔑 Token capturado:", bearerToken);
    }
});

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function getFolderId() {
    const match = window.location.pathname.match(/^\/admin\/inbox\/folder\/(\d+)/);
    return match ? match[1] : null;
}

async function baixarPDF(id) {
    const resp = await fetch(`/server/api/files/arquivos/${id}/download`, {
        headers: { Authorization: bearerToken },
    });
    return await resp.arrayBuffer();
}

async function pdfContemEmpenho(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const texto = content.items.map((x) => x.str).join(" ").toUpperCase();

        if (texto.includes("NOTA EMPENHO") || texto.includes("NOTA DE LIQUIDAÇÃO") || texto.includes("PARCELA P/ PAGAMENTO")) {
            return true;
        }
    }
    return false;
}

async function cortarPDF(arrayBuffer, numero, ano) {

    const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
    const novo = await PDFLib.PDFDocument.create();

    const pagina = pdf.getPages()[0];
    const { width, height } = pagina.getSize();

    const marginLeft = 40;
    const marginRight = 20;
    const cropWidth = width - marginLeft - marginRight;
    const cropHeight = height / 2;

    const embeddedPage = await novo.embedPage(pagina, {
        left: marginLeft,
        right: width - marginRight,
        bottom: height / 2,
        top: height,
    });

    const novaPagina = novo.addPage([cropWidth, cropHeight]);
    novaPagina.drawPage(embeddedPage, { x: 0, y: 0, width: cropWidth, height: cropHeight });

    const texto = `${numero}/${ano}`;
    const font = await novo.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const fontSize = 12;
    const padding = 5;
    const boxWidth = font.widthOfTextAtSize(texto, fontSize) + padding * 2;
    const boxHeight = font.heightAtSize(fontSize) + padding * 2;
    const x = cropWidth - boxWidth - 5;
    const y = cropHeight - boxHeight - 5;

    novaPagina.drawRectangle({
        x, y,
        width: boxWidth,
        height: boxHeight,
        borderWidth: 1,
        color: PDFLib.rgb(1, 1, 1),
        borderColor: PDFLib.rgb(0, 0, 0),
    });

    novaPagina.drawText(texto, {
        x: x + padding,
        y: y + padding,
        size: fontSize,
        font,
        color: PDFLib.rgb(0, 0, 0),
    });

    return await novo.save();
}

function buscarPDFs(obj) {
    let resultados = [];
    if (Array.isArray(obj)) {
        obj.forEach((i) => (resultados = resultados.concat(buscarPDFs(i))));
    } else if (obj && typeof obj === "object") {
        if (obj.arquivo_fta && obj.content_type_fta === "application/pdf") {
            resultados.push({ id_arq_fta: obj.id_arq_fta });
        }
        for (const k in obj) {
            resultados = resultados.concat(buscarPDFs(obj[k]));
        }
    }
    return resultados;
}

// ─────────────────────────────────────────────
//  Execução principal
// ─────────────────────────────────────────────

async function executarChamada() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("libs/pdf.worker.min.js");

    const folderId = getFolderId();

    if (!bearerToken) throw new Error("Token ainda não capturado. Navegue por qualquer página do sistema primeiro.");
    if (!folderId) throw new Error("Pasta não identificada na URL.");

    // console.log("▶️ Iniciando — folderId:", folderId);

    const pdfFinal = await PDFLib.PDFDocument.create();
    const processosComEmpenho = new Set();

    const response = await fetch(
        `/server/api/fluxo/inbox/${folderId}?sort=datamovimento_cai,desc`,
        { headers: { Authorization: bearerToken } }
    );
    const data = await response.json();
    const lista = data.data || data.results || data;

    let i = 0;
    for (const item of lista) {
        i++;
        const id_fxo = item.id_fxo;
        let btn = document.getElementById("btn-empenho");
        if(btn)
            btn.innerText = `Processando ${i}/${lista.length}`;
        if (!id_fxo) continue;

        const respTramites = await fetch(
            `/server/api/fluxo/inbox/${folderId}/fluxos/${id_fxo}/tramites?limit=20&offset=0`,
            { headers: { Authorization: bearerToken } }
        );
        const dataTramites = await respTramites.json();
        const listaTramites = dataTramites.data || dataTramites.results || dataTramites;

        const arquivos = [...buscarPDFs(listaTramites)].reverse();

        for (const arq of arquivos) {
            if (processosComEmpenho.has(id_fxo)) break;

            // console.log("⬇️ Baixando:", arq.id_arq_fta);
            const buffer = await baixarPDF(arq.id_arq_fta);
            const ehEmpenho = await pdfContemEmpenho(buffer);

            if (ehEmpenho) {
                // console.log("💰 Empenho encontrado — processo:", id_fxo);
                processosComEmpenho.add(id_fxo);

                const cortado = await cortarPDF(buffer.slice(0), item.numero_fxo, item.ano_fxo);
                const pdfTmp = await PDFLib.PDFDocument.load(cortado);
                const pages = await pdfFinal.copyPages(pdfTmp, pdfTmp.getPageIndices());
                pages.forEach((p) => pdfFinal.addPage(p));
                break;
            }
        }
    }

    const finalBytes = await pdfFinal.save();
    const blob = new Blob([finalBytes], { type: "application/pdf" });
    window.open(URL.createObjectURL(blob));
    // console.log("✅ PDF final gerado!");
}

// ─────────────────────────────────────────────
//  Botão fixo na página
// ─────────────────────────────────────────────

// function criarBotao() {
//     if (document.getElementById("btn-empenho")) return;

//     const btn = document.createElement("button");
//     btn.id = "btn-empenho";
//     btn.innerText = "Processar Empenhos";

//     Object.assign(btn.style, {
//         position: "fixed",
//         top: "20px",
//         right: "20px",
//         zIndex: "9999",
//         padding: "10px 15px",
//         background: "#1976d2",
//         color: "#fff",
//         border: "none",
//         borderRadius: "5px",
//         cursor: "pointer",
//         fontSize: "14px",
//         boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
//     });

//     btn.addEventListener("click", async () => {
//         btn.innerText = "Processando…";
//         btn.disabled = true;

//         try {
//             await executarChamada(btn);
//             btn.innerText = "Concluído ✔";
//         } catch (e) {
//             console.error(e);
//             btn.innerText = `Erro ❌ — ${e.message}`;
//         } finally {
//             setTimeout(() => {
//                 btn.innerText = "Processar Empenhos";
//                 btn.disabled = false;
//             }, 3000);
//         }
//     });

//     document.body.appendChild(btn);
// }

function criarBotao() {
    if (document.getElementById("btn-empenho")) return;

    // Localiza o container de botões à direita (notificações, fullscreen, etc)
    // Baseado na estrutura: <div class="flex items-center space-x-0.5 sm:space-x-2">
    const headerSelectors = [
        'flow-header-notifications', 
        'fuse-fullscreen',
        '.ms-auto'
    ];
    
    let containerPai = null;
    for (const selector of headerSelectors) {
        const el = document.querySelector(selector);
        if (el) {
            containerPai = el.parentElement;
            break;
        }
    }

    if (!containerPai) {
        // console.log("⚠️ Container do header não encontrado, tentando novamente em 2s...");
        setTimeout(criarBotao, 2000);
        return;
    }

    const btn = document.createElement("button");
    btn.id = "btn-empenho";
    btn.innerText = "Processar Empenhos";

    // Estilização para combinar com o layout do Flowdocs [cite: 3, 4, 13]
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
        display: "flex",
        alignItems: "center",
        transition: "background 0.2s"
    });

    btn.addEventListener("click", async () => {
        btn.innerText = "Processando...";
        btn.disabled = true;
        try {
            await executarChamada(btn);
            btn.innerText = "Concluído ✔";
        } catch (e) {
            console.error(e);
            btn.innerText = `Erro ❌`;
        } finally {
            setTimeout(() => {
                btn.innerText = "Processar Empenhos";
                btn.disabled = false;
            }, 3000);
        }
    });

    // Insere o botão antes dos ícones de notificação/usuário [cite: 426, 464]
    containerPai.insertBefore(btn, containerPai.firstChild);
    // console.log("✅ Botão adicionado ao header!");
}

// Executa a tentativa de inserção
criarBotao();

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", criarBotao);
} else {
    criarBotao();
}