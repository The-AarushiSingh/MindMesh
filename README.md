# MindMesh

MindMesh turns things you save — articles, repositories, videos, notes — into a personal knowledge archive. It extracts concepts, connects them to what you already saved, lets you ask questions against that archive, and points out neighboring ideas you have not covered.

The core loop is save, understand, connect, retrieve, ask, and discover.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Background work: an in-process queue. Job state lives on the resource document, so a restart can resume saved or processing items.
- AI: optional OpenAI-compatible chat and embedding APIs. Without keys, analysis and retrieval use explicit local fallbacks.

This is a modular monolith. There is no separate worker service, vector database, or graph database.

## Local setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Start MongoDB at `mongodb://localhost:27017/mindmesh`.
3. Install and start the API:

```bash
cd backend
npm install
npm run dev
```

4. Install and start the frontend:

```bash
cd frontend
npm install
npm run dev
```

The UI expects the API at `http://localhost:5000/api`. Override it with `VITE_API_BASE` if needed.

## Environment variables

Set these in `backend/.env`.

| Variable | Purpose |
| --- | --- |
| `PORT` | API port. Default `5000`. |
| `MONGO_URI` | MongoDB connection string. |
| `JWT_SECRET` | Signing secret for auth tokens. |
| `JWT_EXPIRES_IN` | Token lifetime. Default `7d`. |
| `AI_API_KEY` | Optional key for structured analysis and Ask My Brain. |
| `AI_BASE_URL` | Chat completions base URL. Default `https://api.openai.com/v1`. |
| `AI_MODEL` | Chat model. Default `gpt-4o-mini`. |
| `EMBEDDING_API_KEY` | Optional embeddings key. If empty, `AI_API_KEY` is used for embeddings. |
| `EMBEDDING_BASE_URL` | Embeddings base URL. |
| `EMBEDDING_MODEL` | Embedding model. Default `text-embedding-3-small`. |
| `EMAIL_DELIVERY` | `development` returns the verification code in the API response and does not send mail. `provider` sends through Resend. |
| `RESEND_API_KEY` | Resend API key. Required for real email. |
| `EMAIL_FROM` | From address Resend is allowed to use, for example `MindMesh <verify@yourdomain.com>`. |

If `EMAIL_DELIVERY` is unset and both Resend variables are set, mail is sent through Resend. If they are unset outside production, delivery stays in development mode. In production with no provider configured, registration still creates the account and reports that the email could not be sent. No code is included in that response.

Local accounts created before verification existed do not have `emailVerified: false`, so they can still log in. Every new registration must verify.

`GET /api/health` reports which mode is active: `provider` or `heuristic` for analysis, and `provider` or `lexical-fallback` for retrieval. It does not report secret values.

## What is real

- Register, login, and JWT protection. Passwords are hashed with bcrypt.
- New accounts stay unverified until a 10-minute code is confirmed. Login does not issue a JWT before that. Codes are stored as bcrypt hashes.
- Resources, concepts, topics, search, Ask My Brain, and gaps are scoped to the signed-in user.
- Saving a URL or note returns immediately. Processing runs on the in-process queue.
- Processing states are `saved`, `processing`, `processed`, and `failed`. Failures keep an error message and can be retried.
- Successful processing stores a summary, topics, concepts, and, when an embedding key is configured, a vector.
- Concept and topic names are normalized per user, so repeated mentions converge on one entity.
- Observed graph edges mean two concepts appeared in the same saved resource.
- Gap recommendations use a documented coverage score plus a curated map of neighboring concepts. The formula is in `ARCHITECTURE.md`.
- Ask My Brain retrieves only that user's processed resources. If an AI key is set, the model must answer from that context, and returned sources are checked against the retrieved ids. Without a key, the answer quotes saved summaries and is labeled `heuristic`.
- Search without an embedding provider is keyword overlap. It is not described as semantic search.

## What uses fallback logic

- No `AI_API_KEY`: summaries, topics, and concepts come from sentence extraction and a fixed concept vocabulary. `analysisSource` is `heuristic`.
- The provider errors, times out, or returns invalid JSON: the same heuristic result is stored, and the failure is logged. The record is not labeled as model output.
- No usable embedding: retrieval uses keyword overlap and `retrievalMode` is `lexical-fallback`.
- YouTube URLs store the public title and author only. Transcripts are not fetched. `contentSource` is `limited`.
- GitHub URLs use the public repository description and README. Other sites use readable HTML. Pages that require login or render only in the browser fail with a stored error.
- X and LinkedIn posts are saved as URLs, but those sites often block fetching.

## What is not built

- Review reminders and spaced repetition.
- A visual graph canvas. Knowledge is explored as concepts, connections, and linked resources.
- A distributed queue, vector database, graph database, or microservice split.
- Notifications.

## Scripts

```bash
cd backend && npm test
cd frontend && npm run build
```

Backend tests include unit coverage for analysis validation, retrieval fallback, and gap scoring, plus an integration test against a local `mindmesh_test` database. That integration test requires MongoDB on `127.0.0.1:27017`.

## Product flow

1. Save a URL or a note.
2. The queue fetches what it can, analyzes it, and embeds it when a provider is configured.
3. Topics and concepts are upserted for that user, and gaps are recalculated.
4. Search and Ask My Brain read only processed resources from that user.
5. The gaps view explains which neighboring concept is missing and shows a recommended path.
