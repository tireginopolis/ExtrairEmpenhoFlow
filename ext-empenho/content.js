// ══════════════════════════════════════════════════════════════
//  content.js — Bootstrap de todos os módulos
//
//  Ordem de carregamento garantida pelo manifest:
//    1. libs/pdf.min.js
//    2. libs/pdf-lib.min.js
//    3. tesouraria.js        → define class Tesouraria
//    4. contabilidade.js     → define class Contabilidade
//    5. empenho-consulta.js  → define class EmpenhoConsulta
//    6. content.js           → instancia e inicializa tudo
//
//  Ativação:
//    • Tesouraria e Contabilidade possuem toggles independentes.
//    • EmpenhoConsulta compartilha o toggle/storage da Contabilidade:
//      ambos os botões aparecem e somem juntos.
// ══════════════════════════════════════════════════════════════

// ── Módulo Tesouraria ─────────────────────────────────────────
const tesouraria = new Tesouraria();

// ── Módulo Contabilidade ──────────────────────────────────────
//  Recebe um getter de token que delega para a instância Tesouraria,
//  garantindo que ambos compartilhem o mesmo token capturado.
const contabilidade = new Contabilidade(() => tesouraria.bearerToken);

// ── Módulo Empenho ────────────────────────────────────────────
//  Ativa/desativa junto com o módulo Contabilidade.
//  Usa a mesma STORAGE_KEY ("contabilidade_ativo") e escuta a mesma
//  mensagem CONTABILIDADE_TOGGLE enviada pelo background.js.
const empenho = new EmpenhoConsulta();

// ── Inicialização ─────────────────────────────────────────────
function inicializar() {
    tesouraria.init();
    contabilidade.init();
    empenho.init();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializar);
} else {
    inicializar();
}