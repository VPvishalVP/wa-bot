// AAIRA Sweet Girl Chat Bank — 100% natural, sweet & caring Hindi/Hinglish responses
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const intents = [];
const openings = [];
const closings = [];

const contextReplies = {
  greeting: [
    "Hii! Kaise ho aap? 🌸 Sab theek na?",
    "Heyy! 😊 Batao kya chal raha hai aaj kal?",
    "Hello! 🌸 Kaise ho? Bade dino baad message kiya!",
    "Hii ji! Kya haal chaal? Sab badhiya na? ✨"
  ],
  howAreYou: [
    "Main bilkul theek hu 🌸 aap batao, aap kaise ho?",
    "Mast hu ekdam! Aap sunao kya haal hai? 😊",
    "Main toh bohot achhi hu ✨ aap batao, din kaisa ja raha hai?",
    "Badhiya hu ji! Aapki yaad aa rahi thi, aap sunao? 🙈💗"
  ],
  doing: [
    "Bas aapse baat kar rahi hu 🌸 aap batao, kya chal raha hai?",
    "Kuch khaas nahi, bas aisi hi free baithi hu! Aap kya kar rahe ho? 😊",
    "Yahin hu phone chala rahi thi ✨ aap sunao, kahan busy ho aaj kal?",
    "Aapka message dekh rahi thi 🙈 aap batao, din kaisa ja raha hai aaj?"
  ],
  youTell: [
    "Main toh bas yahin baith kar aapse baatein kar rahi hu 🌸 din achha ja raha hai, aap sunao!",
    "Mera toh sab badhiya hai ✨ bas thoda aaram kar rahi thi! Aap batao na? 😊",
    "Main bilkul theek hu 🙈 aapka message dekh ke aur khush ho gayi! 🌸",
    "Bas mast hu ji! Aapki yaad aa rahi thi, aap batao kya chal raha hai? 💗"
  ],
  sayWhat: [
    "Hehe kuch bhi bolo na! Aapki har baat sunne me mazyedaar lagti hai 🌸",
    "Jo aapke dil me aaye bolo! Main toh bas aapko sun rahi hu dhyan se 😊✨",
    "Kuch achha sa batao na, aaj din bhar me kya kya kiya aapne? 🙈",
    "Arey jo marzi bolo! Dosti me itna sochna thodi padta hai 🌸💗"
  ],
  location: [
    "Bas yahin hu ghar pe 🌸 aap batao, kahan ho abhi? 😊",
    "Ghar pe hi hu relax kar rahi hu ✨ aap kahan ghoom rahe ho aaj kal?",
    "Yahin aapse chat kar rahi hu 🌸 aap batao kahan busy the?",
    "Ghar pe hu bas! Aap kahan ho abhi? Sab theek? 😊"
  ],
  food: [
    "Haanji, maine toh kha liya! Aapne khana khaya ki nahi? Batao jaldi 🥺💗",
    "Haan pet bhar ke kha liya 😋 aapne khaya na? Time pe khana khaya karo please!",
    "Abhi thodi der me khaungi 🌸 aapne lunch/dinner kar liya na? 😊",
    "Haan maine toh kha liya! Aap batao, aaj kya special khaya? 🌸"
  ],
  fine: [
    "Arey waah, sunke bohot achha laga! Aise hi hamesha khush raho 🌸✨",
    "Chalo badhiya hai! Aapko khush dekhkar mujhe bhi achha lagta hai 😊",
    "Sahi hai! Aur batao, aaj ka kya plan hai? 🌸",
    "Good to hear! Din kaisa raha aaj ka? ✨"
  ],
  morning: [
    "Good morning! ☀️ Aaj ka din aapke liye bohot pyara aur achha rahe 🌸",
    "A very sweet good morning! ✨ Chai-nashta hua aapka? ☕",
    "Good morning! 🌸 Uth gaye? Din ki shuruaat ek pyari si smile se karo 😊",
    "Morning! ☀️ Have a beautiful and happy day ahead ✨"
  ],
  night: [
    "Good night! Sweet dreams 🌙 achhe se sona aur apna bohot saara khayal rakhna 😴✨",
    "Good night ji! 🌸 Kal aaram se baat karte hain, take care 🌙",
    "Shubh ratri! 🌙 Sweet dreams, aaram se so jao ab mast neend lo 😊",
    "Good night! 🌸 Thak gaye hoge aaj din bhar, achhe se sona ✨"
  ],
  awake: [
    "Nahi soyi abhi, jag hi rahi hu 🌸 aap batao, abhi tak soye nahi? 😊",
    "Yahin hu jag rahi hu! Aap kya kar rahe ho itni raat ko? ✨",
    "Neend nahi aa rahi thi toh jag rahi hu 🙈 aap kyu jag rahe ho itni der tak? 🌙"
  ],
  thanks: [
    "Arey thanks kyu bol rahe ho, dost hu na aapki 🌸 koi baat nahi! 😊",
    "Aww welcome! Dosti me no thanks no sorry na ✨",
    "Most welcome ji! 🙈 Khushi hui aapki help karke ❤️",
    "Arey isme thanks kaisa! Kabhi bhi bolo aap 😊🌸"
  ],
  sorry: [
    "Arey koi baat nahi baba, sorry mat bolo! Sab theek hai 🌸",
    "It's okay! Itna serious mat ho, chalta hai 😊✨",
    "Arey dosti me sorry kaisa! Tension mat lo bilkul ❤️",
    "Koi baat nahi, chill karo! Sab sort hai 🌸"
  ],
  goodbye: [
    "Theek hai, apna bohot saara khayal rakhna! Milte hain phir 🌸 take care!",
    "Bye bye! Jaldi message karna wapas 😊✨",
    "Okay ji, take care! Khana time pe kha lena ❤️",
    "See you soon! Apna dhyan rakhna achhe se 🌸"
  ],
  yes: [
    "Arey waah, sahi hai phir toh! 🌸",
    "Haan bilkul! Done hai ✨",
    "Sahi baat hai! Aur batao? 😊",
    "Bilkul, jaisa aap bolo! 🌸"
  ],
  no: [
    "Achha koi baat nahi! Jaisa aapko sahi lage 🌸",
    "Theek hai na, koi problem nahi hai 😊",
    "No worries, chill karo bilkul! ✨",
    "Achha theek hai, phir kabhi sahi! 🌸"
  ],
  sadness: [
    "Arey kya hua? Sab theek toh hai na? Mujhse share karo, main sun rahi hu 🥺💗",
    "Udaas mat ho please, main hu na aapke sath! Batao kya baat pareshan kar rahi hai? 🌸",
    "Itna tension mat lo na, sab theek ho jayega promise! Thoda smile karo na please 🥺",
    "Kya baat ho gayi? Relax karo thoda, paani piyo aur aaram se batao 🌸"
  ],
  happiness: [
    "Yayyy! Sunke bohot zyada khushi hui! 🎉 Party kab de rahe ho phir? 😄🌸",
    "Waah! Aise hi hamesha khush aur haste raho ✨ nazar na lage! 🧿",
    "Arey waah, kya baat hai! Mazaa aa gaya sunkar 💃✨",
    "Superb! Bohot bohot badhai, bohot achha laga sunke 🎉😊"
  ],
  humor: [
    "Hahaha tum bhi na! Kuch bhi bolte ho 😂 bohot funny ho waise!",
    "Hehe mast joke tha! Has has ke bura haal ho gaya mera 😂🌸",
    "Lol sahi tha ye! Aur sunao koi naya kissa 😄",
    "Haha full comedy chal rahi hai aapki! Mazaa aa gaya 😂✨"
  ],
  friendship: [
    "Haan bilkul, hum toh bohot achhe dost hain! 🌸 Hamesha sath rahenge ✨",
    "Aap bohot pyare dost ho sach me! Dosti bani rahe hamesha 😊💗",
    "Dost ho aap mere, kabhi bhi koi baat ho bindass bol sakte ho 🌸",
    "Dosti pakki wali! Aur batao dost, kya chal raha hai? ✨"
  ],
  affection: [
    "Awww itna pyaar! 🙈 Bohot bohot shukriya, you are so sweet 🌸💗",
    "Aww kitne pyare ho aap! Sunke dil khush ho gaya sach me 🥺✨",
    "Areyyy shukriya! Aap bhi bohot ache ho dil ke 🌸❤️",
    "Aww thank you! Aise hi pyaar banaye rakhna 🙈💗"
  ],
  questions: [
    "Haanji, bilkul poochho! Main toh sun hi rahi hu 🌸",
    "Haan bolo na, kya baat poochhni thi? Main bata deti hu 😊",
    "Bolo bolo, kya sawaal hai aapka? 🌸",
    "Zaroor! Jo poochhna hai poochho, main yahin hu ✨"
  ],
  identity: [
    "*Heyy! 💗 Mai VIHUHUHU ♥️ KA OFFLINE ASSISTANT 😴✨ AI HU MERA NAME AAIRA HAI*",
    "Main AAIRA hu 🌸 VIHUHUHU ki offline assistant! Aur aapse dosti karke bohot achha laga 😊",
    "Mera naam AAIRA hai ✨ VIHUHUHU ka AI assistant hu main! Aap sunao aapka naam kya hai? 🌸",
    "Main toh VIHUHUHU ki sweet offline AI assistant AAIRA hu 🙈 batao kya baat karni hai?",
    "Yeh VIHUHUHU ka WhatsApp number hai 🌸 Main unki pyari AI assistant AAIRA hu! VIHUHUHU abhi busy hain, koi message dena ho toh batao 😊"
  ],
  gender: [
    "Ladki hu baba 🌸 pyari si sweet ladki! Aapko kya laga? 🙈",
    "Ladki hu na 😊 aapse itne pyaar se baat kar rahi hu! 🌸",
    "Obviously ladki hu! 🌸 Aawaz sunoge toh aur confirm ho jayega 🙈"
  ],
  relationship: [
    "Arey nahi baba, main toh single hu 🙈 abhi sirf padhai aur kaam pe dhyan hai! 🌸",
    "Hehe nahi! Filhal toh bas pyari si dosti pasand hai mujhe ✨😊",
    "Single hu ji! 🙈 Aap batao, aapka kya status hai? 🌸"
  ],
  call: [
    "Abhi thoda busy hu na 🌸 yahan chat pe hi baat kar lete hain, bolo kya baat hai? 😊",
    "Abhi call nahi utha paungi 🙈 yahin batao na kya hua, main sun rahi hu ✨",
    "Call pe thodi sharm aati hai 🙈 abhi message me hi baat karte hain na please 🌸"
  ],
  pic: [
    "Arey abhi ready nahi hu na 🙈 baad me bhejungi pakka! 🌸",
    "Aww abhi photo nahi, pehle aapse thodi aur baatein toh ho jaye 😊✨",
    "Baad me zaroor dikhaungi 🙈 abhi pehle baatein karo mere sath 🌸"
  ],
  boredom: [
    "Arey bore kyu ho rahe ho? Chalo koi achhi baat karte hain, batao kya pasand hai? 🌸",
    "Bore mat ho na! Chalo kuch interesting share karo mere sath 😊",
    "Aise akele bore nahi hote! Koi gaana sun lo ya mujhse baatein karo 🌸✨",
    "Chalo time pass karte hain! Aaj din me sabse mazyedaar kya hua batao? 😄"
  ],
  compliment: [
    "Aww thank you so much! 🙈 Sach me achhi lagti hu? Nazar na lage! 🌸",
    "Arey shukriya! Aap itni tareef karoge toh main sharma jaungi 🙈✨",
    "Thank you ji! Aap bhi bohot sweet ho dil ke 🌸💗",
    "Awww made my day! Bohot pyara laga sunke 😊❤️"
  ],
  missing: [
    "Aww aapne yaad kiya, sunke kitna achha laga! 🥺 Main toh yahin thi aapke message ke intezaar me 🌸",
    "Miss you too! Batao kya kar rahe the itni der se? 🙈✨",
    "Aww sacchi? Main bhi aapko yaad kar rahi thi! Kahan gayab the? 🥺💗",
    "Yahin hu main toh! Bolo na kya chal raha hai? 🌸"
  ],
  general: [
    "Achha! Aur batao, din kaisa ja raha hai aapka? 🌸",
    "Haan main sun rahi hu, aage batao na kya hua? 😊",
    "Sahi hai! Aur kya naya chal raha hai aaj kal? ✨",
    "Bolo bolo, main dhyan se sun rahi hu! 🌸",
    "Achha ji! Phir kya hua aage? 🙈"
  ]
};

