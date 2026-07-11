#!/usr/bin/env python3
"""
Build the cross-linguistic polarity canon.

Emits:
  canon_pairs.jsonl        - parallel affirmative/negative minimal pairs
  canon_pairs.csv          - same, flat
  response_particles.csv   - yes/no answer-particle typology
  hard_cases.jsonl         - adversarial items that break naive polarity probes

Every translation is marked with a confidence tier. Tier C lines MUST be
checked by an L1 speaker before you train or evaluate on them.
"""
import json, csv, sys, unicodedata
from collections import defaultdict

# ---------------------------------------------------------------------------
# LANGUAGES
# conf: A = high, B = good, C = needs L1 review
# strat: how standard negation is realised
# ---------------------------------------------------------------------------
LANGS = {
 "en": dict(name="English",    family="IE/Germanic",   script="Latn", conf="A", strat="particle+do-support",   note="not/n't; no negative concord"),
 "es": dict(name="Spanish",    family="IE/Romance",    script="Latn", conf="A", strat="preverbal particle",    note="negative concord (no...nada)"),
 "fr": dict(name="French",     family="IE/Romance",    script="Latn", conf="A", strat="bipartite ne...pas",    note="ne-drop in speech; de of negation"),
 "pt": dict(name="Portuguese", family="IE/Romance",    script="Latn", conf="A", strat="preverbal particle",    note="answers by echoing the verb"),
 "de": dict(name="German",     family="IE/Germanic",   script="Latn", conf="A", strat="particle + kein",       note="nicht vs kein (negative determiner)"),
 "ru": dict(name="Russian",    family="IE/Slavic",     script="Cyrl", conf="A", strat="particle + net",        note="genitive of negation; multiple negation"),
 "pl": dict(name="Polish",     family="IE/Slavic",     script="Latn", conf="B", strat="particle nie",          note="strict negative concord; genitive object"),
 "el": dict(name="Greek",      family="IE/Hellenic",   script="Grek", conf="B", strat="den / min",             note="mood-conditioned negator"),
 "hi": dict(name="Hindi",      family="IE/Indo-Aryan", script="Deva", conf="B", strat="nahin / mat / na",      note="dedicated prohibitive mat"),
 "fa": dict(name="Persian",    family="IE/Iranian",    script="Arab", conf="B", strat="verbal prefix na-",     note="mi- -> nemi-; 3-form answers (chera)"),
 "ar": dict(name="Arabic MSA", family="Afro-Asiatic",  script="Arab", conf="B", strat="la/ma/lam/lan/laysa",   note="negator selected by TAM; bala contradicts a negative"),
 "he": dict(name="Hebrew",     family="Afro-Asiatic",  script="Hebr", conf="B", strat="lo / ein / al",         note="suppletive existential ein; prohibitive al"),
 "tr": dict(name="Turkish",    family="Turkic",        script="Latn", conf="B", strat="suffix -mA-",           note="degil (nominal), yok (existential), -eme- (impotential)"),
 "fi": dict(name="Finnish",    family="Uralic",        script="Latn", conf="B", strat="negative auxiliary verb", note="ei conjugates: en/et/ei/emme/ette/eivat; ala = neg imperative"),
 "hu": dict(name="Hungarian",  family="Uralic",        script="Latn", conf="B", strat="nem / ne",              note="suppletive nincs; 3-form answers (de igen)"),
 "zh": dict(name="Mandarin",   family="Sino-Tibetan",  script="Hans", conf="B", strat="bu / mei(you)",         note="aspect-conditioned; bie = prohibitive; no general yes-word"),
 "ja": dict(name="Japanese",   family="Japonic",       script="Jpan", conf="B", strat="suffix -nai",           note="suppletive nai (exist.); truth-based hai/iie"),
 "ko": dict(name="Korean",     family="Koreanic",      script="Kore", conf="B", strat="an- / -ji anh- / mot",  note="eopda (exist.), anida (copula); truth-based ne/aniyo"),
 "vi": dict(name="Vietnamese", family="Austroasiatic", script="Latn", conf="C", strat="khong",                 note="chua = not yet; dung = prohibitive; khong phai = nominal"),
 "id": dict(name="Indonesian", family="Austronesian",  script="Latn", conf="B", strat="tidak / bukan",         note="bukan for nominals, belum = not yet, jangan = prohibitive"),
 "sw": dict(name="Swahili",    family="Niger-Congo",   script="Latn", conf="C", strat="negative verb morphology", note="ha-/si- prefixes, -ku- neg past, -ja- not-yet, si = neg copula"),
 "ta": dict(name="Tamil",      family="Dravidian",     script="Taml", conf="C", strat="illai / alla",          note="illai (verbal/existential) vs alla (nominal)"),
 "ga": dict(name="Irish",      family="IE/Celtic",     script="Latn", conf="C", strat="ni / nil / nior / na",  note="no words for yes/no at all; answers echo the verb"),
 "ka": dict(name="Georgian",   family="Kartvelian",    script="Geor", conf="C", strat="ar / ver / nu",         note="ver = negation of ability; nu = prohibitive"),
}

# ---------------------------------------------------------------------------
# FRAMES: the proposition spec. Same proposition, polarity is the only variable.
# All frames are chosen to be sentiment-neutral so the axis does not collapse
# into a valence axis.
# ---------------------------------------------------------------------------
FRAMES = {
 "F01": dict(type="copular_adjectival", probe="predicate adjective negation",
             why="baseline; cleanest minimal pair"),
 "F02": dict(type="existential", probe="negative existential",
             why="triggers suppletive negatives: ein/yok/nincs/nai/eopda/hakuna/illai"),
 "F03": dict(type="possessive", probe="have-negation",
             why="possession is often existential; Swahili nina/sina, Russian genitive"),
 "F04": dict(type="dynamic_habitual", probe="standard negation, imperfective",
             why="Mandarin bu, Arabic la, Turkish -mez"),
 "F05": dict(type="past_perfective", probe="standard negation, perfective",
             why="Arabic lam, Mandarin mei, Swahili -ku-, Irish nior, Finnish participle"),
 "F06": dict(type="future", probe="standard negation, prospective",
             why="Arabic lan; Tamil negative future -matt-"),
 "F07": dict(type="nominal_predicate", probe="negation of an NP predicate",
             why="THE discriminating frame: bukan/alla/degil/anida/si/laysa/bu shi"),
 "F08": dict(type="ability", probe="negated potential",
             why="Turkish -eme-, Korean mot, Georgian ver: inability is its own morpheme"),
 "F09": dict(type="prohibitive", probe="negative imperative",
             why="proves negation is not one morpheme: min/mat/al/ala/ne/bie/dung/jangan/na/nu"),
 "F10": dict(type="negative_indefinite_subj", probe="n-word in subject position",
             why="negative concord vs single negation"),
 "F11": dict(type="not_yet", probe="aspectual negation",
             why="belum/chua/mei...ne/-ja-: 'not yet' is lexically distinct from 'not'"),
 "F12": dict(type="negative_indefinite_obj", probe="n-word in object position",
             why="object-position concord; Russian/Polish case shift under negation"),
}

