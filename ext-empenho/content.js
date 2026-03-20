// ══════════════════════════════════════════════════════════════
//  content.js — Bootstrap do módulo Tesouraria
//
//  Este arquivo é o ponto de entrada do content script.
//  A classe Tesouraria é definida em tesouraria.js, que o
//  manifest garante ser carregado antes deste arquivo.
// ══════════════════════════════════════════════════════════════

const tesouraria = new Tesouraria();

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => tesouraria.init());
} else {
    tesouraria.init();
}