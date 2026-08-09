# Security

Only HTTPS `pobb.in` URLs in the supported path shapes are accepted. The server constructs the `/raw` endpoint itself, rejects redirects, uses an identifying User-Agent, limits responses to 2 MB, and aborts requests after eight seconds. No arbitrary URLs, cookies, account access, or rendered-page scraping are used.

Before production: add rate limiting, bounded decompression, cache-by-build/hash, structured request logging without raw build retention, and worker resource limits.