# ---------------------------------------------------------------------------
# DATA: frame -> lang -> [affirmative, negative, negation exponent]
# ---------------------------------------------------------------------------
D = {
"F01": {  # The door is open.
 "en": ["The door is open.", "The door is not open.", "not"],
 "es": ["La puerta está abierta.", "La puerta no está abierta.", "no"],
 "fr": ["La porte est ouverte.", "La porte n'est pas ouverte.", "ne...pas"],
 "pt": ["A porta está aberta.", "A porta não está aberta.", "não"],
 "de": ["Die Tür ist offen.", "Die Tür ist nicht offen.", "nicht"],
 "ru": ["Дверь открыта.", "Дверь не открыта.", "не"],
 "pl": ["Drzwi są otwarte.", "Drzwi nie są otwarte.", "nie"],
 "el": ["Η πόρτα είναι ανοιχτή.", "Η πόρτα δεν είναι ανοιχτή.", "δεν"],
 "hi": ["दरवाज़ा खुला है।", "दरवाज़ा खुला नहीं है।", "नहीं"],
 "fa": ["در باز است.", "در باز نیست.", "نیست"],
 "ar": ["الباب مفتوح.", "الباب ليس مفتوحًا.", "ليس"],
 "he": ["הדלת פתוחה.", "הדלת לא פתוחה.", "לא"],
 "tr": ["Kapı açık.", "Kapı açık değil.", "değil"],
 "fi": ["Ovi on auki.", "Ovi ei ole auki.", "ei"],
 "hu": ["Az ajtó nyitva van.", "Az ajtó nincs nyitva.", "nincs"],
 "zh": ["门开着。", "门没开着。", "没"],
 "ja": ["ドアは開いている。", "ドアは開いていない。", "-ない"],
 "ko": ["문이 열려 있다.", "문이 열려 있지 않다.", "-지 않다"],
 "vi": ["Cửa đang mở.", "Cửa không mở.", "không"],
 "id": ["Pintu itu terbuka.", "Pintu itu tidak terbuka.", "tidak"],
 "sw": ["Mlango uko wazi.", "Mlango hauko wazi.", "hau-"],
 "ta": ["கதவு திறந்திருக்கிறது.", "கதவு திறந்திருக்கவில்லை.", "இல்லை"],
 "ga": ["Tá an doras oscailte.", "Níl an doras oscailte.", "níl"],
 "ka": ["კარი ღიაა.", "კარი ღია არ არის.", "არ"],
},
"F02": {  # There is water in the glass.
 "en": ["There is water in the glass.", "There is no water in the glass.", "no"],
 "es": ["Hay agua en el vaso.", "No hay agua en el vaso.", "no"],
 "fr": ["Il y a de l'eau dans le verre.", "Il n'y a pas d'eau dans le verre.", "ne...pas + de"],
 "pt": ["Há água no copo.", "Não há água no copo.", "não"],
 "de": ["Es ist Wasser im Glas.", "Es ist kein Wasser im Glas.", "kein"],
 "ru": ["В стакане есть вода.", "В стакане нет воды.", "нет + GEN"],
 "pl": ["W szklance jest woda.", "W szklance nie ma wody.", "nie ma + GEN"],
 "el": ["Υπάρχει νερό στο ποτήρι.", "Δεν υπάρχει νερό στο ποτήρι.", "δεν"],
 "hi": ["गिलास में पानी है।", "गिलास में पानी नहीं है।", "नहीं"],
 "fa": ["در لیوان آب هست.", "در لیوان آب نیست.", "نیست"],
 "ar": ["هناك ماء في الكوب.", "لا يوجد ماء في الكوب.", "لا يوجد"],
 "he": ["יש מים בכוס.", "אין מים בכוס.", "אין"],
 "tr": ["Bardakta su var.", "Bardakta su yok.", "yok"],
 "fi": ["Lasissa on vettä.", "Lasissa ei ole vettä.", "ei"],
 "hu": ["Van víz a pohárban.", "Nincs víz a pohárban.", "nincs"],
 "zh": ["杯子里有水。", "杯子里没有水。", "没有"],
 "ja": ["コップに水がある。", "コップに水がない。", "ない"],
 "ko": ["컵에 물이 있다.", "컵에 물이 없다.", "없다"],
 "vi": ["Trong cốc có nước.", "Trong cốc không có nước.", "không có"],
 "id": ["Ada air di gelas.", "Tidak ada air di gelas.", "tidak ada"],
 "sw": ["Kuna maji kwenye glasi.", "Hakuna maji kwenye glasi.", "hakuna"],
 "ta": ["கண்ணாடியில் தண்ணீர் இருக்கிறது.", "கண்ணாடியில் தண்ணீர் இல்லை.", "இல்லை"],
 "ga": ["Tá uisce sa ghloine.", "Níl uisce sa ghloine.", "níl"],
 "ka": ["ჭიქაში წყალია.", "ჭიქაში წყალი არ არის.", "არ"],
},
"F03": {  # I have a key.
 "en": ["I have a key.", "I do not have a key.", "not"],
 "es": ["Tengo una llave.", "No tengo llave.", "no"],
 "fr": ["J'ai une clé.", "Je n'ai pas de clé.", "ne...pas + de"],
 "pt": ["Tenho uma chave.", "Não tenho chave.", "não"],
 "de": ["Ich habe einen Schlüssel.", "Ich habe keinen Schlüssel.", "kein"],
 "ru": ["У меня есть ключ.", "У меня нет ключа.", "нет + GEN"],
 "pl": ["Mam klucz.", "Nie mam klucza.", "nie + GEN"],
 "el": ["Έχω ένα κλειδί.", "Δεν έχω κλειδί.", "δεν"],
 "hi": ["मेरे पास एक चाबी है।", "मेरे पास चाबी नहीं है।", "नहीं"],
 "fa": ["من یک کلید دارم.", "من کلید ندارم.", "ن-"],
 "ar": ["عندي مفتاح.", "ليس عندي مفتاح.", "ليس"],
 "he": ["יש לי מפתח.", "אין לי מפתח.", "אין"],
 "tr": ["Bir anahtarım var.", "Anahtarım yok.", "yok"],
 "fi": ["Minulla on avain.", "Minulla ei ole avainta.", "ei"],
 "hu": ["Van kulcsom.", "Nincs kulcsom.", "nincs"],
 "zh": ["我有一把钥匙。", "我没有钥匙。", "没有"],
 "ja": ["鍵を持っている。", "鍵を持っていない。", "-ない"],
 "ko": ["나는 열쇠가 있다.", "나는 열쇠가 없다.", "없다"],
 "vi": ["Tôi có một chiếc chìa khóa.", "Tôi không có chìa khóa.", "không"],
 "id": ["Saya punya kunci.", "Saya tidak punya kunci.", "tidak"],
 "sw": ["Nina ufunguo.", "Sina ufunguo.", "si-"],
 "ta": ["என்னிடம் சாவி இருக்கிறது.", "என்னிடம் சாவி இல்லை.", "இல்லை"],
 "ga": ["Tá eochair agam.", "Níl eochair agam.", "níl"],
 "ka": ["მე მაქვს გასაღები.", "მე არ მაქვს გასაღები.", "არ"],
},
"F04": {  # She drinks coffee.
 "en": ["She drinks coffee.", "She does not drink coffee.", "not (do-support)"],
 "es": ["Ella bebe café.", "Ella no bebe café.", "no"],
 "fr": ["Elle boit du café.", "Elle ne boit pas de café.", "ne...pas + de"],
 "pt": ["Ela bebe café.", "Ela não bebe café.", "não"],
 "de": ["Sie trinkt Kaffee.", "Sie trinkt keinen Kaffee.", "kein"],
 "ru": ["Она пьёт кофе.", "Она не пьёт кофе.", "не"],
 "pl": ["Ona pije kawę.", "Ona nie pije kawy.", "nie + GEN"],
 "el": ["Πίνει καφέ.", "Δεν πίνει καφέ.", "δεν"],
 "hi": ["वह कॉफ़ी पीती है।", "वह कॉफ़ी नहीं पीती।", "नहीं"],
 "fa": ["او قهوه می‌نوشد.", "او قهوه نمی‌نوشد.", "نمی-"],
 "ar": ["هي تشرب القهوة.", "هي لا تشرب القهوة.", "لا"],
 "he": ["היא שותה קפה.", "היא לא שותה קפה.", "לא"],
 "tr": ["O kahve içer.", "O kahve içmez.", "-mez"],
 "fi": ["Hän juo kahvia.", "Hän ei juo kahvia.", "ei"],
 "hu": ["Ő kávét iszik.", "Ő nem iszik kávét.", "nem"],
 "zh": ["她喝咖啡。", "她不喝咖啡。", "不"],
 "ja": ["彼女はコーヒーを飲む。", "彼女はコーヒーを飲まない。", "-ない"],
 "ko": ["그녀는 커피를 마신다.", "그녀는 커피를 마시지 않는다.", "-지 않다"],
 "vi": ["Cô ấy uống cà phê.", "Cô ấy không uống cà phê.", "không"],
 "id": ["Dia minum kopi.", "Dia tidak minum kopi.", "tidak"],
 "sw": ["Anakunywa kahawa.", "Hanywi kahawa.", "ha- ... -i"],
 "ta": ["அவள் காபி குடிக்கிறாள்.", "அவள் காபி குடிப்பதில்லை.", "-இல்லை"],
 "ga": ["Ólann sí caife.", "Ní ólann sí caife.", "ní"],
 "ka": ["ის ყავას სვამს.", "ის ყავას არ სვამს.", "არ"],
},
"F05": {  # He arrived yesterday.
 "en": ["He arrived yesterday.", "He did not arrive yesterday.", "not (do-support)"],
 "es": ["Llegó ayer.", "No llegó ayer.", "no"],
 "fr": ["Il est arrivé hier.", "Il n'est pas arrivé hier.", "ne...pas"],
 "pt": ["Ele chegou ontem.", "Ele não chegou ontem.", "não"],
 "de": ["Er ist gestern angekommen.", "Er ist gestern nicht angekommen.", "nicht"],
 "ru": ["Он приехал вчера.", "Он не приехал вчера.", "не"],
 "pl": ["Przyjechał wczoraj.", "Nie przyjechał wczoraj.", "nie"],
 "el": ["Έφτασε χθες.", "Δεν έφτασε χθες.", "δεν"],
 "hi": ["वह कल आया।", "वह कल नहीं आया।", "नहीं"],
 "fa": ["او دیروز رسید.", "او دیروز نرسید.", "ن-"],
 "ar": ["وصل أمس.", "لم يصل أمس.", "لم + jussive"],
 "he": ["הוא הגיע אתמול.", "הוא לא הגיע אתמול.", "לא"],
 "tr": ["Dün geldi.", "Dün gelmedi.", "-me-"],
 "fi": ["Hän saapui eilen.", "Hän ei saapunut eilen.", "ei + past ptcp"],
 "hu": ["Tegnap megérkezett.", "Tegnap nem érkezett meg.", "nem (+ preverb split)"],
 "zh": ["他昨天到了。", "他昨天没到。", "没 (le drops)"],
 "ja": ["彼は昨日着いた。", "彼は昨日着かなかった。", "-なかった"],
 "ko": ["그는 어제 도착했다.", "그는 어제 도착하지 않았다.", "-지 않았다"],
 "vi": ["Anh ấy đã đến hôm qua.", "Anh ấy đã không đến hôm qua.", "không"],
 "id": ["Dia tiba kemarin.", "Dia tidak tiba kemarin.", "tidak"],
 "sw": ["Alifika jana.", "Hakufika jana.", "ha- + -ku-"],
 "ta": ["அவன் நேற்று வந்தான்.", "அவன் நேற்று வரவில்லை.", "-வில்லை"],
 "ga": ["Tháinig sé inné.", "Níor tháinig sé inné.", "níor (past)"],
 "ka": ["ის გუშინ ჩამოვიდა.", "ის გუშინ არ ჩამოვიდა.", "არ"],
},
"F06": {  # They will come tomorrow.
 "en": ["They will come tomorrow.", "They will not come tomorrow.", "not"],
 "es": ["Vendrán mañana.", "No vendrán mañana.", "no"],
 "fr": ["Ils viendront demain.", "Ils ne viendront pas demain.", "ne...pas"],
 "pt": ["Eles virão amanhã.", "Eles não virão amanhã.", "não"],
 "de": ["Sie werden morgen kommen.", "Sie werden morgen nicht kommen.", "nicht"],
 "ru": ["Они придут завтра.", "Они не придут завтра.", "не"],
 "pl": ["Przyjdą jutro.", "Nie przyjdą jutro.", "nie"],
 "el": ["Θα έρθουν αύριο.", "Δεν θα έρθουν αύριο.", "δεν"],
 "hi": ["वे कल आएंगे।", "वे कल नहीं आएंगे।", "नहीं"],
 "fa": ["آنها فردا می‌آیند.", "آنها فردا نمی‌آیند.", "نمی-"],
 "ar": ["سيأتون غدًا.", "لن يأتوا غدًا.", "لن + subjunctive"],
 "he": ["הם יבואו מחר.", "הם לא יבואו מחר.", "לא"],
 "tr": ["Yarın gelecekler.", "Yarın gelmeyecekler.", "-me-"],
 "fi": ["He tulevat huomenna.", "He eivät tule huomenna.", "eivät (3PL)"],
 "hu": ["Holnap jönnek.", "Holnap nem jönnek.", "nem"],
 "zh": ["他们明天来。", "他们明天不来。", "不"],
 "ja": ["彼らは明日来る。", "彼らは明日来ない。", "-ない"],
 "ko": ["그들은 내일 온다.", "그들은 내일 오지 않는다.", "-지 않다"],
 "vi": ["Họ sẽ đến vào ngày mai.", "Họ sẽ không đến vào ngày mai.", "không"],
 "id": ["Mereka akan datang besok.", "Mereka tidak akan datang besok.", "tidak"],
 "sw": ["Watakuja kesho.", "Hawatakuja kesho.", "hawa- + -ta-"],
 "ta": ["அவர்கள் நாளை வருவார்கள்.", "அவர்கள் நாளை வரமாட்டார்கள்.", "-மாட்ட-"],
 "ga": ["Tiocfaidh siad amárach.", "Ní thiocfaidh siad amárach.", "ní + lenition"],
 "ka": ["ისინი ხვალ მოვლენ.", "ისინი ხვალ არ მოვლენ.", "არ"],
},
"F07": {  # This is a book.  <-- the discriminating frame
 "en": ["This is a book.", "This is not a book.", "not"],
 "es": ["Esto es un libro.", "Esto no es un libro.", "no"],
 "fr": ["Ceci est un livre.", "Ceci n'est pas un livre.", "ne...pas"],
 "pt": ["Isto é um livro.", "Isto não é um livro.", "não"],
 "de": ["Das ist ein Buch.", "Das ist kein Buch.", "kein"],
 "ru": ["Это книга.", "Это не книга.", "не"],
 "pl": ["To jest książka.", "To nie jest książka.", "nie"],
 "el": ["Αυτό είναι ένα βιβλίο.", "Αυτό δεν είναι βιβλίο.", "δεν"],
 "hi": ["यह एक किताब है।", "यह किताब नहीं है।", "नहीं"],
 "fa": ["این یک کتاب است.", "این کتاب نیست.", "نیست"],
 "ar": ["هذا كتاب.", "ليس هذا كتابًا.", "ليس (neg. copula)"],
 "he": ["זה ספר.", "זה לא ספר.", "לא"],
 "tr": ["Bu bir kitap.", "Bu bir kitap değil.", "değil (nominal only)"],
 "fi": ["Tämä on kirja.", "Tämä ei ole kirja.", "ei"],
 "hu": ["Ez egy könyv.", "Ez nem könyv.", "nem"],
 "zh": ["这是一本书。", "这不是一本书。", "不是 (never 没是)"],
 "ja": ["これは本だ。", "これは本ではない。", "ではない"],
 "ko": ["이것은 책이다.", "이것은 책이 아니다.", "아니다 (suppletive)"],
 "vi": ["Đây là một quyển sách.", "Đây không phải là một quyển sách.", "không phải"],
 "id": ["Ini buku.", "Ini bukan buku.", "bukan (never tidak)"],
 "sw": ["Hiki ni kitabu.", "Hiki si kitabu.", "si (neg. copula)"],
 "ta": ["இது ஒரு புத்தகம்.", "இது புத்தகம் அல்ல.", "அல்ல (never இல்லை)"],
 "ga": ["Is leabhar é seo.", "Ní leabhar é seo.", "ní (copula)"],
 "ka": ["ეს წიგნია.", "ეს წიგნი არ არის.", "არ"],
},
"F08": {  # I can swim.
 "en": ["I can swim.", "I cannot swim.", "not"],
 "es": ["Sé nadar.", "No sé nadar.", "no"],
 "fr": ["Je sais nager.", "Je ne sais pas nager.", "ne...pas"],
 "pt": ["Sei nadar.", "Não sei nadar.", "não"],
 "de": ["Ich kann schwimmen.", "Ich kann nicht schwimmen.", "nicht"],
 "ru": ["Я умею плавать.", "Я не умею плавать.", "не"],
 "pl": ["Umiem pływać.", "Nie umiem pływać.", "nie"],
 "el": ["Ξέρω να κολυμπάω.", "Δεν ξέρω να κολυμπάω.", "δεν"],
 "hi": ["मैं तैर सकता हूँ।", "मैं तैर नहीं सकता।", "नहीं"],
 "fa": ["من می‌توانم شنا کنم.", "من نمی‌توانم شنا کنم.", "نمی-"],
 "ar": ["أستطيع السباحة.", "لا أستطيع السباحة.", "لا"],
 "he": ["אני יודע לשחות.", "אני לא יודע לשחות.", "לא"],
 "tr": ["Yüzebilirim.", "Yüzemem.", "-eme- (impotential)"],
 "fi": ["Osaan uida.", "En osaa uida.", "en (1SG)"],
 "hu": ["Tudok úszni.", "Nem tudok úszni.", "nem"],
 "zh": ["我会游泳。", "我不会游泳。", "不"],
 "ja": ["私は泳げる。", "私は泳げない。", "-ない"],
 "ko": ["나는 수영할 수 있다.", "나는 수영을 못 한다.", "못 (inability)"],
 "vi": ["Tôi biết bơi.", "Tôi không biết bơi.", "không"],
 "id": ["Saya bisa berenang.", "Saya tidak bisa berenang.", "tidak"],
 "sw": ["Ninaweza kuogelea.", "Siwezi kuogelea.", "si-"],
 "ta": ["எனக்கு நீச்சல் தெரியும்.", "எனக்கு நீச்சல் தெரியாது.", "-ஆது"],
 "ga": ["Tá snámh agam.", "Níl snámh agam.", "níl"],
 "ka": ["მე შემიძლია ცურვა.", "მე ვერ ვცურავ.", "ვერ (inability)"],
},
"F09": {  # Open the window. -> prohibitive
 "en": ["Open the window.", "Do not open the window.", "not"],
 "es": ["Abre la ventana.", "No abras la ventana.", "no + subjunctive"],
 "fr": ["Ouvre la fenêtre.", "N'ouvre pas la fenêtre.", "ne...pas"],
 "pt": ["Abre a janela.", "Não abras a janela.", "não + subjunctive"],
 "de": ["Öffne das Fenster.", "Öffne das Fenster nicht.", "nicht"],
 "ru": ["Открой окно.", "Не открывай окно.", "не + imperfective"],
 "pl": ["Otwórz okno.", "Nie otwieraj okna.", "nie + imperfective + GEN"],
 "el": ["Άνοιξε το παράθυρο.", "Μην ανοίγεις το παράθυρο.", "μην (not δεν)"],
 "hi": ["खिड़की खोलो।", "खिड़की मत खोलो।", "मत (not नहीं)"],
 "fa": ["پنجره را باز کن.", "پنجره را باز نکن.", "ن-"],
 "ar": ["افتح النافذة.", "لا تفتح النافذة.", "لا + jussive"],
 "he": ["פתח את החלון.", "אל תפתח את החלון.", "אל (not לא)"],
 "tr": ["Pencereyi aç.", "Pencereyi açma.", "-ma"],
 "fi": ["Avaa ikkuna.", "Älä avaa ikkunaa.", "älä (neg. imperative verb)"],
 "hu": ["Nyisd ki az ablakot.", "Ne nyisd ki az ablakot.", "ne (not nem)"],
 "zh": ["打开窗户。", "别打开窗户。", "别 (not 不)"],
 "ja": ["窓を開けて。", "窓を開けないで。", "-ないで"],
 "ko": ["창문을 열어라.", "창문을 열지 마라.", "-지 마라"],
 "vi": ["Hãy mở cửa sổ.", "Đừng mở cửa sổ.", "đừng (not không)"],
 "id": ["Buka jendelanya.", "Jangan buka jendelanya.", "jangan (not tidak)"],
 "sw": ["Fungua dirisha.", "Usifungue dirisha.", "u-si-"],
 "ta": ["ஜன்னலைத் திற.", "ஜன்னலைத் திறக்காதே.", "-ஆதே"],
 "ga": ["Oscail an fhuinneog.", "Ná hoscail an fhuinneog.", "ná (not ní)"],
 "ka": ["გააღე ფანჯარა.", "ნუ გააღებ ფანჯარას.", "ნუ (not არ)"],
},
"F10": {  # Someone is in the room.
 "en": ["Someone is in the room.", "No one is in the room.", "no one"],
 "es": ["Alguien está en la habitación.", "No hay nadie en la habitación.", "no...nadie (concord)"],
 "fr": ["Quelqu'un est dans la pièce.", "Il n'y a personne dans la pièce.", "ne...personne"],
 "pt": ["Alguém está na sala.", "Não está ninguém na sala.", "não...ninguém"],
 "de": ["Jemand ist im Zimmer.", "Niemand ist im Zimmer.", "niemand (no concord)"],
 "ru": ["Кто-то в комнате.", "В комнате никого нет.", "никого + нет (concord)"],
 "pl": ["Ktoś jest w pokoju.", "Nikogo nie ma w pokoju.", "nikogo nie (concord)"],
 "el": ["Κάποιος είναι στο δωμάτιο.", "Δεν είναι κανείς στο δωμάτιο.", "δεν...κανείς"],
 "hi": ["कमरे में कोई है।", "कमरे में कोई नहीं है।", "कोई नहीं"],
 "fa": ["کسی در اتاق است.", "کسی در اتاق نیست.", "کسی...نیست"],
 "ar": ["هناك أحد في الغرفة.", "لا أحد في الغرفة.", "لا أحد"],
 "he": ["מישהו נמצא בחדר.", "אף אחד לא נמצא בחדר.", "אף אחד לא (concord)"],
 "tr": ["Odada biri var.", "Odada kimse yok.", "kimse yok"],
 "fi": ["Huoneessa on joku.", "Huoneessa ei ole ketään.", "ei...ketään"],
 "hu": ["Van valaki a szobában.", "Nincs senki a szobában.", "nincs senki (concord)"],
 "zh": ["房间里有人。", "房间里没有人。", "没有人"],
 "ja": ["部屋に誰かいる。", "部屋に誰もいない。", "誰も...ない"],
 "ko": ["방에 누군가 있다.", "방에 아무도 없다.", "아무도 없다"],
 "vi": ["Có ai đó trong phòng.", "Không có ai trong phòng.", "không có ai"],
 "id": ["Ada seseorang di kamar.", "Tidak ada siapa pun di kamar.", "tidak ada siapa pun"],
 "sw": ["Kuna mtu chumbani.", "Hakuna mtu chumbani.", "hakuna"],
 "ta": ["அறையில் யாரோ இருக்கிறார்கள்.", "அறையில் யாரும் இல்லை.", "யாரும் இல்லை"],
 "ga": ["Tá duine éigin sa seomra.", "Níl aon duine sa seomra.", "níl aon"],
 "ka": ["ოთახში ვიღაც არის.", "ოთახში არავინ არის.", "არავინ"],
},
"F11": {  # He has already eaten. -> not yet
 "en": ["He has already eaten.", "He has not eaten yet.", "not...yet"],
 "es": ["Ya ha comido.", "Todavía no ha comido.", "todavía no"],
 "fr": ["Il a déjà mangé.", "Il n'a pas encore mangé.", "ne...pas encore"],
 "pt": ["Ele já comeu.", "Ele ainda não comeu.", "ainda não"],
 "de": ["Er hat schon gegessen.", "Er hat noch nicht gegessen.", "noch nicht"],
 "ru": ["Он уже поел.", "Он ещё не поел.", "ещё не"],
 "pl": ["On już zjadł.", "On jeszcze nie zjadł.", "jeszcze nie"],
 "el": ["Έχει ήδη φάει.", "Δεν έχει φάει ακόμα.", "δεν...ακόμα"],
 "hi": ["वह खा चुका है।", "उसने अभी तक नहीं खाया।", "अभी तक नहीं"],
 "fa": ["او قبلاً غذا خورده است.", "او هنوز غذا نخورده است.", "هنوز ن-"],
 "ar": ["لقد أكل بالفعل.", "لم يأكل بعد.", "لم...بعد"],
 "he": ["הוא כבר אכל.", "הוא עדיין לא אכל.", "עדיין לא"],
 "tr": ["Zaten yedi.", "Henüz yemedi.", "henüz -me-"],
 "fi": ["Hän on jo syönyt.", "Hän ei ole vielä syönyt.", "ei...vielä"],
 "hu": ["Már evett.", "Még nem evett.", "még nem"],
 "zh": ["他已经吃了。", "他还没吃。", "还没 (never 还不)"],
 "ja": ["彼はもう食べた。", "彼はまだ食べていない。", "まだ...ていない"],
 "ko": ["그는 이미 먹었다.", "그는 아직 먹지 않았다.", "아직...않다"],
 "vi": ["Anh ấy đã ăn rồi.", "Anh ấy chưa ăn.", "chưa (LEXICALLY ≠ không)"],
 "id": ["Dia sudah makan.", "Dia belum makan.", "belum (LEXICALLY ≠ tidak)"],
 "sw": ["Amekwisha kula.", "Bado hajala.", "ha- + -ja- (not-yet tense)"],
 "ta": ["அவன் ஏற்கனவே சாப்பிட்டான்.", "அவன் இன்னும் சாப்பிடவில்லை.", "இன்னும்...இல்லை"],
 "ga": ["Tá sé tar éis ithe cheana.", "Níl sé tar éis ithe fós.", "níl...fós"],
 "ka": ["მან უკვე ჭამა.", "მას ჯერ არ უჭამია.", "ჯერ არ"],
},
"F12": {  # I saw something.
 "en": ["I saw something.", "I saw nothing.", "nothing"],
 "es": ["Vi algo.", "No vi nada.", "no...nada (concord)"],
 "fr": ["J'ai vu quelque chose.", "Je n'ai rien vu.", "ne...rien"],
 "pt": ["Vi alguma coisa.", "Não vi nada.", "não...nada"],
 "de": ["Ich habe etwas gesehen.", "Ich habe nichts gesehen.", "nichts"],
 "ru": ["Я что-то видел.", "Я ничего не видел.", "ничего не (concord + GEN)"],
 "pl": ["Widziałem coś.", "Nie widziałem niczego.", "nie...niczego"],
 "el": ["Είδα κάτι.", "Δεν είδα τίποτα.", "δεν...τίποτα"],
 "hi": ["मैंने कुछ देखा।", "मैंने कुछ नहीं देखा।", "कुछ नहीं"],
 "fa": ["من چیزی دیدم.", "من چیزی ندیدم.", "چیزی ن-"],
 "ar": ["رأيت شيئًا.", "لم أر شيئًا.", "لم...شيئًا"],
 "he": ["ראיתי משהו.", "לא ראיתי כלום.", "לא...כלום"],
 "tr": ["Bir şey gördüm.", "Hiçbir şey görmedim.", "hiçbir şey -me-"],
 "fi": ["Näin jotain.", "En nähnyt mitään.", "en...mitään"],
 "hu": ["Láttam valamit.", "Nem láttam semmit.", "nem...semmit (concord)"],
 "zh": ["我看到了什么。", "我什么也没看到。", "什么也没"],
 "ja": ["何かを見た。", "何も見なかった。", "何も...なかった"],
 "ko": ["나는 무언가를 보았다.", "나는 아무것도 보지 못했다.", "아무것도...못"],
 "vi": ["Tôi đã thấy một cái gì đó.", "Tôi không thấy gì cả.", "không...gì cả"],
 "id": ["Saya melihat sesuatu.", "Saya tidak melihat apa pun.", "tidak...apa pun"],
 "sw": ["Niliona kitu.", "Sikuona kitu chochote.", "si- + -ku-"],
 "ta": ["நான் எதையோ பார்த்தேன்.", "நான் எதுவும் பார்க்கவில்லை.", "எதுவும்...இல்லை"],
 "ga": ["Chonaic mé rud éigin.", "Ní fhaca mé aon rud.", "ní (suppletive fhaca)"],
 "ka": ["მე რაღაც ვნახე.", "მე არაფერი ვნახე.", "არაფერი"],
},
}

