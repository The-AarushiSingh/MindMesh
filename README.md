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
│
```
