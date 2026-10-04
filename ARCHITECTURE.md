# MindMesh architecture

MindMesh is a single Node.js API and a React client, backed by MongoDB. Expensive work leaves the request path through an in-process queue.

```
React UI
  → Express API
    → services
      → MongoDB
    → in-process queue
      → fetch / extract
      → analysis
      → embedding
      → knowledge rebuild
```

## Product flow

Save a resource. The API validates it, stores it as `saved`, and enqueues processing. The worker marks it `processing`, then `processed` or `failed`. Processed resources update topics, concepts, co-occurrence links, and gap records. Search and Ask My Brain read processed resources for the authenticated user. The gaps view recommends neighboring concepts the archive does not cover.

## Data model

- **User** — name, email, hashed password.
- **Resource** — owner, optional URL, type, note or extracted content, summary, topics, concepts, processing status, error, analysis source, embedding source. Embeddings are stored on the document and excluded from normal queries.
- **Topic** and **Concept** — one document per user and normalized name. Each points at the resources that mention it and at co-occurring entities.
- **KnowledgeGap** — a missing or thin neighbor of something the user has saved, with the score inputs, a short explanation, and a recommended path.

Indexes: user + created time, user + status, and a unique user + URL index for non-empty URLs. Topics and concepts are unique per user and normalized name.

## Ingestion

1. Reject malformed URLs, non-HTTP schemes, credentialed URLs, and private or local hosts.
2. Persist the resource and return.
3. Fetch content by type:
   - GitHub: repository description and README from the public API.
   - YouTube: oEmbed title and author. No transcript.
   - Notes: the text the user wrote.
   - Other URLs: HTML with scripts and styles removed.
4. Keep a bounded amount of text. If a site returns nothing readable, the resource becomes `failed` and stores the error.
5. Retry sets the status back to `saved` and enqueues the job again. A resource already marked `processing` cannot be queued twice from the API.

The queue is an array in the API process, drained one job at a time. On startup, resources left in `saved` or `processing` are enqueued again. This survives a process restart. It does not coordinate multiple API processes. Run one API process.

Deleting a resource removes it and rebuilds that user's topics, concepts, and gaps from the remaining processed resources.

## Analysis

`analyzeResourceContent` calls an OpenAI-compatible chat endpoint when `AI_API_KEY` is set. The reply must be JSON. Strings are trimmed, unknown difficulty values are dropped, and lists are deduplicated before they are stored.

If the key is missing, the request fails, or the JSON is empty or invalid, the service stores a heuristic result:

- summary: the first sentences of the cleaned text
- concepts and topics: matches against the fixed vocabulary in `backend/src/services/vocabulary.js`, plus frequent words for topics

`analysisSource` is `provider` only when the model response was accepted. Heuristic output is `heuristic`. Empty content is `unavailable`.

## Chunks

`chunkText` splits cleaned content into deterministic passages of about 900 characters with a short overlap, capped at 40 chunks. Each chunk belongs to one user and one resource and keeps its position.

## Embeddings and retrieval

`generateEmbedding` calls the embeddings endpoint when `EMBEDDING_API_KEY` or `AI_API_KEY` is set. A failure leaves `embeddingSource` as `unavailable` and does not invent a vector. Vectors are stored on chunks, not only on the resource. The first successful vector is also kept on the resource for reference.

`searchUserKnowledge` is what search and Ask My Brain call:

- If the query embeds and the user has chunk vectors, hits are cosine similarity against that user's chunks only. Results are labeled `embedding`. One resource cannot fill the whole list. Hits below `RETRIEVAL_MIN_SIMILARITY` (default 0.32) are dropped.
- If embeddings are missing or the provider fails, hits are keyword overlap on that user's chunks, labeled `lexical-fallback`.

Queries always include the user id. A processed resource from another user cannot match. There is no separate vector database.

## Ask My Brain

The question is embedded or matched with the same retrieval function. Weak matches are dropped. The remaining resources are the only context.

With an AI key, the model is instructed to answer from that context and return source ids. Ids that were not retrieved are discarded. An insufficient answer returns no sources.

