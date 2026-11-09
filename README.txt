VIHUHUHU 100 Million Generator ZIP
Contains:
- generate_dataset.py: generates JSONL in batches; default count 100,000,000.
- replyEngine.js: lightweight dynamic response engine for Node.js.
- README.txt: setup notes.

Try a small sample first:
python generate_dataset.py --count 10000 --batch-size 2000

Generate 100 million:
python generate_dataset.py --count 100000000 --batch-size 100000 --out dataset

Python 3.8+ needed; no external packages.
This creates 1,000 batch files by default. It may consume considerable disk space and time.
Messages are synthetic template combinations, not 100 million separately authored or scientifically validated replies.
For your WhatsApp bot, a dynamic reply engine is usually more practical than loading a huge dataset into memory.
Reply only to people who message first; respect opt-outs.