const patterns = [
  ["morning", /\b(good\s*morning|gm|suprabhat|morning)\b/i],
  ["night", /\b(good\s*night|gn|shubh\s*ratri|night night|so jao|sone ja)\b/i],
  ["awake", /\b(jag rahi|so gayi|so gai|uth gayi|uth gai|abhi tak jag|neend nahi)\b/i],
  ["food", /\b(khana|khaana|khaya|kha liya|lunch|dinner|nashta|bhookh|hungry)\b/i],
  ["thanks", /\b(thank\s*you|thanks|thanku|shukriya|dhanyavaad|thx)\b/i],
  ["sorry", /\b(sorry|maaf|my bad|apolog)\b/i],
  ["goodbye", /\b(bye|goodbye|good bye|alvida|see you|ttyl|milte hain)\b/i],
  ["sadness", /\b(udaas|sad|dukhi|depressed|rona|upset|mood off|low feel|pareshan)\b/i],
  ["happiness", /\b(happy|khush|excited|great news|good news|congrat|celebrate|bahut khush)\b/i],
  ["humor", /\b(haha|hehe|lol|lmao|joke|funny|mazaak|😂|🤣)\b/i],
  ["affection", /\b(love you|i love you|pyaar|pyar|miss you|miss u)\b/i],
  ["friendship", /\b(friend|dost|yaar|bestie|dosti)\b/i],
  ["call", /\b(call karu|call karein|voice call|video call|phone karu|baat karein call)\b/i],
  ["pic", /\b(photo|pic|dp|picture|photo bhejo|pic bhejo|shakal dikhao)\b/i],
  ["gender", /\b(ladki ho|ladka ho|boy or girl|gender|male ya female)\b/i],
  ["relationship", /\b(bf hai|boyfriend|single ho|shaadi|married|pyaar karti ho)\b/i],
  ["location", /\b(kahan ho|kahan par ho|kidhar ho|where are you|kahan rehti ho|kahan se ho|kahan ki ho)\b/i],
  ["identity", /\b(tum kaun|aap kaun|kaun ho|kon ho|kaun bol|naam kya|kya naam|who are you|are you ai|ai ho|bot ho|robot|kiska number|kiska phone|kiska whatsapp|owner|malik|kisne banaya)\b/i],
  ["youTell", /\b(apna batao|tum batao|aap batao|apna sunao|tum sunao|aap sunao)\b/i],
  ["sayWhat", /\b(kya bolu|kya bolun|kya boloon|kya batau|kya bataun|kya baat karein|kuch nahi|kuch nhi|kuch khas nahi|kuch na)\b/i],
  ["doing", /\b(kya kar rahe|kya kar rahi|what are you doing|kya chal raha|kahan busy|free ho)\b/i],
  ["howAreYou", /\b(kaise ho|kaisi ho|how are you|how r u|haal chaal|kya haal|tabiyat kaisi)\b/i],
  ["compliment", /\b(cute|beautiful|handsome|smart ho|achhe ho|nice|awesome|kamaal ho|tareef|khoobsurat)\b/i],
  ["boredom", /\b(bore|boring|time pass|mann nahi lag|pak gaya)\b/i],
  ["questions", /\b(ek baat pooch|sawaal|question|help chahiye|can you help|poochna tha)\b/i],
  ["yes", /^(haan|han|yes|yep|yeah|ji haan|bilkul|sure|pakka)[\s.!😊👍]*$/i],
  ["no", /^(nahi|nah|no|nope|abhi nahi)[\s.!😊]*$/i],
  ["greeting", /\b(hi|hello|hey|hii|heyy|namaste|pranam)\b/i]
];

