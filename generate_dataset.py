#!/usr/bin/env python3
"""VIHUHUHU synthetic Hinglish reply dataset batch generator (default 100M rows).
Records are template-combinations, not individually authored or psychology-validated.
Run: python generate_dataset.py --count 100000000 --batch-size 100000 --out dataset
"""
import argparse,json,os,random
BANK={
"greeting":(["Hey!","Hii!","Hello ji!","Namaste!","Arey hi 😊"],["aaj ka din kaisa hai?","kya naya chal raha hai?","mood kaisa hai?","sab theek hai?"],["Aaram se batao.","Main sun raha/rahi hoon.","Koi jaldi nahi."]),
"positive":(["Wah, kya baat hai!","Arey waah!","Sunkar khushi hui!","Nice yaar!"],["tumhare liye khushi ho rahi hai.","sabse best part kya raha?","yeh moment enjoy karo."],["Aur sunao!","Jashn banta hai!","🎉"]),
"support":(["Oh, yeh sun kar bura laga.","Yeh tough lag raha hoga.","Tumhari feelings matter karti hain."],["agar chaaho toh batao kya hua.","advice chahiye ya bas koi sunne wala?","abhi kya support helpful hoga?"],["Aaram se, jitna comfortable ho.","No pressure 💛","Main sun raha/rahi hoon."]),
"stress":(["Lagta hai kaafi stress hai.","Chalo thoda sort karte hain.","I hear you."],["sabse urgent cheez kaunsi hai?","tasks ko chhote steps mein baant dein?","plan chahiye ya vent karna hai?"],["Ek step se shuru karein.","Aaram se.","🌿"]),
"relationship":(["Oho, dil ki baat hai!","Feelings complicated ho sakti hain.","Achha, batao!"],["tum kya expect kar rahe ho?","respect aur consent important hain.","clarity chahiye ya advice?"],["No judgement.","Aaram se batao.","💗"]),
"casual":(["Achha ji!","Haan haan, bolo 😄","Hmm, interesting!"],["phir kya hua?","aur batao, kya chal raha hai?","thoda context do."],["Aaram se batao.","Batao na.","😄"])}
KEYS={"positive":["happy","khush","great","awesome","mast","success","congrats"],"support":["sad","dukhi","hurt","alone","akela","bura lag"],"stress":["stress","tension","pressure","anxiety","pareshan"],"relationship":["love","pyar","pyaar","crush","relationship"],"greeting":["hi","hello","hey","namaste","good morning"]}
def intent(s):
 s=s.lower()
 for k,words in KEYS.items():
  if any(w in s for w in words): return k
 return "casual"
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--count",type=int,default=100_000_000)
 p.add_argument("--batch-size",type=int,default=100_000)
 p.add_argument("--out",default="dataset")
 p.add_argument("--seed",type=int,default=42)
 p.add_argument("--input",default=None,help="optional txt file of incoming messages, one per line")
 a=p.parse_args()
 if a.count<1 or a.batch_size<1: p.error("count and batch-size must be positive")
 msgs=["hi","I am happy","mujhe tension hai","love wali baat","kya haal hai"]
 if a.input:
  with open(a.input,encoding="utf-8") as f: msgs=[x.strip() for x in f if x.strip()]
 if not msgs: msgs=["hello"]
 os.makedirs(a.out,exist_ok=True); r=random.Random(a.seed)
 for start in range(0,a.count,a.batch_size):
  n=min(a.batch_size,a.count-start); fn=os.path.join(a.out,f"part_{start//a.batch_size+1:05d}.jsonl")
  with open(fn,"w",encoding="utf-8") as f:
   for j in range(n):
    m=r.choice(msgs); k=intent(m); x,y,z=BANK[k]
    row={"id":start+j+1,"category":k,"input_sample":m,"reply":f"{r.choice(x)} {r.choice(y)} {r.choice(z)}"}
    f.write(json.dumps(row,ensure_ascii=False)+"\\n")
  print(f"created {fn}: {n:,} records")
 print(f"Completed requested count: {a.count:,}. Generated from templates; not 100M individually unique validated messages.")
if __name__=="__main__": main()
