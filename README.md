# cadastroscx

Cadastro de vistoria em campo (celular) → preenchimento do **SIMIL** (Laudo de Avaliação › Unidade Isolada Construção).

- `index.html` — app de campo (PWA, offline): campos do laudo, GPS, fotos com referência; exporta JSON.
- `simil-preencher.js` — roda dentro do SIMIL (favorito ou Tampermonkey): lê o JSON, preenche as abas e envia as fotos uma a uma.
- `schema.js` — mapa dos campos do SIMIL (escaneado em 05/11/2026 de `cadastrarlaudo.xhtml`), usado pelos dois.
- `preencher.html` — instalação do favorito e passo a passo.

Se o SIMIL mudar a tela, use **Verificar mapeamento dos campos** no painel para ver o que deixou de bater e ajuste `schema.js`.
