# Beem RAG Microservice

A production-aware Retrieval-Augmented Generation (RAG) microservice built in TypeScript for Beem's FAQ knowledge base. Answers user questions about Beem products accurately using state-of-the-art DeepInfra API models for both embeddings and generation — no hallucinations, no fabricated policies.

## Architecture

```
┌──────────────┐     ┌────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  POST /query │────▶│  Embed Query   │────▶│  Vector Search   │────▶│  Meta-Llama-3-8B    │
│  { question }│     │  (DeepInfra)   │     │  (cosine sim)    │     │  (grounded answer)  │
└──────────────┘     └────────────────┘     └──────────────────┘     └─────────────────────┘
                          │                         │                          │
                  DeepInfra API              In-Memory Store           DeepInfra API
                  bge-large-en-v1.5         Map<id, vector>        Meta-Llama-3-8B-Instruct
                  1024-dim vectors            hand-rolled                cloud LLM
```

### RAG Pipeline Flow

1. **Ingest** — FAQ data is read, chunked (Q+A combined), embedded via DeepInfra (`BAAI/bge-large-en-v1.5`), and stored in an in-memory vector store
2. **Query** — User question is embedded via DeepInfra → cosine similarity search retrieves top-k chunks above a minimum relevance threshold → DeepInfra API generates a grounded answer citing sources

### How a Single Query Works

When a request hits `POST /query`, the following steps execute sequentially:

```
1. Validate input     Zod schema checks question (non-empty), top_k (1–20), category (enum).
                      Returns 400 immediately on bad input — no API call made.

2. Embed question     DeepInfra API encodes the question as a 1024-dim vector
                      using BAAI/bge-large-en-v1.5. (~200–400 ms)

3. Vector search      Hand-rolled cosine similarity is computed against all stored
                      embeddings (or a category-filtered subset). Results below the
                      minimum score threshold (default 0.4) are discarded. (<1 ms)

4. Guard rail         If zero chunks pass the threshold, a canned refusal is returned
                      immediately — no LLM call, no hallucination risk.

5. Generate answer    Top-k chunks are formatted as a structured FAQ context block
                      and sent to Meta-Llama-3-8B-Instruct with a strict system prompt
                      that forbids the model from using external knowledge. (~3–12 s)

6. Return response    { answer, sources, scores, latency_ms } with source attribution.
```

### Embedding Strategy

