// ==UserScript==
// @name         Cadastro de campo → SIMIL
// @namespace    https://fernandossales.github.io/cadastroscx/
// @version      1.0
// @description  Preenche o Laudo de Avaliação (Unidade Isolada Construção) do SIMIL com o JSON do app de campo e envia as fotos em sequência.
// @match        https://www.simil.caixa.gov.br/simil/pages/laudo/construcao/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function () {
  window.CADX_MODO = 'auto'; // abre minimizado; segue o envio de fotos sozinho após cada recarga
  const s = document.createElement('script');
  s.src = 'https://fernandossales.github.io/cadastroscx/simil-preencher.js?v=' + Date.now();
  document.body.appendChild(s);
})();
