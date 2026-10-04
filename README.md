# MindMesh

> An AI-powered personal knowledge system that turns saved web content into an interconnected, searchable knowledge base.

MindMesh is a personal "second brain" designed around a simple idea:

**Saving information is easy. Understanding and connecting it is the hard part.**

Instead of treating saved links as a flat archive, MindMesh processes them into structured knowledge — extracting summaries, topics, concepts, embeddings, and relationships that can later be searched and queried.

## What MindMesh Does

```text
Save → Understand → Connect → Retrieve → Ask → Discover
```

### Save

Save a URL or resource to your personal knowledge archive.

MindMesh currently supports resources such as:

* Articles and web pages
* GitHub repositories
* Documentation
* X posts
* LinkedIn posts
* YouTube resources
* Notes
* Other URLs

### Understand

When a resource is processed, MindMesh:

1. Fetches and extracts its content
2. Cleans the extracted text
3. Analyzes the content with an LLM
4. Extracts topics and concepts
5. Generates a summary
6. Splits the content into searchable chunks
7. Generates vector embeddings

### Connect

Extracted concepts and topics are connected to existing knowledge, forming a lightweight knowledge graph.

This allows the system to represent relationships between things you've learned rather than storing every resource independently.

### Retrieve

MindMesh supports semantic retrieval over the processed archive.

Instead of relying only on exact keyword matches, queries can retrieve conceptually related passages using embeddings and cosine similarity.

### Ask My Brain

Ask questions against your own saved knowledge.

The system retrieves relevant passages from the archive and uses them as context for an LLM-generated response.

If the archive does not contain enough relevant information, MindMesh is designed to say so rather than inventing an answer.

## Architecture

```text
                         ┌──────────────────┐
                         │     Frontend     │
                         │   React + Vite   │
                         └────────┬─────────┘
                                  │
                              REST API
                                  │
                         ┌────────▼─────────┐
                         │     Express      │
                         │      API        │
                         └───────┬──────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
        ┌───────────┐      ┌────────────┐     ┌─────────────┐
        │  MongoDB  │      │ OpenAI API │     │ Job Service │
        │           │      │            │     │             │
        └───────────┘      └────────────┘     └─────────────┘
              │                  │
              │            ┌─────┴─────┐
              │            │           │
              │          LLM       Embeddings
              │            │           │
              └────────────┴─────┬─────┘
                                 │
                         Knowledge Pipeline
                                 │
                    ┌────────────▼────────────┐
                    │ Resources → Chunks      │
                    │ Topics → Concepts       │
                    │ Embeddings → Retrieval  │
                    │ Relationships → Graph   │
                    └─────────────────────────┘
```

## AI / Knowledge Pipeline

A saved resource moves through the following pipeline:

```text
URL
 │
 ▼
Content Extraction
 │
 ▼
Cleaning
 │
 ▼
LLM Analysis
 │
 ├── Summary
 ├── Topics
 └── Concepts
 │
 ▼
Chunking
 │
 ▼
Embeddings
 │
 ▼
MongoDB
 │
 ├── Semantic Search
 ├── Ask My Brain
 ├── Knowledge Graph
 └── Knowledge Gaps
```

The system also maintains fallback paths for development and provider failures, including lexical retrieval when vector embeddings are unavailable.

## Tech Stack

### Frontend

* React
* Vite
* JavaScript
* CSS

### Backend

* Node.js
* Express.js
* REST APIs
* JWT authentication
* bcrypt
* Nodemon

### Database

* MongoDB
* Mongoose

### AI

* OpenAI API
* `gpt-4o-mini`
* `text-embedding-3-small`
* Vector embeddings
* Cosine similarity
* Retrieval-augmented generation (RAG)

### Development

* Git / GitHub
* Docker
* Postman
* Vitest
* Cursor

## Authentication

MindMesh uses JWT-based authentication with user-scoped data access.

The email verification flow supports:

```text
Register
   ↓
Unverified account
   ↓
OTP
   ↓
Email verification
   ↓
JWT authentication
   ↓
Protected resources
```

OTP handling includes:

* Expiration
* Invalid-code detection
* Replacement on resend
* Previous-code invalidation
* Verification before login
* Development-mode delivery for local testing

## Knowledge Graph

MindMesh maintains relationships between topics and concepts extracted from the user's resources.

The graph allows the application to move beyond:

```text
Resource A
Resource B
Resource C
```

toward:

```text
Resource A
    │
    ├── Concept X
    │      │
    │      └── Concept Y
    │
    └── Topic Z
           │
           └── Resource C
```

The frontend exposes these relationships through an interactive concept graph.

## Ask My Brain

Ask My Brain follows a retrieval-first approach:

```text
User Question
      ↓
Query Retrieval
      ↓
Relevant Chunks
      ↓
Context Assembly
      ↓
LLM
      ↓
Grounded Answer + Sources
```