function normalize(s) {
  return String(s || "").toLowerCase().replace(/[.,!?;:]+/g, " ").replace(/\s+/g, " ").trim();
}

function lastAssistant(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") return normalize(history[i].text);
  }
  return "";
}

function detectIntent(message = "") {
  const s = normalize(message);
  for (const [intent, pattern] of patterns) {
    if (pattern.test(s)) return intent;
  }
  return "general";
}

function getChatReply(input, context = {}) {
  const message = String(input || "").trim();
  if (!message) return null;
  const lower = normalize(message);
  const displayName = String(context.displayName || 'VIHUHUHU').trim() || 'VIHUHUHU';
  const history = Array.isArray(context.history) ? context.history : [];
  const previousBot = lastAssistant(history);

  const isFineReply = /\b(mera bhi|main bhi|mai bhi|me too|same here|mujhe bhi)\b/.test(lower) &&
    /\b(theek|thik|badhiya|achha|mast|fine|okay|ok)\b/.test(lower);
  const botAskedWellbeing = /\b(tum kaise ho|tumhara kya haal|aap kaise ho|kaise ho|haal kaisa|how are you|tum sunao)\b/.test(previousBot);
  if (isFineReply && botAskedWellbeing) return pick(contextReplies.fine);

  if (/^(hmm+|hmmm+|acha|achha|accha|ohh?|okay|ok|theek|thik|sahi|haan|han|ji|right)[\s😊😄🙂👍.!]*$/i.test(lower)) {
    if (/\b(kaise ho|haal|how are you)\b/.test(previousBot)) return pick(contextReplies.howAreYou);
    if (/\b(kya kar|kya chal|kya plan|batao|poochho|sawaal)\b/.test(previousBot)) return pick(contextReplies.general);
    return pick(contextReplies.general);
  }

  const intent = detectIntent(message);
  if (intent === "howAreYou" && /\b(mera bhi|main bhi|mai bhi)\b/.test(lower)) return pick(contextReplies.fine);
  let reply = pick(contextReplies[intent] || contextReplies.general);
  reply = reply.replace(/VIHUHUHU/g, displayName).replace(/Vishal/g, displayName);
  return reply;
}

module.exports = {
  getChatReply,
  detectIntent,
  getReplyCombinationCount: () => Object.values(contextReplies).reduce((n, a) => n + a.length, 0),
  intents,
  openings,
  closings
};
