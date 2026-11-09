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


AAIRA WhatsApp authentication (added)
- Supabase table public.aaira_user_credentials stores bcrypt-style password hashes (never plaintext).
- New users set an exactly 8-digit numeric password; existing users must log in.
- Five wrong password attempts trigger a 15-minute lockout.
- Send !reset in the same WhatsApp chat to receive a one-time reset code (5-minute expiry); enter the code and then a new 8-digit password.
- Authentication state and reset codes are held in bot memory; after a Render restart users may need to authenticate again and an in-progress reset expires.
- REQUIRED Render environment variable: SUPABASE_SERVICE_ROLE_KEY for the ZORIX project (rthezmmpatudgjfahsrv). Obtain it from Supabase Project Settings > API Keys/legacy service_role key and store only in Render Environment, never commit it or paste it into chats.
- The bot will not start without that environment variable. Add it in Render before the service deploys this change.
