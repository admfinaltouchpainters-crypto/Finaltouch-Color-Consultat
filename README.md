# Final Touch Color Consultant

Ferramenta de consultoria de cores da **Final Touch Painters**. Funciona no navegador (celular, tablet ou computador), sem instalar nada.

1. **Entrevista**: perguntas de designer em inglês (para ler ao cliente), com a tradução em português.
2. **Cores**: gera 3 opções completas (parede, trim, teto, parede destaque, portas, armários) com as cores reais da **Benjamin Moore** e da **Sherwin-Williams**, com código de loja, LRV, localização no leque da SW e a cor mais parecida da outra marca. Qualquer cor pode ser trocada pelo catálogo.
3. **Fotos**: você só joga a foto. A IA do Google (Gemini) acha paredes, trim, teto, portas e armários (uma chamada por foto) e o app pinta as 3 opções com a **cor exata** do código da tinta, deixando todo o resto da foto igual. Para ajustar, use a Seleção inteligente, o Pincel e a Borracha. Sem a IA, as áreas são marcadas à mão com essas mesmas ferramentas.
4. **Apresentação**: documento em inglês com a marca Final Touch (capa, resumo, 3 opções com fotos, comparação lado a lado, lista de compras, próximos passos), pronto para salvar em PDF.

## Como usar

- **No computador:** baixe a pasta e abra o `index.html` no Chrome, ou publique no GitHub Pages (abaixo).
- **Salvar PDF:** Etapa 4 → *Salvar PDF / Imprimir* → destino “Salvar como PDF”. Marque “Gráficos de fundo” se as cores não aparecerem.
- **Logo oficial:** Configurações → *Enviar logo oficial*. O `assets/logo.svg` é uma recriação provisória.
- **NJ HIC #:** Configurações → preencha para aparecer no rodapé da apresentação.
- Os projetos ficam salvos automaticamente **neste aparelho** (menu *Projetos*).

### Publicar como site (GitHub Pages)
No GitHub: *Settings → Pages → Build and deployment → Deploy from a branch* → escolha a branch e a pasta `/ (root)`. O site fica em `https://<usuario>.github.io/<repositorio>/`.

### Ativar a IA (para as fotos saírem sozinhas)
1. Entre em **aistudio.google.com** com uma conta Google → **Get API key** → **Create API key**.
2. No app: **Configurações** → cole em *Chave da API Gemini* → **Salvar**.
3. Pronto: jogue a foto em *Fotos* e as 3 opções saem sozinhas (uns 10 a 20 segundos por foto).

Observações:
- Gerar imagens pode exigir faturamento ativo na conta Google (custa centavos por foto).
- A chave fica salva só no navegador do aparelho e é enviada apenas para `generativelanguage.googleapis.com`.
- **Dentro do Claude a IA não roda** (o Claude bloqueia conexões externas). Use o site (GitHub Pages) ou o `index.html`.
- Se a IA errar uma área, corrija com o Pincel/Borracha. Parede de destaque interna é escolha do cliente, então é marcada à mão.

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
js/ai.js            detecção automática das áreas via Gemini (mapa de cores)
js/report.js        apresentação para o cliente
js/store.js         salvamento local (IndexedDB) e configurações
js/app.js           ligação da interface
tools/bundle.py     gera um arquivo HTML único (versão para abrir no Claude)
```