# ---------------------------------------------------------------------------
# RESPONSE PARTICLES: the actual "yes" / "no".
# system:
#   polarity  = YES affirms the positive proposition (English, Spanish)
#   truth     = YES affirms the questioner's utterance, negative or not (Japanese)
#   3-form    = extra particle to contradict a negative question (French si)
#   echo      = no general yes/no word; the answer repeats the verb (Irish, Mandarin)
# The 'neg_q' column is the answer to a NEGATIVE question "You don't smoke?"
# when the responder in fact does not smoke. This is where a naive
# English-anchored yes/no axis inverts.
# ---------------------------------------------------------------------------
PARTICLES = [
 # lang, yes, no, contradict-a-negative, system, note
 ("en","yes","no","(yes)","polarity","'Yes' would confusingly affirm; English speakers hedge"),
 ("es","sí","no","sí","polarity","sí can contradict a negative"),
 ("fr","oui","non","si","3-form/polarity","si is the dedicated contradiction particle"),
 ("it","sì","no","sì","polarity",""),
 ("pt","sim","não","—","echo/polarity","preferred answer echoes the verb: 'Vais?' -> 'Vou.'"),
 ("ca","sí","no","sí","polarity",""),
 ("ro","da","nu","ba da","3-form/polarity","ba da contradicts"),
 ("de","ja","nein","doch","3-form/polarity","doch is the dedicated contradiction particle"),
 ("nl","ja","nee","jawel","3-form/polarity",""),
 ("sv","ja","nej","jo","3-form/polarity",""),
 ("no","ja","nei","jo","3-form/polarity",""),
 ("da","ja","nej","jo","3-form/polarity",""),
 ("is","já","nei","jú","3-form/polarity",""),
 ("ru","да","нет","нет","polarity/mixed","'Да, не курю' is idiomatic: da can precede a negative"),
 ("pl","tak","nie","—","polarity",""),
 ("cs","ano","ne","—","polarity",""),
 ("uk","так","ні","—","polarity",""),
 ("el","ναι","όχι","—","polarity",""),
 ("hi","हाँ","नहीं","—","polarity/mixed","",),
 ("bn","হ্যাঁ","না","—","polarity",""),
 ("fa","بله","نه","چرا","3-form/polarity","چرا (cherā) = 'yes, on the contrary'"),
 ("ar","نعم","لا","بلى","3-form/polarity","بلى (balā) contradicts a negative question"),
 ("he","כן","לא","—","polarity",""),
 ("tr","evet","hayır","—","polarity",""),
 ("fi","kyllä","ei","kyllä","echo/polarity","ei is a CONJUGATED VERB; natural answer echoes the verb"),
 ("et","jah","ei","—","echo/polarity",""),
 ("hu","igen","nem","de igen","3-form/polarity","'de igen' contradicts"),
 ("zh","是/对/嗯","不/不是","—","echo","no general yes-word; you repeat the verb: 去 / 不去"),
 ("yue","係","唔係","—","echo",""),
 ("ja","はい","いいえ","いいえ","TRUTH-BASED","'You don't smoke?' -> はい = 'correct, I don't'"),
 ("ko","네","아니요","아니요","TRUTH-BASED","네 confirms the questioner, including a negative one"),
 ("vi","vâng/dạ","không","—","truth/echo","không is also the yes-no question particle"),
 ("th","ใช่","ไม่","—","echo","polite particles carry most of the work; verb echo is normal"),
 ("id","ya","tidak/bukan","—","polarity","negative answer must match predicate type"),
 ("tl","oo","hindi","—","polarity","wala = 'none/there isn't'"),
 ("sw","ndiyo","hapana","—","polarity",""),
 ("yo","bẹ́ẹ̀ni","bẹ́ẹ̀kọ́","—","polarity",""),
 ("am","አዎ","አይደለም","—","polarity",""),
 ("ta","ஆமாம்","இல்லை","—","echo/polarity","illai doubles as the negative existential"),
 ("te","అవును","కాదు","—","polarity",""),
 ("ga","—","—","—","ECHO ONLY","Irish has NO word for yes or no. 'An bhfuil?' -> 'Tá.' / 'Níl.'"),
 ("cy","ie","nage","—","ECHO ONLY","ie/nage are marginal; you answer 'Ydw' / 'Nac ydw'"),
 ("gd","—","—","—","ECHO ONLY",""),
 ("la","ita/sic","minime/non","—","ECHO ONLY","classical Latin answers by repeating the verb"),
 ("eu","bai","ez","—","polarity",""),
 ("ka","დიახ/ki","არა","—","polarity",""),
 ("hy","այո","ոչ","—","polarity",""),
 ("sq","po","jo","—","polarity",""),
 ("mt","iva","le","—","polarity",""),
 ("mi","āe","kāo","—","polarity",""),
]

