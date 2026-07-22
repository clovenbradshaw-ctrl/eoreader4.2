// The essay-question battery for the reading-diagnostic probe (probes/reading-diagnostic.mjs).
// Each source names a local text file and the essay questions asked of the reading. The texts
// themselves are NOT committed (public-domain but large); fetch them into a working dir first:
//
//   DIR=/tmp/reading-sources; mkdir -p "$DIR"
//   curl -sL https://www.gutenberg.org/cache/epub/2000/pg2000.txt  -o "$DIR/quijote.txt"   # Don Quijote (es)
//   curl -sL https://www.gutenberg.org/cache/epub/1524/pg1524.txt  -o "$DIR/hamlet.txt"
//   curl -sL https://www.gutenberg.org/cache/epub/1533/pg1533.txt  -o "$DIR/macbeth.txt"
//   curl -sL https://www.gutenberg.org/cache/epub/1532/pg1532.txt  -o "$DIR/lear.txt"
//   curl -sL https://www.gutenberg.org/cache/epub/1531/pg1531.txt  -o "$DIR/othello.txt"
//   curl -sL https://www.gutenberg.org/cache/epub/23042/pg23042.txt -o "$DIR/tempest.txt"
//   # 911.txt: extract text from the GPO PDF (govinfo.gov GPO-911REPORT) — see P6 in
//   #   docs/reading-problems-multi-source.md; any PDF→text extraction works.
//   node probes/reading-diagnostic.mjs --dir "$DIR"
export const BATTERY = [
  {
    id: '911',
    file: '911.txt',
    title: 'The 9/11 Commission Report',
    lang: 'en',
    questions: [
      'The report concludes the attacks were preventable and cites a "failure of imagination". Is "failure of imagination" an adequate framework for institutional failure, or does it obscure more concrete structural and accountability problems?',
      'Analyze the report\'s treatment of the "wall" between intelligence collection and law enforcement. To what extent were legal and cultural barriers, rather than individual errors, responsible for the failure to disrupt the plot?',
      'Assess how the demands of bipartisan consensus and unanimity shaped both the report\'s findings and the questions it chose not to pursue.',
      'Compare the report\'s account of the FBI and the CIA in the years before the attacks. Which institution does the narrative treat more critically, and is that emphasis justified?',
      'Evaluate how the Commission explains the origins of the threat through the biographies and radicalization of the hijackers and al-Qaeda leadership, and whether it addresses ideological, geopolitical, and socioeconomic factors.',
      'Assess the report\'s recommendations for restructuring the intelligence community, including the creation of a Director of National Intelligence. Did these reforms address causes or organizational symptoms?',
      'Analyze how the report\'s narrative structure and rhetorical choices shape the reader\'s understanding of causation and blame.',
      'Examine the Commission\'s handling of the relationship between the U.S. government and Saudi Arabia. What does the report include, defer, or redact, and how do those choices affect its credibility?',
      'The report distinguishes operational failures of the attack from the strategic failure to treat terrorism as a first-order threat. Which does the Commission treat as more consequential?',
      'Evaluate the report as a work of history versus a work of policy. Where does it succeed or fail at each?',
    ],
  },
  {
    id: 'quijote',
    file: 'quijote.txt',
    title: 'Don Quijote',
    lang: 'es',
    questions: [
      'Analice la relación entre la locura y la cordura en Don Quijote. ¿Es la locura del protagonista una condición patológica, una elección deliberada o una forma de lucidez crítica frente a la realidad?',
      'Examine cómo la autoconciencia literaria de la Segunda Parte, donde los personajes han leído la Primera, transforma la novela y anticipa la narrativa moderna.',
      'Evalúe la evolución de la relación entre Don Quijote y Sancho Panza. ¿En qué medida se "quijotiza" Sancho y se "sanchifica" Don Quijote?',
      'Analice la tensión entre parodia de los libros de caballerías y homenaje a los ideales caballerescos. ¿La novela celebra o condena el idealismo?',
      'Discuta el papel de las figuras femeninas —Dulcinea, Marcela, Dorotea— y cómo cuestionan o refuerzan las normas de género de la España del Siglo de Oro.',
      'Analice la función de los narradores intermediarios, sobre todo Cide Hamete Benengeli, y su efecto sobre la fiabilidad y la ironía del texto.',
      'Examine el episodio de la venta que Don Quijote percibe como castillo. ¿Cómo funcionan estos momentos de transformación imaginativa como clave interpretativa de la obra?',
      'La muerte de Alonso Quijano al recuperar la cordura. ¿Es este final una restauración del orden, una tragedia o una crítica al mundo que no supo acoger al idealista?',
      'Analice el tratamiento del humor y la violencia. ¿Cómo debe interpretar el lector contemporáneo las palizas y humillaciones que sufre el protagonista?',
      'Considere Don Quijote como retrato de la España de su tiempo. ¿Qué revela sobre las tensiones sociales, religiosas y económicas del imperio en decadencia?',
    ],
  },
  {
    id: 'hamlet', file: 'hamlet.txt', title: 'Hamlet', lang: 'en',
    questions: [
      'Hamlet\'s delay is the play\'s central interpretive problem. Evaluate the psychological, philosophical, religious, and political explanations for his inaction, or whether the delay resists any single explanation.',
      'Trace the gap between appearance and reality through disguise, deception, and performance in Hamlet, and what it reveals about knowledge and identity.',
      'Analyze the function of madness, both feigned and real, in Hamlet and Ophelia.',
    ],
  },
  {
    id: 'macbeth', file: 'macbeth.txt', title: 'Macbeth', lang: 'en',
    questions: [
      'Assess fate and free will in Macbeth\'s downfall. To what extent do the witches\' prophecies cause events, and to what extent do they reveal desires already present in Macbeth and Lady Macbeth?',
      'Analyze how language and eloquence function as instruments of persuasion and self-deception in Macbeth.',
    ],
  },
  {
    id: 'lear', file: 'lear.txt', title: 'King Lear', lang: 'en',
    questions: [
      'Analyze King Lear\'s treatment of justice, suffering, and whether the universe is governed by any moral order. Does the play\'s cruelty affirm nihilism, or does meaning survive within it?',
      'Examine the function of the fool and the marginal figure as sources of truth in King Lear.',
    ],
  },
  {
    id: 'othello', file: 'othello.txt', title: 'Othello', lang: 'en',
    questions: [
      'Examine the problem of Iago\'s motivation and what the play suggests about the sources of evil and the vulnerability of trust.',
      'Analyze how Iago wields language as a weapon to destroy Othello.',
    ],
  },
  {
    id: 'tempest', file: 'tempest.txt', title: 'The Tempest', lang: 'en',
    questions: [
      'Read The Tempest through power and its relinquishment: Prospero\'s control over the island, Ariel, and Caliban, and his final renunciation of his art. Endorsement of authority, critique of colonial domination, or ambiguous meditation on both?',
      'Analyze Prospero\'s control over Ariel and Caliban and what their servitude reveals about legitimate authority.',
    ],
  },
];
