(function () {
    if (window.__empenhoInterceptorAtivo) return;
    window.__empenhoInterceptorAtivo = true;

    function enviarToken(token) {
        window.postMessage({ type: "EMPENHO_TOKEN", token }, "*");
    }

    // Intercepta XHR
    const _origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
        if (header.toLowerCase() === "authorization") {
            enviarToken(value);
        }
        return _origSetHeader.apply(this, arguments);
    };

    // Intercepta Fetch
    const _origFetch = window.fetch;
    window.fetch = async function (...args) {
        const [, options] = args;
        if (options?.headers) {
            const auth =
                options.headers instanceof Headers
                    ? options.headers.get("Authorization")
                    : options.headers.Authorization || options.headers.authorization;
            if (auth) enviarToken(auth);
        }
        return _origFetch.apply(this, args);
    };
})();