/* Interview script. `q` is what you read to the client (English),
   `pt` is the Portuguese helper for the consultant. */
(function (root) {
  'use strict';
  var Q = [
    {
      id: 'project', type: 'single', section: 'The project',
      q: 'Is this project inside or outside the home?',
      pt: 'O projeto é interno ou externo?',
      options: [
        { v: 'interior', en: 'Interior', pt: 'Interno' },
        { v: 'exterior', en: 'Exterior', pt: 'Externo' }
      ]
    },
    {
      id: 'room', type: 'single', section: 'The project', showIf: function (a) { return a.project !== 'exterior'; },
      q: 'Which room are we choosing colors for?',
      pt: 'Qual cômodo vamos pintar?',
      options: [
        { v: 'living', en: 'Living / family room', pt: 'Sala de estar' },
        { v: 'bedroom', en: 'Bedroom', pt: 'Quarto' },
        { v: 'primary', en: 'Primary suite', pt: 'Suíte principal' },
        { v: 'kitchen', en: 'Kitchen', pt: 'Cozinha' },
        { v: 'dining', en: 'Dining room', pt: 'Sala de jantar' },
        { v: 'bath', en: 'Bathroom', pt: 'Banheiro' },
        { v: 'office', en: 'Home office', pt: 'Escritório' },
        { v: 'nursery', en: 'Nursery / kids', pt: 'Quarto de bebê / criança' },
        { v: 'hall', en: 'Hallway / entry / stairs', pt: 'Corredor / entrada / escada' },
        { v: 'basement', en: 'Basement', pt: 'Porão' },
        { v: 'whole', en: 'Whole house / open plan', pt: 'Casa toda / conceito aberto' }
      ]
    },
    {
      id: 'surfaces', type: 'multi', section: 'The project',
      q: 'Which surfaces are we painting?',
      pt: 'Quais superfícies vamos pintar? (isso define o que muda na foto)',
      options: function (a) {
        return a.project === 'exterior' ? [
          { v: 'walls', en: 'Body / siding', pt: 'Corpo / siding' },
          { v: 'trim', en: 'Trim, fascia & windows', pt: 'Trim, fascia e janelas' },
          { v: 'accent', en: 'Front door & shutters', pt: 'Porta da frente e venezianas' }
        ] : [
          { v: 'walls', en: 'Walls', pt: 'Paredes' },
          { v: 'trim', en: 'Trim & baseboards', pt: 'Trim e rodapés' },
          { v: 'ceiling', en: 'Ceiling', pt: 'Teto' },
          { v: 'accent', en: 'Accent wall', pt: 'Parede de destaque' },
          { v: 'doors', en: 'Interior doors', pt: 'Portas' },
          { v: 'cabinets', en: 'Cabinets / built-ins', pt: 'Armários / marcenaria' }
        ];
      },
      def: ['walls', 'trim', 'ceiling']
    },
    {
      id: 'exposure', type: 'single', section: 'Light',
      q: 'Which way do the main windows face?',
      pt: 'Para que lado ficam as janelas principais? (use a bússola do celular)',
      showIf: function (a) { return a.project !== 'exterior'; },
      options: [
        { v: 'north', en: 'North (cool, even light)', pt: 'Norte (luz fria e uniforme)' },
        { v: 'south', en: 'South (warm, strong light)', pt: 'Sul (luz quente e forte)' },
        { v: 'east', en: 'East (bright mornings)', pt: 'Leste (manhã clara)' },
        { v: 'west', en: 'West (warm evenings)', pt: 'Oeste (tarde quente)' },
        { v: 'unknown', en: 'Not sure', pt: 'Não sei' }
      ]
    },
    {
      id: 'light', type: 'single', section: 'Light',
      q: 'How much natural light does the space get?',
      pt: 'Quanta luz natural o espaço recebe?',
      options: [
        { v: 'low', en: 'Not much, it feels dark', pt: 'Pouca, é escuro' },
        { v: 'medium', en: 'Average', pt: 'Média' },
        { v: 'high', en: 'Lots of sun', pt: 'Muito sol' }
      ]
    },
    {
      id: 'moods', type: 'multi', max: 2, section: 'How it should feel',
      q: 'When you walk in, how do you want the space to feel? Pick up to two.',
      pt: 'Como o cliente quer se sentir no ambiente? (até 2)',
      options: [
        { v: 'calm', en: 'Calm & relaxing', pt: 'Calmo e relaxante' },
        { v: 'cozy', en: 'Warm & cozy', pt: 'Aconchegante' },
        { v: 'airy', en: 'Bright & airy', pt: 'Claro e arejado' },
        { v: 'elegant', en: 'Elegant & sophisticated', pt: 'Elegante e sofisticado' },
        { v: 'dramatic', en: 'Dramatic & moody', pt: 'Dramático / escuro' },
        { v: 'fresh', en: 'Fresh & clean', pt: 'Fresco e limpo' },
        { v: 'earthy', en: 'Natural & earthy', pt: 'Natural e terroso' },
        { v: 'energetic', en: 'Cheerful & energetic', pt: 'Alegre e energético' }
      ]
    },
    {
      id: 'style', type: 'single', section: 'How it should feel',
      q: 'Which style is closest to your home?',
      pt: 'Qual estilo mais combina com a casa?',
      options: [
        { v: 'modern', en: 'Modern / minimal', pt: 'Moderno / minimalista' },
        { v: 'transitional', en: 'Transitional', pt: 'Transicional (clássico + moderno)' },
        { v: 'traditional', en: 'Traditional / classic', pt: 'Tradicional / clássico' },
        { v: 'farmhouse', en: 'Modern farmhouse', pt: 'Farmhouse' },
        { v: 'coastal', en: 'Coastal / beach house', pt: 'Praiano / costeiro' },
        { v: 'scandi', en: 'Scandinavian', pt: 'Escandinavo' },
        { v: 'midcentury', en: 'Mid-century', pt: 'Mid-century (anos 50/60)' },
        { v: 'industrial', en: 'Industrial', pt: 'Industrial' },
        { v: 'boho', en: 'Eclectic / boho', pt: 'Eclético / boho' }
      ]
    },
    {
      id: 'depth', type: 'single', section: 'Color direction',
      q: 'For the main color, do you lean light, medium or dark?',
      pt: 'Para a cor principal: clara, média ou escura?',
      options: [
        { v: 'light', en: 'Light & airy', pt: 'Clara' },
        { v: 'mid', en: 'Medium', pt: 'Média' },
        { v: 'deep', en: 'Dark & rich', pt: 'Escura' }
      ]
    },
    {
      id: 'temp', type: 'single', section: 'Color direction',
      q: 'Do you prefer warm colors, cool colors, or something in between?',
      pt: 'Prefere cores quentes, frias ou no meio-termo?',
      options: [
        { v: 'warm', en: 'Warm (creamy, beige, earthy)', pt: 'Quente (creme, bege, terroso)' },
        { v: 'cool', en: 'Cool (crisp, gray, blue)', pt: 'Fria (cinza, azul, branco puro)' },
        { v: 'balanced', en: 'In between', pt: 'Meio-termo' },
        { v: 'any', en: 'No preference', pt: 'Tanto faz' }
      ]
    },
    {
      id: 'likes', type: 'multi', section: 'Color direction',
      q: 'Which color families do you love?',
      pt: 'Quais famílias de cor o cliente gosta?',
      options: 'families'
    },
    {
      id: 'avoid', type: 'multi', section: 'Color direction',
      q: 'Any colors you definitely do not want?',
      pt: 'Alguma cor que ele NÃO quer de jeito nenhum?',
      options: 'families'
    },
    {
      id: 'fixed', type: 'single', section: 'What stays',
      q: 'What are the floors and big fixed pieces like?',
      pt: 'Como são o piso e as peças fixas (bancada, sofá, armários)?',
      options: [
        { v: 'warmwood', en: 'Warm wood / beige tones', pt: 'Madeira quente / tons bege' },
        { v: 'coolgray', en: 'Gray, white or cool stone', pt: 'Cinza, branco ou pedra fria' },
        { v: 'dark', en: 'Dark wood / dark finishes', pt: 'Madeira escura / acabamentos escuros' },
        { v: 'mixed', en: 'Mixed / not sure', pt: 'Misturado / não sei' }
      ]
    },
    {
      id: 'trimStyle', type: 'single', section: 'Trim & ceiling',
      q: 'How should the trim look?',
      pt: 'Como deve ficar o trim (rodapé, guarnições)?',
      showIf: function (a) { return (a.surfaces || []).indexOf('trim') >= 0; },
      options: [
        { v: 'crisp', en: 'Crisp, clean white', pt: 'Branco puro' },
        { v: 'soft', en: 'Soft, warm white', pt: 'Branco suave / quente' },
        { v: 'contrast', en: 'Dark contrast trim', pt: 'Trim escuro (contraste)' },
        { v: 'match', en: 'Same color as the walls', pt: 'Mesma cor da parede' }
      ]
    },
    {
      id: 'ceilingStyle', type: 'single', section: 'Trim & ceiling',
      q: 'And the ceiling?',
      pt: 'E o teto?',
      showIf: function (a) { return a.project !== 'exterior' && (a.surfaces || []).indexOf('ceiling') >= 0; },
      options: [
        { v: 'white', en: 'Bright white', pt: 'Branco' },
        { v: 'tint', en: 'A lighter tint of the wall color', pt: 'Um tom mais claro da parede' },
        { v: 'match', en: 'Same as the walls', pt: 'Mesma cor da parede' }
      ]
    },
    {
      id: 'brand', type: 'single', section: 'Paint',
      q: 'Do you have a paint brand you prefer?',
      pt: 'Tem preferência de marca?',
      options: [
        { v: 'both', en: 'No preference', pt: 'Tanto faz (mostrar as duas)' },
        { v: 'BM', en: 'Benjamin Moore', pt: 'Benjamin Moore' },
        { v: 'SW', en: 'Sherwin-Williams', pt: 'Sherwin-Williams' }
      ]
    },
    {
      id: 'proven', type: 'single', section: 'Paint',
      q: 'Would you rather stick to proven, best-selling colors, or see something more unique?',
      pt: 'Prefere cores campeãs de venda (seguras) ou algo mais diferente?',
      options: [
        { v: 'proven', en: 'Proven favorites', pt: 'Cores campeãs (seguras)' },
        { v: 'mix', en: 'A mix', pt: 'Uma mistura' },
        { v: 'unique', en: 'Something unique', pt: 'Algo diferente' }
      ]
    },
    {
      id: 'notes', type: 'text', section: 'Notes',
      q: 'Anything else we should know? Colors you saw and liked, furniture, art, inspiration photos?',
      pt: 'Observações: cores que viu e gostou, móveis, quadros, fotos de inspiração.'
    }
  ];

  var FAMILY_ORDER = ['white', 'cream', 'greige', 'gray', 'beige', 'taupe', 'black', 'brown', 'blue', 'navy', 'teal', 'green', 'sage', 'yellow', 'orange', 'pink', 'red', 'purple'];

  var DEFAULT_ANSWERS = {
    project: 'interior', room: 'living', surfaces: ['walls', 'trim', 'ceiling'],
    exposure: 'unknown', light: 'medium', moods: [], style: '', depth: 'light', temp: 'any',
    likes: [], avoid: [], fixed: 'mixed', trimStyle: 'soft', ceilingStyle: 'white',
    brand: 'both', proven: 'mix', notes: ''
  };

  root.FTQuestions = { list: Q, FAMILY_ORDER: FAMILY_ORDER, DEFAULT_ANSWERS: DEFAULT_ANSWERS };
})(typeof window !== 'undefined' ? window : globalThis);
