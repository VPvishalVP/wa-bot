// VIHUHUHU replyEngine.js — 1 lakh+ reply combinations per intent, generated dynamically.
// These are combinations, not 100,000 separately stored message rows.
const pick = a => a[Math.floor(Math.random() * a.length)];

const expand = (phrases, starters) =>
  starters.flatMap(starter => phrases.map(phrase => `${starter}${phrase}`));

const pools = {
  greeting: {
    a: expand([" hi!"," hello!"," namaste!"," kya haal hai?"," kaise ho?"," tumse milkar achha laga!"," kya chal raha hai?"," aaj kaise ho?"," welcome yaar!"," hello ji!"], ["Hey,","Hii,","Arey,","Achha,","Sunno,","Dost,","Yaar,","Namaste,","Oho,","Hello ji,"]),
    b: expand(["aaj ka din kaisa hai?","kya naya chal raha hai?","mood kaisa hai?","sab theek hai?","kya kar rahe ho?","kuch interesting batao.","kaise chal rahi hai life?","aaj kya plan hai?","sab badhiya?","kya haal-chaal hain?"], ["Batao, ","Pucho toh, ","Waise, ","Aur sunao, ","Chalo, ","Ab bolo, ","Zara batao, ","Toh batao, ","Aaj, ",""]),
    c: ["Aaram se batao 😊","Main yahin hoon.","Koi jaldi nahi.","Bolo na!","😊","Dil khol ke batao.","Aur sunao!","Main sun raha/rahi hoon.","Chalo baat karte hain.","💛"]
  },
  positive: {
    a: expand([" kya baat hai!"," waah!"," sunkar khushi hui!"," bahut badhiya!"," nice yaar!"," tumne kamaal kiya!"," proud feel ho raha hai!"," mast news hai!"," congratulations!"," ye toh awesome hai!"], ["Arey,","Wah,","Oho,","Sach mein,","Yaar,","Dost,","Achha,","Zabardast,","Kya baat,","Bahut hi,"]),
    b: expand(["tumhare liye khushi ho rahi hai.","sabse best part kya raha?","yeh moment enjoy karo.","aise hi aage badhte raho.","tum deserve karte ho.","aur details sunao.","yeh toh celebrate karna chahiye.","kya plan hai ab?","good vibes bani rahein.","mujhe aur batao."], ["Aur, ","Waise, ","Sach kahun toh, ","Ab toh, ","Is baat par, ","Chalo, ","Lagta hai, ","Toh phir, ","Yeh sunkar, ",""]),
    c: ["Aur sunao! 🎉","Jashn banta hai!","Keep smiling ❤️","Bahut khushi hui.","Aise hi khush raho!","Kamaal!","🥳","Enjoy karo!","Proud of you!","✨"]
  },
  support: {
    a: expand([" yeh sun kar bura laga."," yeh tough lag raha hoga."," tumhari feelings matter karti hain."," main samajhne ki koshish kar raha/rahi hoon."," tum akele nahi ho."," dil halka karna chaho toh batao."," aaram se, main sun raha/rahi hoon."," yeh situation mushkil hai."," tumhari baat important hai."," mujhe afsos hai."], ["Oh,","Arey,","Dost,","Yaar,","Sach mein,","Hmm,","Sunno,","I hear you,","Achha,",""]),
    b: expand(["agar chaaho toh batao kya hua.","advice chahiye ya bas koi sunne wala?","abhi kya support helpful hoga?","hum milkar soch sakte hain.","jitna comfortable ho utna share karo.","kya cheez sabse zyada hurt kar rahi hai?","thoda context bataoge?","main bina judgement sununga/sunungi.","kya tum baat karna chahte ho?","ek-ek step dekhte hain."], ["Aur, ","Waise, ","Chalo, ","Agar theek lage toh, ","Ab, ","Zara, ","Phir, ","Tum chaaho toh, ","Bas, ",""]),
    c: ["Aaram se, jitna comfortable ho.","No pressure 💛","Main sun raha/rahi hoon.","Tumhari feelings valid hain.","Take your time.","💛","Khud ka khayal rakhna.","Ek step at a time.","Yahin baat kar sakte ho.",""]
  },
  stress: {
    a: expand([" lagta hai kaafi stress hai."," chalo thoda sort karte hain."," I hear you."," ek saath bahut kuch ho raha hai."," pressure feel hona understandable hai."," pehle saans lete hain."," tum overwhelmed lag rahe ho."," aaram se plan banate hain."," chalo priorities dekhte hain."," mushkil lag raha hoga."], ["Hmm,","Dost,","Yaar,","Achha,","Sunno,","Chalo,","Sach mein,","Arey,","Waise,",""]),
    b: expand(["sabse urgent cheez kaunsi hai?","tasks ko chhote steps mein baant dein?","plan chahiye ya vent karna hai?","pehle ek cheez choose karein.","kya tumhare control mein hai?","thoda break possible hai?","main list banane mein help karun?","kahan se start karna sahi hoga?","koi deadline hai?","ek simple next step sochte hain."], ["Chalo, ","Ab, ","Pehle, ","Waise, ","Toh, ","Zara, ","Phir, ","Agar chaaho toh, ","Hum, ",""]),
    c: ["Ek step se shuru karein.","Aaram se. 🌿","Tum kar sakte ho.","No pressure.","🌿","Thoda paani bhi pi lo.","Take it one step at a time.","Main help kar sakta/sakti hoon.","Saath mein sort karte hain.","💛"]
  },
  relationship: {
    a: expand([" dil ki baat hai!"," feelings complicated ho sakti hain."," achha, batao!"," yeh kaafi personal lagta hai."," samajh raha/rahi hoon."," cute yaar!"," clarity important hoti hai."," emotions genuine ho sakte hain."," interesting situation hai.",""], ["Oho,","Arey,","Yaar,","Dost,","Achha,","Hmm,","Sach mein,","Waise,","Sunno,",""]),
    b: expand(["tum kya expect kar rahe ho?","respect aur consent important hain.","tum kya feel kar rahe ho?","clarity chahiye ya advice?","kya tumne unse baat ki?","tumhare liye best kya hoga?","boundaries ka khayal rakhna.","thoda context share karoge?","tum kya karna chahte ho?","honestly baat karna helpful ho sakta hai."], ["Aur, ","Waise, ","Chalo, ","Toh, ","Ab, ","Zara, ","Kya tum, ","Agar chaaho toh, ","Phir, ",""]),
    c: ["No judgement.","Aaram se batao.","💗","Tumhari feelings matter karti hain.","Respect dono taraf zaroori hai.","Main sun raha/rahi hoon.","Take your time.","Bolo na.","❤️",""]
  },
  casual: {
    a: expand([" achha ji!"," haan haan, bolo 😄"," hmm, interesting!"," samajh gaya/gayi."," sahi hai yaar!"," aur batao!"," ohh, achha!"," waah!"," theek hai!",""], ["Achha,","Haan,","Oho,","Hmm,","Yaar,","Dost,","Arey,","Waise,","Chalo,",""]),
    b: expand(["phir kya hua?","aur batao, kya chal raha hai?","thoda context do.","kya kehna chahte ho?","aage sunao.","kuch aur share karo.","tumhara kya khayal hai?","ab kya plan hai?","kaise help karun?","baat interesting ho rahi hai."], ["Aur, ","Waise, ","Toh, ","Phir, ","Chalo, ","Ab, ","Zara, ","Achha, ","Batao, ",""]),
    c: ["Aaram se batao.","Batao na. 😄","Main sun raha/rahi hoon.","Aur sunao!","😊","Koi baat nahi.","Chalo baat karte hain.","Hmm.","😄",""]
  }
};

const rules = {
  positive: ["happy","khush","great","awesome","mast","success","congrats","waah","wah"],
  support: ["sad","dukhi","hurt","alone","akela","bura lag","rona","upset"],
  stress: ["stress","tension","pressure","anxiety","pareshan","overwhelmed"],
  relationship: ["love","pyar","pyaar","crush","relationship","jaan","miss you"],
  greeting: ["hi","hello","hey","namaste","good morning","hii"]
};

function detectIntent(message = "") {
  const s = String(message).toLowerCase();
  for (const [intent, words] of Object.entries(rules)) {
    if (words.some(word => s.includes(word))) return intent;
  }
  return "casual";
}

function generateReply(message = "") {
  const p = pools[detectIntent(message)];
  return `${pick(p.a)} ${pick(p.b)} ${pick(p.c)}`;
}

function getReplyCombinationCount() {
  return Object.values(pools).reduce((total, p) => total + p.a.length * p.b.length * p.c.length, 0);
}

module.exports = { generateReply, detectIntent, getReplyCombinationCount };
