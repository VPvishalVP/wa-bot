#!/bin/bash
exec cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000
