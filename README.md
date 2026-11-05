# cadastroscx

Vistoria em campo no iPhone → JSON → preenchimento automático do **SIMIL** (Laudo de Avaliação › Unidade Isolada Construção) no escritório.

```
iPhone (PWA offline)                 Escritório (Chrome logado no SIMIL)
 index.html + app.js                  simil-preencher.js  ←  favorito | Tampermonkey | skill simil-laudo (Claude)
   campos do laudo                      preenche as abas (espera o AJAX do SIMIL)
   GPS automático + município/UF        envia as fotos uma a uma, com carimbo
   fotos câmera/álbum (EXIF GPS)
        └── cadastro-*.json  ───────────────┘
```

| Arquivo | Papel |
|---|---|
| `index.html`, `app.js` | App de campo. Dados no IndexedDB (cadastros e fotos em stores separados). Exporta/carrega JSON e backup. |
| `geo.js` | GPS (melhor leitura em até 15 s), município/UF (OpenStreetMap, alternativa BigDataCloud, cache), EXIF GPS, carimbo. Usado pelo app e pelo preenchedor. |
| `schema.js` | Mapa dos campos do SIMIL (escaneado de `cadastrarlaudo.xhtml` em 05/11/2026) + limites de caracteres. |
| `simil-preencher.js` | Painel dentro do SIMIL. API `window.__cadx` para automação (`carregar`, `preencher`, `enviarFotos`, `estado`, `verificar`). |
| `SKILL-simil-laudo.md` | Skill do Claude Code para o fluxo do escritório. |
| `preencher.html` | Instalação do favorito e passo a passo. |
| `sw.js` | Cache offline (abre na hora; atualiza em segundo plano). Mude `C` a cada versão. |

**JSON (formato 2):** `{app:'cadastroscx', formato:2, schema, id, titulo, dados:{chave:valor}, fotos:[{id, amb, desc, hora, origem, lat, lon, prec, fonteGeo, municipio, uf, img:dataURL}]}`. A foto vai sem carimbo; o carimbo é aplicado no envio ao SIMIL.

Se o SIMIL mudar a tela, rode **Verificar mapeamento** no painel (ou `__cadx.verificar()`) e ajuste `schema.js`.