- `BAAI/bge-large-en-v1.5` via DeepInfra cloud API
- **1024-dimensional** vectors — high-accuracy semantic search
- Hand-rolled cosine similarity with a minimum score threshold (default: 0.4) to avoid returning irrelevant results
- Requires a [DeepInfra API key](https://deepinfra.com/) for both embeddings and LLM generation

## Quick Start

- Node.js ≥ 18
- A [DeepInfra API key](https://deepinfra.com/) (required for both embeddings and LLM)

### LLM Provider & Reasoning

This project uses the **DeepInfra API** as its LLM and embedding provider for two main reasons:
1. **Access to State-of-the-Art Open Models:** DeepInfra provides high-performance inference for `Meta-Llama-3-8B-Instruct` (fast, excellent instruction-following for grounded RAG) and `BAAI/bge-large-en-v1.5` (top-tier open-source embedding model).
2. **Simplified Architecture:** By using DeepInfra for *both* embeddings and text generation, the application only requires a single API key and external dependency, simplifying deployment while maintaining production-grade performance.

### Setup

```bash
# Clone and install
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your DEEPINFRA_API_KEY

# Start the server
npm run dev
```

### Latency & Performance

End-to-end query latency is dominated by two sequential DeepInfra API round-trips:

| Step | Typical Latency | Driver |
|------|----------------|--------|
| Embed question | 200–500 ms | `BAAI/bge-large-en-v1.5` inference on DeepInfra |
| Vector search | < 1 ms | In-process, brute-force over 20 vectors |
| LLM generation | 3–12 s | `Meta-Llama-3-8B-Instruct` inference on DeepInfra |
| **Total (typical)** | **4–14 s** | Network-bound; no local GPU required |

> **Note:** Out-of-domain queries (no chunks above threshold) skip the LLM call entirely and return in ~200–500 ms.
>
> In production, response caching for frequently asked questions would eliminate the LLM call for warm queries.

## Evidence That the Service Works

Here are sample requests demonstrating the system's capabilities, including 5 diverse RAG queries run against the live local server:

### System Setup

**1. Health Check**
```bash
curl http://localhost:3000/health
```
**Response:**
```json
{
  "status": "ok",
  "document_count": 20,
  "uptime_seconds": 1132
}
```

**2. Ingesting FAQ Data**
```bash
curl -X POST http://localhost:3000/ingest
```
**Response:**
```json
{
  "message": "Successfully ingested 20 FAQ documents",
  "document_count": 20,
  "latency_ms": 6045
}
```

### 5 Diverse Query Examples

**Query 1: Standard Retrieval (Cash Advance Limits)**
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the maximum cash advance I can get?", "top_k": 2}'
```
**Response:**
```json
{
  "answer": "According to our FAQ, the maximum Everdraft advance is $500 per pay cycle. However, your personal limit may be lower based on your direct deposit history with Beem. New users typically start at a lower limit and can unlock higher limits after consistent paycheck deposits over 2-3 pay cycles.",
  "sources": [
    "FAQ-002",
    "FAQ-014"
  ],
  "scores": [
    0.77,
    0.659
  ],
  "latency_ms": 7487
}
```

**Query 2: Category Pre-Filtering (Security)**
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "How is my data protected?", "top_k": 2, "category": "security"}'
```
**Response:**
```json
{
  "answer": "Beem takes the security and protection of your financial data very seriously. We use bank-level 256-bit AES encryption for all stored data and TLS 1.3 for data in transit to ensure it remains secure. Additionally, we support biometric authentication (Face ID/fingerprint) and optional PIN for an extra layer of protection. Our security controls are independently audited annually as part of our SOC 2 Type II certification. We also comply with PCI DSS Level 1 for all card data handling. Furthermore, we never sell your financial data to third parties and only share it in specific circumstances, such as with our banking partner, credit bureaus, payment processors, or when required by law or regulatory order. You can review our full data sharing policy in the app under Settings > Privacy.",
  "sources": [
    "FAQ-017",
    "FAQ-018"
  ],
  "scores": [
    0.636,
    0.591
  ],
  "latency_ms": 13658
}
```

**Query 3: Synthesizing Multiple FAQs (Credit Building)**
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "How does the credit building feature work?", "top_k": 3}'
```
**Response:**
```json
{
  "answer": "Beem's credit building feature reports your on-time payment history to all three major credit bureaus (Equifax, Experian, TransUnion) each month. As long as Beem is your active banking app, your responsible account usage is reported as a positive tradeline. This means that your consistent and responsible account activity is reflected in your credit report, which can help improve your credit score over time. Unlike secured credit cards, there is no deposit required and no hard inquiry. Most users see their credit score move within 30-90 days of consistent use.",
  "sources": [
    "FAQ-010",
    "FAQ-013",
    "FAQ-012"
  ],
  "scores": [
    0.781,
    0.627,
    0.627
  ],
  "latency_ms": 11984
}
```

**Query 4: Specific Semantic Matching (Gig Worker Eligibility)**
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "Can I use Beem if I do DoorDash?", "top_k": 3, "category": "eligibility"}'
```
**Response:**
```json
{
  "answer": "Yes, you can use Beem if you are a DoorDash gig worker! According to our FAQ, Beem explicitly supports gig workers, freelancers, and self-employed individuals. You can link your DoorDash income to your Beem account and set up direct deposit. Additionally, you'll have access to a Beem Visa debit card for purchases and ATM withdrawals, a routing number and account number for direct deposits and bill payments, and more.",
  "sources": [
    "FAQ-020",
    "FAQ-009",
    "FAQ-013"
  ],
  "scores": [
    0.751,
    0.69,
    0.667
  ],
  "latency_ms": 11656
}
```

**Query 5: Out-of-Domain Guardrail Test (Hallucination Prevention)**
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the recipe for chocolate cake?", "top_k": 3}'
```
**Response:**
```json
{
  "answer": "I don't have enough information in our FAQ to answer that question. Please contact Beem support for further assistance.",
  "sources": [],
  "scores": [],
  "latency_ms": 4344
}
```

### API Documentation

Interactive Swagger UI is available at: **http://localhost:3000/docs**

OpenAPI JSON spec: **http://localhost:3000/openapi.json**

## API Reference

### `GET /health`

Returns service health and vector store document count.

**Response:**
```json
{
  "status": "ok",
  "document_count": 20,
  "uptime_seconds": 142
}
```

### `POST /ingest`

Reads `data/beem_faqs.json`, chunks and embeds each FAQ item via the DeepInfra API, and stores in the in-memory vector store.

**Idempotency:** Uses FAQ `id` as the deduplication key. Calling `/ingest` multiple times always results in exactly 20 documents.

**Response:**
```json
{
  "message": "Successfully ingested 20 FAQ documents",
  "document_count": 20,
  "latency_ms": 1523
}
```

### `POST /query`

Retrieves relevant FAQ chunks and generates a grounded answer.

**Request:**
```json
{
  "question": "How do I get a cash advance with Beem?",
  "top_k": 3,
  "category": "everdraft"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | ✅ | The user's question |
| `top_k` | integer | ❌ | Number of chunks to retrieve (default: 3) |
| `category` | string | ❌ | Filter by category before retrieval |

**Available categories:** `everdraft`, `direct_deposit`, `credit_building`, `cashback`, `account_management`, `security`, `eligibility`

**Response:**
```json
{
  "answer": "To get a cash advance with Beem, you can use the Everdraft feature...",
  "sources": ["FAQ-001", "FAQ-002", "FAQ-004"],
  "scores": [0.872, 0.741, 0.698],
  "latency_ms": 342
}
```

**Error Response (Example):**
```json
{
  "error": "Failed to process query",
  "details": "Vector store is empty. Call POST /ingest first to populate the knowledge base.",
  "latency_ms": 12
}
```

## Chunking Strategy

### Decision: Embed Q+A Together (No Splitting)

Each FAQ item becomes **one chunk**: `"Q: {question}\nA: {answer}"`.

**Why Q+A together?**
- A user query like *"how do I get cash advance?"* has high cosine similarity to a chunk containing both the question *"What is Everdraft?"* AND its answer
- Question-only embeddings lose the answer's semantic content
- Answer-only embeddings lose the interrogative framing that aligns with natural user queries

**Why no splitting/overlap?**
- FAQ answers average ~80 words (~100 tokens). `BAAI/bge-large-en-v1.5` supports up to 512 tokens per input — more than sufficient for each FAQ item without splitting.

**Why category as metadata (not in the embedding)?**
- Including `"Category: everdraft"` in embedded text adds noise to the semantic vector
- Category is stored as metadata for **pre-retrieval filtering** — a cleaner separation of concerns

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| HTTP framework | Express.js | Industry standard, simple, adequate scope |
| Embedding model | `BAAI/bge-large-en-v1.5` via DeepInfra API | 1024-dim vectors, state-of-the-art retrieval accuracy |
| LLM | `meta-llama/Meta-Llama-3-8B-Instruct` via DeepInfra API | Fast inference, strong instruction-following |
| Vector store | Hand-rolled cosine similarity | Transparent, debuggable, no external deps |
| Deduplication | `Map<id, VectorEntry>` | O(1) upsert by FAQ ID = idempotent ingestion |
| Category filtering | Pre-retrieval metadata filter | Narrows candidate pool before similarity search |
| Similarity threshold | Min score 0.4 | Prevents low-confidence chunks from reaching the LLM |
| Rate limiting | `express-rate-limit` per endpoint | Prevents API cost runaway and abuse (20/min query, 5/min ingest) |

## Project Structure

```
├── data/
│   └── beem_faqs.json          # 20 FAQ items (input data, unmodified)
├── src/
│   ├── index.ts                # Express app entry point
│   ├── types.ts                # Shared TypeScript interfaces
│   ├── swagger.ts              # OpenAPI 3.0 spec
│   ├── middleware/
│   │   ├── logger.ts           # Request logging (method, path, status, latency)
│   │   ├── contentType.ts      # Content-Type enforcement for POST/PUT/PATCH
│   │   ├── errorHandler.ts     # Global error handler (malformed JSON, unhandled errors)
│   │   └── rateLimiter.ts      # Per-endpoint rate limiting (query: 20/min, ingest: 5/min)
│   ├── routes/
│   │   ├── health.ts           # GET /health
│   │   ├── ingest.ts           # POST /ingest
│   │   └── query.ts            # POST /query
│   └── lib/
│       ├── vectorStore.ts      # In-memory vector store with cosine similarity + threshold filtering
│       ├── embeddings.ts       # DeepInfra embedding API wrapper (bge-large-en-v1.5)
│       ├── llm.ts              # DeepInfra LLM generation wrapper (Meta-Llama-3-8B-Instruct)
│       └── chunker.ts          # FAQ chunking logic
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPINFRA_API_KEY` | — | **Required.** Your DeepInfra API key |
| `PORT` | `3000` | Server port |
| `EMBEDDING_MODEL` | `BAAI/bge-large-en-v1.5` | DeepInfra model for embeddings |
| `LLM_MODEL` | `meta-llama/Meta-Llama-3-8B-Instruct` | DeepInfra model for answer generation |
| `TOP_K_DEFAULT` | `3` | Default number of chunks to retrieve |
| `MIN_SCORE` | `0.4` | Minimum cosine similarity score threshold |
| `RATE_LIMIT_QUERY_WINDOW_MS` | `60000` | Rate limit window for `/query` (ms) |
| `RATE_LIMIT_QUERY_MAX` | `20` | Max `/query` requests per window per IP |
| `RATE_LIMIT_INGEST_WINDOW_MS` | `60000` | Rate limit window for `/ingest` (ms) |
| `RATE_LIMIT_INGEST_MAX` | `5` | Max `/ingest` requests per window per IP |

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `[FATAL] DEEPINFRA_API_KEY is not set` on startup | Missing or misnamed `.env` file | Run `cp .env.example .env` and paste your key |
| `401 Unauthorized` from DeepInfra | Expired or invalid API key | Regenerate your key at [deepinfra.com](https://deepinfra.com/) |
| `Vector store is empty` on `/query` | Service restarted and `/ingest` not re-called | `curl -X POST http://localhost:3000/ingest` |
| `Port 3000 already in use` | Previous server process still running | `lsof -ti:3000 \| xargs kill` then restart |
| `Embedding dimension mismatch` error | `EMBEDDING_MODEL` env var changed between ingests | `curl -X POST http://localhost:3000/ingest` to re-embed with the current model |
| Slow first response after restart | Cold-start: vector store is empty, ingest embeds all 20 FAQs | Expected; subsequent queries skip ingestion |

## Known Limitations & Future Improvements

- **No automated tests** — The service lacks an automated test suite. A production deployment would include unit and integration tests (e.g., using Jest and Supertest).
- **In-memory only** — vector store resets on restart. A production system would use a persistent store (Qdrant, Pinecone, pgvector).
- **No authentication** — production would add JWT/API key auth middleware.
- **Fixed corpus** — currently only handles the 20 FAQ items. A production system would support dynamic document CRUD.
- **No reranking** — could add a cross-encoder reranking step for improved retrieval quality at scale.
- **No caching** — frequently asked questions could benefit from response caching to reduce LLM calls.
- **Fixed similarity threshold** — the default threshold of 0.4 is tuned for this FAQ corpus. A production system would calibrate it dynamically per domain.

## License

MIT © Beem Engineering
