// AAIRA common-chat response bank with context-aware conversational flow.
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const intents = [];
const openings = [];
const closings = [];

const contextReplies = {
  greeting: ["Hello! 😊 Kaise ho?","Hi! Sab theek?","Hey, kya haal hai? 😄","Namaste! Aaj kaise ho?"],
  howAreYou: ["Main theek hoon 😊 tum kaise ho?","Badhiya hoon, tum sunao?","Sab achha chal raha hai. Tumhara kya haal?","Theek-thaak hoon, tum kaise ho?"],
  doing: ["Bas yahin hoon, tumse baat kar raha/rahi hoon. 😊","Kuch khaas nahi, tum batao?","Abhi chat kar raha/rahi hoon. Tum kya kar rahe ho?","Tumhara message padh raha/rahi hoon."],
  fine: ["Achha hai, sunke khushi hui! 😊","Badhiya! Aaj kya chal raha hai?","Sahi hai, aise hi khush raho. ❤️","Wah, nice! Aur batao?","Chalo, ye sunkar achha laga. 😊"],
  morning: ["Good morning! Aaj ka din achha rahe. ☀️","Suprabhat! Khush raho. 😊","Good morning! Aaj kya plan hai?","Morning! Nayi subah mubarak."],
  night: ["Good night, sweet dreams! 🌙","Shubh ratri, aaram se sona. 😴","Good night! Kal phir baat karenge. 😊","Achhi neend aaye, apna khayal rakhna."],
  food: ["Haan, kha liya. Tumne khaya? 😊","Abhi khane ja raha/rahi hoon, tum batao?","Haan, pet bhar ke khaya! 😋","Abhi nahi, thodi der mein khaunga/khaungi. Tumne khaya?"],
  thanks: ["You're welcome! 😊","Koi baat nahi, khushi hui help karke. ❤️","Arey, thanks ki kya baat!","Welcome! Kabhi bhi."],
  sorry: ["Koi baat nahi, sab theek hai. 😊","It's okay, tension mat lo. ❤️","Chalta hai, galti sabse hoti hai.","No worries!"],
  goodbye: ["Theek hai, phir baat karte hain! 😊","Bye, apna khayal rakhna. ❤️","Milte hain phir, take care!","See you soon!"],
  yes: ["Achha, badhiya! 😊","Bilkul!","Sahi hai. 👍","Okay, phir done."],
  no: ["Achha, koi baat nahi. 😊","Theek hai, no pressure.","Samajh gaya/gayi.","Okay, phir kabhi."],
  sadness: ["Kya hua? Baat karna chaho toh main sun raha/rahi hoon. ❤️","Arey, himmat rakho. Kya baat pareshan kar rahi hai?","Tum share karna chaho toh aaram se batao.","Mujhe afsos hai tum aisa feel kar rahe ho."],
  happiness: ["Wah! Ye sunkar achha laga. 🎉","Aise hi khush raho! ❤️","Arey badhiya, kya good news hai?","Mast! Enjoy karo. 😄"],
  humor: ["Haha, tum bhi na! 😂","Hehe, good one! 😄","Hasi-mazaak chalta rahe!","LOL 😂 aur sunao!"],
  friendship: ["Bilkul, friendly baatein karte hain! 😊","Tum bhi achhe dost ho. ❤️","Dosti bani rahe!","Haan ji, bolo dost."],
  affection: ["Aww, that's sweet! ❤️","Tumhari baat pyari hai. 😊","Thanks, sending positive vibes!","Aww, appreciate it."],
  questions: ["Haan, poochho. 😊","Bilkul, kya sawaal hai?","Bolo, sun raha/rahi hoon.","Zaroor, batao kya help chahiye?"],
  identity: ["Main AAIRA AI chat assistant hoon. 😊","Main virtual assistant hoon, insaan nahi.","Mera naam AAIRA hai.","Main AI bot hoon, chat aur help ke liye."],
  boredom: ["Chalo kuch interesting baat karte hain. 😊","Koi game khelein? 😄","Kis topic par baat karein?","Chalo time pass karte hain."],
  compliment: ["Thank you! Tum bhi kamaal ho. 😊","Arey, shukriya. ❤️","That's kind of you!","Thanks, achha laga sunkar."],
  missing: ["Aww, achha laga tumne yaad kiya. ❤️","Yahin hoon, baat karte hain. 😊","Miss you too!","Bolo, kya chal raha hai?"],
  general: ["Achha, aur batao? 😊","Tum sunao, kya chal raha hai?","Haan, bolo. Main sun raha/rahi hoon.","Phir kya hua?","Samajh raha/rahi hoon. Aage batao."]
};

const patterns = [
  ["morning", /\b(good\s*morning|gm|suprabhat|morning)\b/i],
  ["night", /\b(good\s*night|gn|shubh\s*ratri|night night|so jao|sone ja)\b/i],
  ["food", /\b(khana|khaana|khaya|kha liya|lunch|dinner|nashta|bhookh|hungry)\b/i],
  ["thanks", /\b(thank\s*you|thanks|thanku|shukriya|dhanyavaad|thx)\b/i],
  ["sorry", /\b(sorry|maaf|my bad|apolog)\b/i],
  ["goodbye", /\b(bye|goodbye|good bye|alvida|see you|ttyl|milte hain)\b/i],
  ["sadness", /\b(udaas|sad|dukhi|depressed|rona|upset|mood off|low feel|pareshan)\b/i],
  ["happiness", /\b(happy|khush|excited|great news|good news|congrat|celebrate|bahut khush)\b/i],
  ["humor", /\b(haha|hehe|lol|lmao|joke|funny|mazaak|😂|🤣)\b/i],
  ["affection", /\b(love you|i love you|pyaar|pyar|miss you|miss u)\b/i],
  ["friendship", /\b(friend|dost|yaar|bestie|dosti)\b/i],
  ["identity", /\b(tum kaun|aap kaun|naam kya|who are you|are you ai|ai ho|bot ho|robot)\b/i],
  ["doing", /\b(kya kar rahe|kya kar rahi|what are you doing|kya chal raha|kahan busy|free ho)\b/i],
  ["howAreYou", /\b(kaise ho|kaisi ho|how are you|how r u|haal chaal|kya haal|tabiyat kaisi)\b/i],
  ["compliment", /\b(cute|beautiful|handsome|smart ho|achhe ho|nice|awesome|kamaal ho|tareef)\b/i],
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
  for (const [intent, pattern] of patterns) if (pattern.test(s)) return intent;
  return "general";
}
function getChatReply(input, context = {}) {
  const message = String(input || "").trim();
  if (!message) return null;
  const lower = normalize(message);
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
  return pick(contextReplies[intent] || contextReplies.general);
}
module.exports = { getChatReply, detectIntent, getReplyCombinationCount: () => Object.values(contextReplies).reduce((n, a) => n + a.length, 0), intents, openings, closings };
