# Final Touch Color Consultant

Ferramenta de consultoria de cores da **Final Touch Painters**. Funciona no navegador (celular, tablet ou computador), sem instalar nada.

1. **Entrevista**: perguntas de designer em inglês (para ler ao cliente), com a tradução em português.
2. **Cores**: gera 3 opções completas (parede, trim, teto, parede destaque, portas, armários) com as cores reais da **Benjamin Moore** e da **Sherwin-Williams**, com código de loja, LRV, localização no leque da SW e a cor mais parecida da outra marca. Qualquer cor pode ser trocada pelo catálogo.
3. **Fotos**: você marca na foto do cliente o que é parede, trim e teto (seleção inteligente + pincel) e o app repinta só essas áreas, mantendo luz e sombra. Opcional: gerar a versão com IA (Google Gemini).
4. **Apresentação**: documento em inglês com a marca Final Touch (capa, resumo, 3 opções com fotos, comparação lado a lado, lista de compras, próximos passos), pronto para salvar em PDF.

## Como usar

- **No computador:** baixe a pasta e abra o `index.html` no Chrome, ou publique no GitHub Pages (abaixo).
- **Salvar PDF:** Etapa 4 → *Salvar PDF / Imprimir* → destino “Salvar como PDF”. Marque “Gráficos de fundo” se as cores não aparecerem.
- **Logo oficial:** Configurações → *Enviar logo oficial*. O `assets/logo.svg` é uma recriação provisória.
- **NJ HIC #:** Configurações → preencha para aparecer no rodapé da apresentação.
- Os projetos ficam salvos automaticamente **neste aparelho** (menu *Projetos*).

### Publicar como site (GitHub Pages)
No GitHub: *Settings → Pages → Build and deployment → Deploy from a branch* → escolha a branch e a pasta `/ (root)`. O site fica em `https://<usuario>.github.io/<repositorio>/`.

### IA para as fotos (opcional)
O visualizador local já funciona sem IA e garante que só as áreas marcadas mudam. Para usar a IA do Google: crie uma chave em aistudio.google.com → *Get API key* e cole em Configurações. A chave fica só no navegador e é enviada apenas para `generativelanguage.googleapis.com`. A IA pode mudar detalhes da foto; confira antes de mostrar ao cliente.

## Dados das cores

`data/colors.js` é gerado por `tools/build_colors.py` a partir de cópias públicas dos catálogos:

| Marca | Cores | Fonte |
|---|---|---|
| Benjamin Moore | 4.068 | API do site da Benjamin Moore, cópia de 05/11/2026 (github.com/josh-williams/undertone) |
| Sherwin-Williams | 1.728 ativas (descontinuadas removidas) | API de cores da Sherwin-Williams (github.com/Sonic12040/sw-color-tester) |

A cor na tela é uma aproximação. Sempre confirme com amostra física na parede antes de pintar.

## Estrutura

```
index.html          interface
css/app.css         estilo do app
css/report.css      estilo da apresentação / PDF (tamanho Letter)
js/color.js         ciência de cor (OKLab), classificação de família e subtom, catálogo
js/questions.js     roteiro da entrevista
js/recommend.js     motor de recomendação (3 opções + trim, teto, destaque)
js/visualizer.js    seleção inteligente, pincel e repintura da foto
js/ai.js            repintura opcional via Gemini
js/report.js        apresentação para o cliente
js/store.js         salvamento local (IndexedDB) e configurações
js/app.js           ligação da interface
tools/bundle.py     gera um arquivo HTML único (versão para abrir no Claude)
```
