// ══════════════════════════════════════════════════════════════
//  interceptor.js — Mundo MAIN
//  Responsabilidades:
//    • Interceptar XHR e Fetch para capturar o Bearer Token
//    • Enviar o token via postMessage ao content.js
//    • Desativar-se imediatamente após o primeiro token capturado
// ══════════════════════════════════════════════════════════════

(function () {
    // Garante execução única mesmo se re-injetado
    if (window.__empenhoInterceptorAtivo) return;
    window.__empenhoInterceptorAtivo = true;

    let tokenCapturado = false;

    // ──────────────────────────────────────────────────────────
    //  Envia token e desativa os interceptores
    // ──────────────────────────────────────────────────────────
    function enviarTokenEDesativar(token) {
        if (tokenCapturado) return; // Já capturamos — ignora chamadas extras
        tokenCapturado = true;

        window.postMessage({ type: "EMPENHO_TOKEN", token }, "*");

        // Restaura XHR e Fetch originais para não impactar a performance
        try {
            XMLHttpRequest.prototype.setRequestHeader = _origSetHeader;
        } catch (_) {}

        try {
            window.fetch = _origFetch;
        } catch (_) {}

        console.debug("[Tesouraria/Interceptor] Token capturado. Interceptores desativados.");
    }

    // ──────────────────────────────────────────────────────────
    //  Intercepta XMLHttpRequest
    // ──────────────────────────────────────────────────────────
    const _origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
        try {
            if (header.toLowerCase() === "authorization" && value) {
                enviarTokenEDesativar(value);
            }
        } catch (err) {
            console.error("[Tesouraria/Interceptor] Erro no hook XHR:", err);
        } finally {
            return _origSetHeader.apply(this, arguments);
        }
    };

    // ──────────────────────────────────────────────────────────
    //  Intercepta Fetch API
    // ──────────────────────────────────────────────────────────
    const _origFetch = window.fetch;

    window.fetch = async function (...args) {
        try {
            const [, options] = args;
            if (options?.headers) {
                const headers = options.headers;
                const auth =
                    headers instanceof Headers
                        ? headers.get("Authorization")
                        : headers.Authorization || headers.authorization;

                if (auth) {
                    enviarTokenEDesativar(auth);
                }
            }
        } catch (err) {
            console.error("[Tesouraria/Interceptor] Erro no hook Fetch:", err);
        }

        return _origFetch.apply(this, args);
    };
})();