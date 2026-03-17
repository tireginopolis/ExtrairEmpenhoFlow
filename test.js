(function () {

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
                console.log("🔑 Token capturado (fetch):", bearerToken);
                executarChamada();
            }
        }

        return originalFetch.apply(this, args);
    };

    // 📡 Função principal
    async function executarChamada() {
        const folderId = getFolderId();

        if (!bearerToken || jaExecutou || !folderId) return;

        jaExecutou = true;

        try {
            const url = `/server/api/fluxo/inbox/${folderId}?sort=datamovimento_cai,desc`;

            console.log("📡 Buscando fluxos:", url);

            const response = await fetch(url, {
                headers: {
                    "Authorization": bearerToken
                }
            });

            const data = await response.json();

            console.log("📦 Fluxos encontrados:", data);

            // 🔁 Para cada fluxo
            const lista = Array.isArray(data) ? data : (data.data || data.results || []);

            for (const item of lista) {

                const id_fxo = item.id_fxo;

                if (!id_fxo) continue;

                const urlTramites = `/server/api/fluxo/inbox/${folderId}/fluxos/${id_fxo}/tramites?limit=20&offset=0&sort=num_ftr,desc`;

                console.log("➡️ Buscando trâmites:", urlTramites);

                const respTramites = await fetch(urlTramites, {
                    headers: {
                        "Authorization": bearerToken
                    }
                });

                const data1 = await respTramites.json();

                // 🔍 Percorre trâmites
                const listaTramites = Array.isArray(data1) ? data1 : (data1.data || data1.results || []);

                const resultados = buscarPDFs(listaTramites, {
                    id_fxo: id_fxo,
                    numero_fxo: item.numero_fxo,
                    ano_fxo: item.ano_fxo
                });

                for (const r of resultados) {
                    console.log("📄 PDF encontrado:");
                    console.log(r);
                }
            }

        } catch (e) {
            console.error("❌ Erro:", e);
        }
    }

    function buscarPDFs(obj, contexto = {}) {
        let resultados = [];

        if (Array.isArray(obj)) {
            for (const item of obj) {
                resultados = resultados.concat(buscarPDFs(item, contexto));
            }
        } else if (obj && typeof obj === 'object') {

            // 🧠 Verifica se esse objeto é um PDF válido
            if (
                obj.arquivo_fta &&
                obj.content_type_fta === "application/pdf"
            ) {
                resultados.push({
                    ...contexto,
                    id_arq_fta: obj.id_arq_fta
                });
            }

            // 🔁 Continua varrendo os filhos
            for (const key in obj) {
                resultados = resultados.concat(buscarPDFs(obj[key], contexto));
            }
        }

        return resultados;
    }

    // fallback
    setTimeout(executarChamada, 2000);

})();

Para cada PDF encontrado, faça a rotina de consulta pela chamada da API:
 /server/api/files/arquivos/${id_arq_fta}/download

 Em seguida incremente o código acima para agrupamento e recorte.