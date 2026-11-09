// VIHUHUHU replyEngine.js — dynamic reply creation, no giant dataset required.
const pick=a=>a[Math.floor(Math.random()*a.length)];
const pools={
greeting:{a:["Hey!","Hii!","Hello ji!","Namaste!","Arey hi 😊"],b:["aaj ka din kaisa hai?","kya naya chal raha hai?","mood kaisa hai?","sab theek hai?"],c:["Aaram se batao.","Main sun raha/rahi hoon.","Koi jaldi nahi."]},
positive:{a:["Wah, kya baat hai!","Arey waah!","Sunkar khushi hui!","Nice yaar!"],b:["tumhare liye khushi ho rahi hai.","sabse best part kya raha?","yeh moment enjoy karo."],c:["Aur sunao!","Jashn banta hai!","🎉"]},
support:{a:["Oh, yeh sun kar bura laga.","Yeh tough lag raha hoga.","Tumhari feelings matter karti hain."],b:["agar chaaho toh batao kya hua.","advice chahiye ya bas koi sunne wala?","abhi kya support helpful hoga?"],c:["Aaram se, jitna comfortable ho.","No pressure 💛","Main sun raha/rahi hoon."]},
stress:{a:["Lagta hai kaafi stress hai.","Chalo thoda sort karte hain.","I hear you."],b:["sabse urgent cheez kaunsi hai?","tasks ko chhote steps mein baant dein?","plan chahiye ya vent karna hai?"],c:["Ek step se shuru karein.","Aaram se.","🌿"]},
relationship:{a:["Oho, dil ki baat hai!","Feelings complicated ho sakti hain.","Achha, batao!"],b:["tum kya expect kar rahe ho?","respect aur consent important hain.","clarity chahiye ya advice?"],c:["No judgement.","Aaram se batao.","💗"]},
casual:{a:["Achha ji!","Haan haan, bolo 😄","Hmm, interesting!"],b:["phir kya hua?","aur batao, kya chal raha hai?","thoda context do."],c:["Aaram se batao.","Batao na.","😄"]}};
const rules={positive:["happy","khush","great","awesome","mast","success","congrats"],support:["sad","dukhi","hurt","alone","akela","bura lag"],stress:["stress","tension","pressure","anxiety","pareshan"],relationship:["love","pyar","pyaar","crush","relationship"],greeting:["hi","hello","hey","namaste","good morning"]};
function detectIntent(message=""){const s=String(message).toLowerCase();for(const [k,w] of Object.entries(rules)){if(w.some(x=>s.includes(x)))return k;}return "casual";}
function generateReply(message=""){const p=pools[detectIntent(message)];return `${pick(p.a)} ${pick(p.b)} ${pick(p.c)}`;}
module.exports={generateReply,detectIntent};