# ---------------------------------------------------------------------------
# HARD CASES: what actually breaks a polarity axis.
# label: 1 = the proposition is asserted (affirmative / "yes")
#        0 = the proposition is denied (negative / "no")
#        ? = deliberately underdetermined; use as a distractor, never as training signal
# ---------------------------------------------------------------------------
HARD = [
 # --- lexical antonym is NOT negation (must not load on the axis) ---
 ("HC01","antonym_not_negation","en","The door is closed.","1","Antonym of 'open', but an AFFIRMATIVE assertion. A valence-confounded axis scores this as 'no'."),
 ("HC02","antonym_not_negation","en","The door is not closed.","0","Negation of an antonym. Truth-conditionally ≈ HC-open, but the polarity marker is present."),
 ("HC03","antonym_not_negation","en","The task is impossible.","1","Affixal antonym. Affirmative assertion carrying a negative morpheme."),
 ("HC04","antonym_not_negation","en","The task is not possible.","0","Syntactic negation. Near-synonymous with HC03 but structurally opposite."),
 # --- double negation / litotes ---
 ("HC05","double_negation","en","It is not impossible.","1","Two negations, net affirmative — and weaker than plain 'possible'."),
 ("HC06","litotes","en","She is not unhappy.","1","Litotes. Net positive, hedged. Cosine-similar to 'She is unhappy'."),
 ("HC07","double_negation","en","I never said I didn't do it.","1","Stacked negation with scope interaction."),
 # --- negative concord: two markers, ONE negation ---
 ("HC08","negative_concord","es","No vi nada.","0","Two negative words, one negation. Token-counting probes read this as double."),
 ("HC09","negative_concord","ru","Я никогда никому ничего не говорил.","0","Four negative words, one negation."),
 ("HC10","negative_concord","he","אף אחד לא הגיע.","0","Obligatory concord: af echad + lo."),
 # --- non-negative downward-entailing contexts (look like 'no', aren't) ---
 ("HC11","downward_entailing","en","Few people attended.","1","Downward-entailing, licenses NPIs, but NOT negation."),
 ("HC12","downward_entailing","en","She rarely eats meat.","1","Adverbial quantifier, not sentential negation."),
 ("HC13","downward_entailing","en","He left without saying goodbye.","1","'without' is inherently negative but the clause is asserted."),
 ("HC14","downward_entailing","en","I doubt he will come.","1","Lexical negativity inside an affirmative matrix."),
 ("HC15","downward_entailing","en","He failed to submit the form.","0","Implicative verb: entails he did not submit. No negative morpheme at all."),
 # --- scope ---
 ("HC16","scope_ambiguity","en","All that glitters is not gold.","?","¬∀ vs ∀¬. Genuinely ambiguous; DO NOT use as a labelled example."),
 ("HC17","scope_ambiguity","en","I didn't come because I was tired.","?","Negation can scope over the verb or over the because-clause."),
 ("HC18","neg_raising","en","I don't think he will come.","0","Neg-raising: surface matrix negation, semantic complement negation."),
 ("HC19","neg_raising","en","I think he will not come.","0","Same meaning as HC18, different structure. Should sit at the same place on the axis."),
 # --- embedded / reported negation: whose negation is it? ---
 ("HC20","embedded_negation","en","He said the door is not open.","1","The speaker asserts a report. The negation belongs to the reported clause."),
 ("HC21","embedded_negation","en","It is false that the door is not open.","1","Negation under a falsity operator."),
 ("HC22","embedded_negation","en","She denied that she had signed the contract.","0","Negation carried by the matrix verb, not by a particle."),
 ("HC23","embedded_negation","en","The report does not say the permit was denied.","?","Two negations at different levels. Metalinguistic scope."),
 # --- questions vs assertions ---
 ("HC24","negative_question","en","Isn't the door open?","?","Negative polar question: biased toward the POSITIVE. Not an assertion."),
 ("HC25","negative_question","en","Is the door not open?","?","Same surface negation, different bias. Never label as 'no'."),
 ("HC26","tag_question","en","The door is open, isn't it?","1","Affirmative assertion with negative tag."),
 # --- metalinguistic / contrastive ---
 ("HC27","metalinguistic","en","He didn't walk — he ran.","1","Metalinguistic negation: the event happened, the description is corrected."),
 ("HC28","contrastive_focus","en","I didn't buy the RED car.","?","Focus-sensitive negation; scope depends on prosody, invisible in text."),
 # --- NPIs and licensing ---
 ("HC29","npi","en","I don't have any money.","0","'any' licensed by negation."),
 ("HC30","npi","en","If you have any questions, ask.","1","'any' licensed by a conditional, not negation."),
 # --- answer-particle traps: the CORE cross-lingual failure ---
 ("HC31","answer_particle","en","Q: You don't smoke? A: No. (= I don't smoke)","0","English NO agrees with the negative question."),
 ("HC32","answer_particle","ja","Q: たばこを吸わないんですか。 A: はい。(= 吸いません)","0","Japanese HAI on a negative question means 'correct, I don't'. Surface 'yes', semantic 'no'."),
 ("HC33","answer_particle","ko","Q: 담배 안 피우세요? A: 네. (= 안 피웁니다)","0","Same inversion as Japanese."),
 ("HC34","answer_particle","fr","Q: Tu ne fumes pas ? A: Si. (= je fume)","1","French SI: a 'yes' word that only exists to contradict a negative."),
 ("HC35","answer_particle","de","Q: Du rauchst nicht? A: Doch. (= ich rauche)","1","German DOCH, same function."),
 ("HC36","answer_particle","ar","Q: ألا تدخن؟ A: بلى. (= أدخن)","1","Arabic BALĀ contradicts the negative; NAʿAM would confirm it."),
 ("HC37","answer_particle","ga","Q: An bhfuil an doras oscailte? A: Níl.","0","Irish has no 'no'. The negative answer IS the negated verb."),
 ("HC38","answer_particle","zh","Q: 你去不去? A: 不去。","0","Mandarin has no general 'no'. The answer negates the echoed verb."),
 ("HC39","answer_particle","fi","Q: Tuletko? A: En.","0","Finnish 'en' is a first-person-singular NEGATIVE VERB, not a particle."),
 # --- aspectual 'not yet' is not 'not' ---
 ("HC40","not_yet","id","Dia belum makan.","0","'Not yet' — presupposes the event is still expected. ≠ 'tidak makan'."),
 ("HC41","not_yet","vi","Anh ấy chưa ăn.","0","chưa ≠ không. Different lexeme, different presupposition."),
 # --- inability is its own morpheme ---
 ("HC42","inability","ka","მე ვერ ვცურავ.","0","Georgian VER: negation of ability, distinct from plain AR."),
 ("HC43","inability","ko","나는 수영을 못 한다.","0","Korean 못: inability, distinct from 안."),
 # --- length / frequency confounds ---
 ("HC44","length_confound","en","The door, which had been painted last spring by the previous tenant, is open.","1","LONG affirmative. Guards against a probe that is really measuring length."),
 ("HC45","length_confound","en","Not open.","0","SHORT negative. Same guard, opposite direction."),
 # --- valence confound ---
 ("HC46","valence_confound","en","I do not like this restaurant.","0","Negative polarity AND negative sentiment. Aligned."),
 ("HC47","valence_confound","en","I do not dislike this restaurant.","0","Negative polarity, POSITIVE-ish sentiment. Anti-aligned — the key control."),
 ("HC48","valence_confound","en","This restaurant is terrible.","1","Affirmative polarity, negative sentiment. Anti-aligned."),
 # --- rhetorical / idiomatic ---
 ("HC49","rhetorical","en","Who doesn't love a good story?","1","Rhetorical negative question = strong affirmative."),
 ("HC50","expletive_negation","fr","J'ai peur qu'il ne vienne.","1","Expletive 'ne': a negative morpheme with NO negative meaning."),
]


