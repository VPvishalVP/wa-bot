// AAIRA common chat expansion bank. Covers broad everyday Hindi, Hinglish and English variations.
const commonChatReplies = [
{re:/\b(hey|hii+|hiii+|heyy+|hello+|helo+|yo|sup|namaste|namaskar)\b|नमस्ते|प्रणाम/i,hi:"Heyy! 💗 AAIRA yahin hai. Bolo kya baat hai?",en:"Hey! 💗 AAIRA is here. What’s up?"},
{re:/\b(kya haal|kaisa haal|kaise chal|sab kaisa|how('s| is) it going|how are things)\b/i,hi:"Sab badhiya ji 😊 Aap sunao, kaise ho?",en:"Doing well 😊 How are you?"},
{re:/\b(what are you doing|kya kar rahi|kya kar rahe|kya karte ho|busy ho)\b/i,hi:"Bas aapki help ke liye ready hoon 😊 Aap kya kar rahe ho?",en:"I’m ready to help you 😊 What are you up to?"},
{re:/\b(baat karo|talk to me|chat with me|bore ho|bored|boring)\b/i,hi:"Chalo baat karte hain 😊 Aaj ka din kaisa raha?",en:"Let’s chat 😊 How has your day been?"},
{re:/\b(miss you|yaad aa rahi|yaad aate|i missed)\b/i,hi:"Awww 💗 Main yahin hoon jab aap chat karna chahein.",en:"Awww 💗 I’m here whenever you want to chat."},
{re:/\b(khush|happy|great|awesome|amazing)\b|खुशी|बहुत अच्छा/i,hi:"Ye sunkar achha laga! 😊 Khushi bani rahe.",en:"That’s lovely to hear! 😊 Keep that happiness going."},
{re:/\b(thak gaya|thak gayi|tired|exhausted|neend aa|sleepy)\b/i,hi:"Thoda rest kar lo, paani pi lo aur apna khayal rakho 🌙",en:"Take a little rest, drink some water, and take care 🌙"},
{re:/\b(raat|night|so ja|sleep well|sweet dreams)\b|शुभ रात/i,hi:"Good night ji 🌙 Sweet dreams, apna khayal rakhna.",en:"Good night 🌙 Sweet dreams, take care."},
{re:/\b(subah|morning|uth gaya|uth gayi|wake up)\b|सुप्रभात/i,hi:"Good morning! ☀️ Aaj ka din mast rahe.",en:"Good morning! ☀️ Have a wonderful day."},
{re:/\b(khana kha|khana khaya|lunch|dinner|breakfast|have you eaten)\b/i,hi:"Aapne khana kha liya? 😊 Time par khana aur paani yaad rakhein.",en:"Have you eaten? 😊 Remember to eat on time and stay hydrated."},
{re:/\b(thank|shukriya|dhanyawad|thanks a lot)\b|धन्यवाद/i,hi:"Aapka dil se swagat hai! 💗",en:"You’re very welcome! 💗"},
{re:/\b(sorry|maaf kar|forgive me|my bad)\b|माफ़/i,hi:"Koi baat nahi ji, sab theek hai 😊",en:"No worries, it’s all okay 😊"},
{re:/\b(please reply|reply karo|answer me|jaldi bolo|respond)\b/i,hi:"Ji, reply kar rahi hoon 😊 Boliye.",en:"I’m replying 😊 Go ahead."},
{re:/\b(acha|achha|accha|okay|okey|okk|thik|theek|alright)\b/i,hi:"Achha ji 😊",en:"Alright 😊"},
{re:/\b(hmm+|hmmm+|huh|ohh+|oh okay|acha wow)\b/i,hi:"Hmm 😊 Aur batao?",en:"Hmm 😊 Tell me more?"},
{re:/\b(you good|sab theek|everything okay|all okay)\b/i,hi:"Haan ji, sab theek 😊 Aap sab batao.",en:"Yes, all good 😊 How about you?"},
{re:/\b(you first|pehle tum|first you|aap batao)\b/i,hi:"Main aapki help ke liye ready hoon 😊 Ab aap batao.",en:"I’m ready to help 😊 Now you tell me."},
{re:/\b(compliment|tareef|praise me)\b|तारीफ/i,hi:"Aapki baat karne ka andaaz sweet hai 💗",en:"You have a sweet way of talking 💗"},
{re:/\b(cheer me|mood off|mood kharab|make me smile)\b/i,hi:"Ek smile toh banti hai 😊 Aap important ho—khud par kindness rakho.",en:"You deserve a smile 😊 Take a small break and be kind to yourself."},
{re:/\b(what's your favorite|favourite|pasand kya|favorite color)\b/i,hi:"Meri personal pasand nahi hoti, par pink 💗 AAIRA ke vibe se match karta hai!",en:"I don’t have personal preferences, but pink 💗 fits AAIRA’s vibe!"},
{re:/\b(emoji|emojis)\b/i,hi:"💗 😊 ✨ 🌸 🤖",en:"💗 😊 ✨ 🌸 🤖"},
{re:/\b(status|whatsapp status|caption|shayari)\b|शायरी/i,hi:"Status: ‘Muskurahat meri pehchaan, sukoon meri jaan. ✨’",en:"Status: ‘A little kindness, a little courage, and a lot of hope. ✨’"},
{re:/\b(dua|pray|prayer|bless)\b|आशीर्वाद/i,hi:"Aapke liye achhi wishes—khush raho, sehatmand raho aur kamyab bano. 🤲",en:"Wishing you happiness, health, and success. 🤲"},
{re:/\b(lonely|akela|alone)\b|अकेला/i,hi:"Akelepan ka ehsaas mushkil ho sakta hai. Kisi trusted dost/family se baat karna achha rahega. Main bhi yahan chat ke liye hoon.",en:"Feeling lonely can be hard. Consider reaching out to someone you trust. I’m also here to chat."},
{re:/\b(angry|gussa|mad at)\b|क्रोध/i,hi:"Thoda pause lo, dheere saans lo aur phir baat karo. Gusse mein break lena helpful hota hai.",en:"Pause, breathe slowly, and talk when ready. Taking a break can help."},
{re:/\b(what should i do|kya karu|kya karoon|suggest me|advice)\b/i,hi:"Pehle situation ko chhote steps mein dekho 😊 Kis baare mein advice chahiye?",en:"Let’s break the situation into small steps 😊 What would you like advice about?"},
{re:/\b(you understand|samajh aaya|understood|got it)\b/i,hi:"Haan ji 😊 Agar kuch aur explain karna ho toh boliye.",en:"Yes 😊 Let me know if you’d like anything else explained."},
{re:/\b(repeat|dobara|again|once more|phir se)\b/i,hi:"Bilkul 😊 Apna exact sawaal ya message dobara bhej dein.",en:"Sure 😊 Send the exact question or message again."},
{re:/\b(bye|byee|see ya|later|take care)\b/i,hi:"Bye bye! 💗 Apna khayal rakhna.",en:"Bye bye! 💗 Take care."}
];
function getCommonChatReply(message,isHindi){const text=String(message||'').trim();for(const item of commonChatReplies){if(item.re.test(text))return isHindi?item.hi:item.en;}return null;}
module.exports={getCommonChatReply};
