# Final Touch Color Consultant

Ferramenta de consultoria de cores da **Final Touch Painters**. Funciona no navegador (celular, tablet ou computador), sem instalar nada.

1. **Entrevista**: perguntas de designer em inglês (para ler ao cliente), com a tradução em português.
2. **Cores**: gera 3 opções completas (parede, trim, teto, parede destaque, portas, armários) com as cores reais da **Benjamin Moore** e da **Sherwin-Williams**, com código de loja, LRV, localização no leque da SW e a cor mais parecida da outra marca. Qualquer cor pode ser trocada pelo catálogo.
3. **Fotos**: você só joga a foto. Um modelo de reconhecimento de ambientes, que roda no próprio aparelho, acha paredes, teto, portas e armários (o trim você marca com um toque) e o app pinta as 3 opções com a **cor exata** do código da tinta, deixando todo o resto da foto igual. Para ajustar, use a Seleção inteligente, o Pincel e a Borracha. Sem a IA, as áreas são marcadas à mão com essas mesmas ferramentas.
4. **Apresentação**: documento em inglês com a marca Final Touch (capa, resumo, 3 opções com fotos, comparação lado a lado, lista de compras, próximos passos), pronto para salvar em PDF.

## Como usar

- **No computador:** baixe a pasta e abra o `index.html` no Chrome, ou publique no GitHub Pages (abaixo).
- **Salvar PDF:** Etapa 4 → *Salvar PDF / Imprimir* → destino “Salvar como PDF”. Marque “Gráficos de fundo” se as cores não aparecerem.
- **Logo oficial:** Configurações → *Enviar logo oficial*. O `assets/logo.svg` é uma recriação provisória.
- **NJ HIC #:** Configurações → preencha para aparecer no rodapé da apresentação.
- Os projetos ficam salvos automaticamente **neste aparelho** (menu *Projetos*).

### Publicar como site (GitHub Pages)
No GitHub: *Settings → Pages → Build and deployment → Deploy from a branch* → escolha a branch e a pasta `/ (root)`. O site fica em `https://<usuario>.github.io/<repositorio>/`.

### Reconhecimento de ambientes (automático, sem configurar nada)
Ao jogar a foto, o app roda no próprio aparelho um modelo de reconhecimento de ambientes (DeepLabV3 + MobileNetV2 treinado no ADE20K, 150 categorias). Ele separa **parede, teto, porta e armário** pelo formato e pelo contexto, e o app ajusta as bordas pela cor real da foto e descarta pedaços de móveis confundidos com parede. Depois pinta as 3 opções com a cor exata.

- Grátis, sem chave, funciona dentro do Claude e no site. Na primeira vez baixa ~10 MB (biblioteca TensorFlow.js + `models/seg-weights.bin`).
- **Trim (rodapé, guarnições) o modelo não reconhece**: escolha *Trim* e toque nele com a Seleção inteligente.
- Ajustes finos: Seleção inteligente, Pincel e Borracha. Parede de destaque interna é marcada à mão.
- Reservas (só se o modelo não carregar): o próprio Claude (no app do Claude) ou a IA do Google com chave em Configurações.
- Modelo: `tools/export_segmodel.py` converte o arquivo TFLite oficial (TensorFlow Models, Apache-2.0) em `models/seg-graph.json` + `models/seg-weights.bin`.

### Ambientes prontos (3D, troca de cor perfeita)
Na etapa *Fotos*, o botão **Ambientes prontos** abre 5 ambientes renderizados em 3D (sala, quarto com parede de destaque, cozinha, sala de jantar e fachada colonial). Como cada parede, teto, trim, porta, armário e destaque é um objeto separado no 3D, as áreas são exatas e a troca de cor sai perfeita. Útil quando não há foto boa do cômodo do cliente.

- Gerados com Blender/Cycles por `tools/rooms/build_rooms.py` e empacotados por `tools/rooms/pack_rooms.py` em `rooms/rooms.js` (foto + áreas).
- Para criar mais ambientes: acrescente uma função `room_*` em `build_rooms.py`, rode o build (`pip install bpy`) e o pack.

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
js/segment.js       reconhecimento de ambientes no navegador (TensorFlow.js)
js/ai.js            reservas: Claude (no app do Claude) e Gemini (com chave)
js/report.js        apresentação para o cliente
js/store.js         salvamento local (IndexedDB) e configurações
js/app.js           ligação da interface
tools/bundle.py     gera um arquivo HTML único (versão para abrir no Claude)
tools/rooms/        ambientes prontos em 3D (Blender) e empacotador
rooms/rooms.js      ambientes prontos (foto + áreas exatas)
```
