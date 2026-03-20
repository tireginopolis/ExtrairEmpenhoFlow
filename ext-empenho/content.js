// ══════════════════════════════════════════════════════════════
//  content.js — Bootstrap de todos os módulos
//
//  Ordem de carregamento garantida pelo manifest:
//    1. libs/pdf.min.js
//    2. libs/pdf-lib.min.js
//    3. tesouraria.js      → define class Tesouraria
//    4. contabilidade.js   → define class Contabilidade
//    5. content.js         → instancia e inicializa tudo
// ══════════════════════════════════════════════════════════════

// ── Módulo Tesouraria ─────────────────────────────────────────
const tesouraria = new Tesouraria();

// ── Módulo Contabilidade ──────────────────────────────────────
//  Recebe um getter de token que delega para a instância Tesouraria,
//  garantindo que ambos compartilhem o mesmo token capturado.
const contabilidade = new Contabilidade(() => tesouraria.bearerToken);

// ── Inicialização ─────────────────────────────────────────────
function inicializar() {
    tesouraria.init();
    contabilidade.init();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializar);
} else {
    inicializar();
}