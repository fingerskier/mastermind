# Baseline Jobs
- Secretary
  - 30min sweep of new docs for issues


# Architecture
- Nodejs + TS bin `npx landsraad`
  - Vite/React UI
  - Fastify
    - REST for commands
    - SSE for event streaming
- CRON scheduler
- Vector embed DB of files for semantic search
  - Underrow pattern: file watcher, chunks, local embedder, vector store, fuzzy/keyword search
  - FAISS when available; direct vector search fallback for MVP/native install resilience