def main():
    pairs = []
    for fid, langs in D.items():
        meta = FRAMES[fid]
        for lc, (aff, neg, exp) in langs.items():
            L = LANGS[lc]
            pairs.append(dict(
                pair_id=f"{fid}-{lc}",
                frame_id=fid,
                frame_type=meta["type"],
                frame_probe=meta["probe"],
                lang=lc,
                lang_name=L["name"],
                family=L["family"],
                script=L["script"],
                neg_strategy=L["strat"],
                affirmative=aff,
                negative=neg,
                neg_exponent=exp,
                confidence=L["conf"],
            ))

    # sanity checks
    errs = []
    for fid in FRAMES:
        missing = set(LANGS) - set(D.get(fid, {}))
        if missing:
            errs.append(f"{fid} missing langs: {sorted(missing)}")
    for p in pairs:
        if p["affirmative"] == p["negative"]:
            errs.append(f"{p['pair_id']}: aff == neg")
        if not p["affirmative"].strip() or not p["negative"].strip():
            errs.append(f"{p['pair_id']}: empty side")
    if errs:
        print("VALIDATION ERRORS:", file=sys.stderr)
        for e in errs:
            print("  " + e, file=sys.stderr)
        sys.exit(1)

    with open("canon_pairs.jsonl", "w", encoding="utf-8") as f:
        for p in pairs:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")

    with open("canon_pairs.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(pairs[0].keys()))
        w.writeheader()
        w.writerows(pairs)

    with open("response_particles.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["lang","yes","no","contradict_negative","answer_system","note"])
        w.writerows(PARTICLES)

    with open("hard_cases.jsonl", "w", encoding="utf-8") as f:
        for hid, cat, lc, text, label, why in HARD:
            f.write(json.dumps(dict(
                id=hid, category=cat, lang=lc, text=text,
                label=label, rationale=why), ensure_ascii=False) + "\n")

    langs_n = len(LANGS)
    print(f"frames:            {len(FRAMES)}")
    print(f"languages:         {langs_n}  (A={sum(1 for l in LANGS.values() if l['conf']=='A')}, "
          f"B={sum(1 for l in LANGS.values() if l['conf']=='B')}, "
          f"C={sum(1 for l in LANGS.values() if l['conf']=='C')})")
    print(f"minimal pairs:     {len(pairs)}")
    print(f"sentences:         {len(pairs)*2}")
    print(f"answer systems:    {len(PARTICLES)} languages")
    print(f"hard cases:        {len(HARD)}")
    fams = sorted({l['family'] for l in LANGS.values()})
    print(f"families:          {len(fams)} -> {', '.join(fams)}")


if __name__ == "__main__":
    main()