Without an AI key, the response quotes the retrieved titles and summaries and sets `answerSource` to `heuristic`. If the question names a vocabulary concept that is not in those resources, the answer says the archive does not contain enough on that concept.

## Knowledge graph

MongoDB stores the graph. There is no graph database.

After processing or deletion, MindMesh rebuilds the user's topics and concepts from processed resources:

- the same normalized name updates one entity
- concepts mentioned in one resource link to each other (`co_occurs`)
- resources link to the topics and concepts they mention

The exploration API returns nodes and edges. The Knowledge page draws those nodes and edges in an SVG. Selecting a concept shows its related concepts and saved resources. The same response still includes the concept list under the graph.

## Gap detection

Gaps are not a model brainstorm. They are neighbors in the curated map `CONCEPT_GRAPH` that the user has not developed.

Coverage uses only stored counts:

```
coverage_score =
  0.55 * min(resourceCount, 4) / 4
+ 0.15 * min(conceptCount, 6) / 6
+ 0.15 * min(graphConnections, 6) / 6
+ 0.15 * recencyFactor
```

`recencyFactor` is 1 within 30 days, 0.5 within 90, 0.2 within 180, and 0 after that.

Bands:

| Score | Band |
| --- | --- |
| no resources | unexplored |
| 0.75 and above | well explored |
| 0.50 to 0.75 | developing |
| below 0.50, with at least one resource | underexplored |

A gap is emitted when a saved concept has a map neighbor that is underexplored or unexplored. The explanation cites the anchor's resource count, band, and score, and states that the neighbor comes from the knowledge map. The learning path is the shortest path on that map. Covered steps are steps the user has saved. Other steps are marked recommended. This is a suggestion, not a claim about what the user must learn.

The map is hand-written around RAG, retrieval, embeddings, agents, and knowledge graphs. Concepts outside that map still appear in the archive, but they do not invent gaps. An empty archive produces no gaps.

`confidence` is `anchorScore * (1 - neighborScore)`, capped at 0.95. It orders gaps. It is not a probability that the user lacks the skill.

## Auth and isolation

Passwords are hashed with bcrypt. Protected routes require `Authorization: Bearer`. A JWT is issued only after `emailVerified` is true. New users start unverified. The verification code is a 6-digit value stored as a bcrypt hash, expires after 10 minutes, and is marked consumed after a successful check so it cannot be reused. Resend replaces the hash and is limited to one request per 60 seconds. Five wrong codes lock verification until a new code is issued. Login with the right password on an unverified account returns 403 and no token. A token minted any other way is still rejected by the auth middleware while `emailVerified` is false. Accounts created before this field existed are treated as verified.

Email goes out through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set, unless `EMAIL_DELIVERY=development`. Development mode does not send mail. It returns `devCode` and logs the code. That is not real delivery.

Resource, search, ask, graph, and gap queries filter on `req.user._id`. A valid id from another user returns 404. Search results whose `user` does not match the caller are dropped even if they were passed into the retrieval function.

## Errors and logs

JSON logs include an event name, duration for processing and provider calls, and the error message. They do not include secrets or document bodies. Provider failures, embedding failures, fetch failures, and job failures are logged. Processing never reports success when the fetch or analysis step threw.

Request bodies are limited to 1 MB. Unknown routes return JSON. Invalid JSON returns 400.

## Failure behavior

| Failure | Result |
| --- | --- |
| Private or invalid URL | 400, nothing stored |
| Fetch timeout, block, or empty page | resource `failed` with `error` |
| Duplicate URL for the same user | 409 |
| AI timeout or bad JSON | heuristic analysis, logged |
| Embedding failure | resource still processed, lexical retrieval |
| Delete during processing | job stops if the document is gone |
| Process crash | startup requeues `saved` and `processing` resources |
| Second queue entry for the same id | ignored while the first is queued |

## Not in this version

Review scheduling, email, a separate worker fleet, a vector index, and a graph database are extension points. Retrieval is already behind one function. The queue can later be replaced by a real broker without changing the processing steps.
