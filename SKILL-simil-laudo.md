---
name: simil-laudo
description: Preenche no SIMIL (Caixa) o Laudo de Avaliação › Unidade Isolada Construção a partir do JSON exportado pelo app de campo cadastroscx (iPhone), incluindo envio das fotos com carimbo de data, coordenada e município/UF. Use quando o usuário pedir para lançar/preencher/subir um cadastro de campo no SIMIL, ou entregar um arquivo cadastro-*.json.
---

# Preencher laudo no SIMIL a partir do cadastro de campo

O app de campo (https://fernandossales.github.io/cadastroscx/) gera `cadastro-<nome>-<data>.json`.
O preenchedor (`simil-preencher.js`) roda dentro da página do SIMIL e expõe `window.__cadx`.
Você conduz o Chrome do usuário (Claude in Chrome), que já está logado no SIMIL.

## Regras
- Nunca digite senha nem faça login: se aparecer tela de login, peça ao usuário para entrar e espere.
- Nunca clique em **Finalizar**, **Cancelar** ou **Excluir**.
- **Gravar** cria/salva o laudo na Caixa: só clique se o usuário pediu nesta conversa (ex.: “pode gravar”). Na dúvida, pergunte uma vez.
- Cada chamada de `javascript_tool` deve terminar em poucos segundos: inicie as tarefas longas e acompanhe com `__cadx.estado()`, nunca espere em laço dentro do script.

## Passo a passo

1. **Arquivo.** Peça o caminho do JSON se não veio (geralmente Downloads ou iCloud Drive). O `file_upload` só aceita arquivos da pasta de trabalho: copie para `./_simil/` com PowerShell e use o caminho copiado. Apague a cópia no fim.
2. **Ferramentas.** Carregue de uma vez: `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__find,mcp__claude-in-chrome__file_upload,mcp__claude-in-chrome__computer`.
3. **SIMIL.** `tabs_context_mcp`; use a aba do SIMIL se houver, senão crie uma e abra `https://www.simil.caixa.gov.br/simil/pages/inicial/telaInicial.xhtml`. Confira login (o cabeçalho mostra “Olá <nome>”).
4. **Abrir o laudo.**
   - Laudo novo — clique pelo DOM (o menu é suspenso e fecha):
     ```js
     const g=[...document.querySelectorAll('li')].find(l=>/^Unidade Isolada\s*Constru/.test(l.querySelector(':scope>a,:scope>span')?.textContent.trim()||''));
     [...g.querySelectorAll('a')].find(a=>a.textContent.trim()==='Criar Laudo').click()
     ```
     Se não achar, use os ids: `formMenu-j_idt19-j_idt29-j_idt32-itemMenu`.
   - Laudo existente: peça ao usuário para abri-lo (Pesquisar Laudo › editar) e confirme a URL `.../laudo/construcao/...xhtml`.
5. **Injetar o preenchedor.**
   ```js
   var s=document.createElement('script');s.src='https://fernandossales.github.io/cadastroscx/simil-preencher.js?v='+Date.now();document.body.appendChild(s);
   ```
   Espere ~2 s e confirme com `!!window.__cadx`.
6. **Carregar o JSON.** `find` “cadx arquivo json” → `file_upload` com o ref e o caminho copiado. Confira `(await __cadx.estado()).cad`.
7. **OS (só laudo novo).** Se `estado().abasLiberadas` é `false`: `__cadx.preencher()` preenche GIHAB/Cód./Ordenador/Ano/Complemento (autocompletar incluso). Quando `fase === 'concluido'`, clique em Gravar (`document.querySelector('[id$="-salvar"]').click()`) se autorizado. A página recarrega: volte ao passo 5 (o cadastro fica guardado; não precisa recarregar o JSON).
8. **Campos.** `__cadx.preencher()` → acompanhe `estado()` a cada ~10 s até `fase === 'concluido'` (leva 1–3 min). Relate `resultado`: `ok`, `opc` (opção inexistente/cortada), `bloq` (campo travado pelo SIMIL), `falta` (seletor não achado). Peça para o usuário conferir e gravar, ou grave se autorizado.
9. **Fotos.** Com o laudo gravado: `__cadx.enviarFotos(true)`. Cada foto recarrega a página; depois de cada recarga reinjete o script (passo 5) — ele retoma sozinho. Repita até `estado().fila.prox === estado().cad.fotos`. Se `fase === 'erro'`, mostre a mensagem do SIMIL e pare. O carimbo (data, coordenada, município–UF) é aplicado no envio.
10. **Fim.** Resuma: laudo (`estado().laudo`), campos preenchidos, avisos, fotos enviadas. Apague `./_simil/`.

## Se o SIMIL mudar
`__cadx.verificar()` lista os campos cujo seletor não bate mais. O mapa fica em `schema.js` do repositório `fernandossales/cadastroscx` (seletor = final do id no SIMIL, `#n` = n-ésima ocorrência na aba).
