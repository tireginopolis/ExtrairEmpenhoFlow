(async function () {

    await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    await import("https://unpkg.com/pdf-lib/dist/pdf-lib.min.js");

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    let bearerToken = null;
    let jaExecutou = false;

    function getFolderId() {
        const match = window.location.pathname.match(/^\/admin\/inbox\/folder\/(\d+)/);
        return match ? match[1] : null;
    }

    // 🔑 Intercepta XHR (mantido, mas pode não ser usado se for fetch)
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
        if (header.toLowerCase() === 'authorization') {
            bearerToken = value;
            console.log("🔑 Token capturado:", bearerToken);
            executarChamada();
        }
        return origSetHeader.apply(this, arguments);
    };

    // 🔥 Intercepta FETCH (necessário no seu caso)
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        const [url, options] = args;

        if (options?.headers) {
            let auth = null;

            if (options.headers instanceof Headers) {
                auth = options.headers.get("Authorization");
            } else {
                auth = options.headers.Authorization || options.headers.authorization;
            }

            if (auth) {
                bearerToken = auth;
                executarChamada();
            }
        }

        return originalFetch.apply(this, args);
    };

    async function baixarPDF(id) {
        const resp = await fetch(`/server/api/files/arquivos/${id}/download`, {
            headers: { Authorization: bearerToken }
        });

        return await resp.arrayBuffer();
    }

    async function pdfContemEmpenho(arrayBuffer) {

        // 🔥 CLONA o buffer
        const bufferClone = arrayBuffer.slice(0);

        const pdf = await pdfjsLib.getDocument({
            data: bufferClone
        }).promise;

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();

            const texto = content.items.map(i => i.str).join(" ");

            if (
                texto.toUpperCase().includes("NOTA EMPENHO") ||
                texto.toUpperCase().includes("NOTA DE LIQUIDAÇÃO")
            ) {
                return true;
            }
        }

        return false;
    }

    async function cortarPDF(arrayBuffer) {

        const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
        const novo = await PDFLib.PDFDocument.create();

        const pagina = pdf.getPages()[0];
        const { width, height } = pagina.getSize();

        const marginLeft = 50;
        const marginRight = 25;

        // 👉 dimensões reais do recorte
        const cropWidth = width - marginLeft - marginRight;
        const cropHeight = height / 2;

        // 👉 recorte correto (assimétrico)
        const embeddedPage = await novo.embedPage(pagina, {
            left: marginLeft,
            right: width - marginRight,
            bottom: height / 2,
            top: height
        });

        // 👉 página com tamanho exato do recorte
        const novaPagina = novo.addPage([cropWidth, cropHeight]);

        // 👉 desenha sem distorção
        novaPagina.drawPage(embeddedPage, {
            x: 0,
            y: 0,
            width: cropWidth,
            height: cropHeight
        });

        return await novo.save();
    }

    async function executarChamada() {

        const folderId = getFolderId();
        if (!bearerToken || jaExecutou || !folderId) return;

        jaExecutou = true;

        const pdfFinal = await PDFLib.PDFDocument.create();
        const processosComEmpenho = new Set();

        const url = `/server/api/fluxo/inbox/${folderId}?sort=datamovimento_cai,desc`;

        const response = await fetch(url, {
            headers: { Authorization: bearerToken }
        });

        const data = await response.json();
        const lista = data.data || data.results || data;

        for (const item of lista) {

            const id_fxo = item.id_fxo;
            if (!id_fxo) continue;

            const urlTramites = `/server/api/fluxo/inbox/${folderId}/fluxos/${id_fxo}/tramites?limit=20&offset=0`;

            const resp = await fetch(urlTramites, {
                headers: { Authorization: bearerToken }
            });

            const dataTramites = await resp.json();
            const listaTramites = dataTramites.data || dataTramites.results || dataTramites;

            const arquivos = buscarPDFs(listaTramites);

            for (const arq of arquivos) {

                // 🚫 já tem empenho nesse processo
                if (processosComEmpenho.has(id_fxo)) break;

                console.log("⬇️ Baixando:", arq.id_arq_fta);

                const buffer = await baixarPDF(arq.id_arq_fta);

                const ehEmpenho = await pdfContemEmpenho(buffer);

                if (ehEmpenho) {

                    console.log("💰 NOTA EMPENHO encontrada:", id_fxo);

                    processosComEmpenho.add(id_fxo);

                    const bufferParaCorte = buffer.slice(0);
                    const cortado = await cortarPDF(bufferParaCorte);

                    const pdfTmp = await PDFLib.PDFDocument.load(cortado);
                    const pages = await pdfFinal.copyPages(pdfTmp, pdfTmp.getPageIndices());

                    pages.forEach(p => pdfFinal.addPage(p));
                    break;
                }
            }
        }

        const finalBytes = await pdfFinal.save();

        const blob = new Blob([finalBytes], { type: "application/pdf" });
        const urlBlob = URL.createObjectURL(blob);

        window.open(urlBlob);

        console.log("✅ PDF final gerado!");
    }

    function buscarPDFs(obj) {
        let resultados = [];

        if (Array.isArray(obj)) {
            obj.forEach(i => resultados = resultados.concat(buscarPDFs(i)));
        } else if (obj && typeof obj === 'object') {

            if (
                obj.arquivo_fta &&
                obj.content_type_fta === "application/pdf"
            ) {
                resultados.push({
                    id_arq_fta: obj.id_arq_fta
                });
            }

            for (const k in obj) {
                resultados = resultados.concat(buscarPDFs(obj[k]));
            }
        }

        return resultados;
    }

    // fallback
    setTimeout(executarChamada, 2000);

})();