The model is given retrieved archive passages rather than unrestricted access to the entire knowledge base.

When relevant context cannot be found, the system can return an insufficient-context response instead of fabricating an answer.

## Project Structure

```text
MindMesh/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   └── services/
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── ARCHITECTURE.md
├── README.md
└── .gitignore
```

## Local Development

### Prerequisites

* Node.js 20+
* MongoDB
* OpenAI API key

### 1. Clone

```bash
git clone https://github.com/The-AarushiSingh/MindMesh.git
cd MindMesh
```

### 2. Start MongoDB

Using Docker:

```bash
docker run -d \
  --name mindmesh-mongo \
  -p 27017:27017 \
  -v mindmesh-mongo-data:/data/db \
  mongo
```

### 3. Configure the backend

Create:

```text
backend/.env
```

Example:

```env
PORT=5000

MONGO_URI=mongodb://localhost:27017/mindmesh

JWT_SECRET=your-long-random-secret
JWT_EXPIRES_IN=7d

AI_API_KEY=your-openai-api-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini

EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small

RETRIEVAL_TOP_K=5
RETRIEVAL_MIN_SIMILARITY=0.32

EMAIL_DELIVERY=development
```

`EMBEDDING_API_KEY` can be left empty when using the same OpenAI key configured through `AI_API_KEY`.

Never commit `.env` or API keys.

### 4. Start the backend

```bash
cd backend
npm install
npm run dev
```

The API runs on:

```text
http://localhost:5000
```

Health check:

```text
GET /api/health
```

### 5. Start the frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite development server will provide the frontend URL.

If required, configure:

```env
VITE_API_BASE=http://localhost:5000/api
```

## Testing

Backend tests:

```bash
cd backend
npm test
```

Frontend tests:

```bash
cd frontend
npm test
```

The project also contains integration and live-flow checks for authentication, MongoDB, resource processing, retrieval, and the AI pipeline.

## Current Status

MindMesh currently has a working local product loop covering:

* JWT authentication
* Email verification flow
* Resource ingestion
* Content extraction and cleaning
* LLM-based resource analysis
* Chunking
* Vector embeddings
* Semantic retrieval
* Grounded AI questions
* Knowledge graph generation
* Knowledge-gap detection
* User-scoped data access
* Development email verification
* AI/provider fallbacks
* Automated tests and integration checks

### Production Readiness

The application is currently **pre-production**.

Before a public deployment, the remaining work includes:

* Hosted MongoDB
* Public HTTPS API
* Static frontend deployment
* Production environment variables and secrets
* Restricted CORS
* Authentication/resource rate limiting
* AI usage limits
* Production email provider with a verified sender domain

The current background job system intentionally runs inside a single Node.js process. MindMesh is designed around a single API instance for its current scale rather than introducing unnecessary distributed infrastructure.

## Design Decisions

### Why MongoDB?

The application stores several related but flexible entities — resources, chunks, concepts, topics, knowledge gaps, and relationships. MongoDB provides a straightforward document model while keeping the initial architecture simple.

### Why embeddings?

Keyword search breaks down when the query and the stored knowledge use different wording.

Embeddings allow MindMesh to retrieve conceptually related content rather than requiring exact keyword matches.

### Why a single Node process?

The current goal is a reliable, understandable system rather than distributed infrastructure for its own sake.

The in-process queue is sufficient for the current workload. Resources left in `saved` or `processing` state are recovered when the API starts.

### Why RAG?

Ask My Brain should answer from **the user's knowledge**, not from the model's general knowledge alone.

Retrieval provides the relevant evidence before generation.

## Roadmap

* [x] Authentication
* [x] Email verification
* [x] Resource ingestion
* [x] AI resource analysis
* [x] Chunking
* [x] Embeddings
* [x] Semantic retrieval
* [x] Grounded Q&A
* [x] Knowledge graph
* [x] Knowledge-gap detection
* [x] Automated testing
* [ ] Production deployment
* [ ] Production email delivery
* [ ] Rate limiting
* [ ] AI usage quotas
* [ ] Password reset
* [ ] Improved knowledge-gap detection
* [ ] More robust YouTube/content extraction
* [ ] Scalable vector indexing when the archive requires it

---

## Why I Built This

MindMesh started from a simple problem:

> I save far more information than I actually revisit.

Bookmarks, posts, documentation, articles, and videos disappear into disconnected folders and browser tabs.

MindMesh is an attempt to build something different — a system that doesn't just **store what I saved**, but tries to understand **what I learned**, how different pieces of knowledge connect, and what I might be missing.

It is also a hands-on exploration of building AI-powered backend systems from the ground up: ingestion, processing pipelines, embeddings, retrieval, RAG, authentication, background jobs, databases, and production deployment.
