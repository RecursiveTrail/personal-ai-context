
## Phase 0 — Lock the product foundation

### 1. Define the new product model

Decide what the system considers a piece of "memory":

* Personal context
* Knowledge
* Project
* Decision
* Experiment
* Lesson
* Question
* Resource
* Goal

**Deliverable:** one canonical data model.

### 2. Define the source-of-truth format

Keep your current local-first approach.

Decide:

* Markdown/YAML as canonical storage
* Folder structure
* Metadata schema
* IDs
* Relationships
* Versioning

**Deliverable:** stable file/data specification.

### 3. Refactor current code around the new model

Don't add features yet.

Separate:

```text
/core
/storage
/context
/knowledge
/projects
/learning
/mcp
/ui
```

**Deliverable:** existing V1 still works, but the codebase is ready for expansion.

---

# Phase 1 — Turn Context into a Knowledge System

This is the most important phase.

### 4. Build Knowledge Capture

Extend your existing capture UI so users can create:

* Note
* Lesson
* Concept
* Decision
* Experiment
* Question
* Resource

Keep the UX extremely simple:

> **Capture something → AI helps structure it.**

Don't build a complicated editor.

---

### 5. Build AI Knowledge Structuring

Given:

> "Tried HNSW today. Seems faster but memory usage looks higher."

AI converts it into structured knowledge:

```text
Type: Experiment

Topic: HNSW

Observation:
...

Hypothesis:
...

Open questions:
...
```

Allow the user to edit before saving.

**Deliverable:** messy input → structured knowledge.

---

### 6. Build Knowledge Library

Create the basic library:

```text
Knowledge
├── All
├── Concepts
├── Decisions
├── Experiments
├── Lessons
├── Questions
└── Resources
```

Add:

* Search
* Tags
* Project filter
* Date filter
* Type filter

**Deliverable:** user can actually manage their accumulated knowledge.

---

# Phase 2 — Connect Knowledge

### 7. Build Relationships Between Knowledge

Allow:

```text
Note A
   ↓
related to
   ↓
Note B
```

Support relationships like:

* related to
* derived from
* contradicts
* part of
* supersedes
* experiment for

Initially these can simply be metadata references.

---

### 8. Build "Related Knowledge"

When opening a knowledge item:

```text
HNSW

Your knowledge
──────────────

...

Related
──────────────

• Vector databases
• RAG experiment
• ANN search
• Qdrant decision
```

AI can suggest relationships, but user should be able to accept/reject them.

---

### 9. Build Knowledge Search

Start with **normal full-text search**.

Then add:

* semantic search
* metadata filtering
* hybrid search
* relevance ranking

Don't start with vector search just because it's an AI product.

**Deliverable:**

> "authentication problem"

can find relevant knowledge even when the exact words don't match.

---

# Phase 3 — Upgrade MCP

Now your knowledge system is useful enough to expose.

### 10. Expand MCP Server

Start with:

```text
search_knowledge
get_knowledge
```

Then:

```text
find_related
get_project_context
get_decisions
get_experiments
get_recent_knowledge
get_open_questions
```

Keep the MCP layer thin.

It should call your **knowledge service**, not directly manipulate the database/files.

---

### 11. Add `remember()`

This should be one of the first genuinely exciting features.

From Cursor:

> "Remember that this API requires signature verification before parsing."

AI → MCP → Knowledge System.

The system creates a draft memory.

User approves.

**Deliverable:**

```text
AI session
    ↓
remember()
    ↓
structured memory
    ↓
user approval
    ↓
personal knowledge
```

---

### 12. Test the Real Developer Workflow

Don't move on until this works beautifully:

```text
Learn something
       ↓
Capture it
       ↓
Later open Cursor
       ↓
Ask AI about it
       ↓
MCP retrieves it
       ↓
AI uses your personal knowledge
```

This is your first major product milestone.

---

# Phase 4 — Projects Become First-Class

This is where your system gets much more useful for developers.

### 13. Build Project Context

Create:

```text
Project
├── Description
├── Goals
├── Architecture
├── Decisions
├── Experiments
├── Problems
├── Lessons
└── Related knowledge
```

---

### 14. Add Project-Aware MCP

Now Cursor can ask:

> "What do I know about this project?"

And retrieve:

* architectural decisions
* previous problems
* experiments
* relevant notes
* unresolved questions

---

### 15. GitHub Integration

Don't do this too early.

Once project context works manually, add:

* repositories
* commits
* PRs
* issues
* README/docs

Initially, **don't embed the entire repository blindly**.

Extract meaningful events:

```text
Commit
PR
Architecture change
Bug fix
Decision
```

This keeps your knowledge base useful instead of becoming a giant code dump.

---

# Phase 5 — Automatic Memory

Now reduce the amount of manual work.

### 16. Build "End of Session" Capture

At the end of an AI/coding session:

> **What did you learn today?**

AI proposes:

```text
3 Lessons
2 Decisions
1 Open Question
1 Experiment
```

User reviews:

**Save selected**

---

### 17. Build URL/Article Capture

User pastes:

> https://...

System:

```text
Fetch
 ↓
Extract
 ↓
Summarize
 ↓
Identify concepts
 ↓
Connect to existing knowledge
 ↓
Save
```

This is your first step toward passive knowledge acquisition.

---

### 18. Add Voice Capture

Eventually:

> "Today I learned that..."

Voice → transcription → structuring → knowledge.

This is especially useful because people are much more willing to **talk for 60 seconds** than write a perfect note.

---

# Phase 6 — Learning Engine

Only now would I build the learning features from your original PRD.

### 19. Build Knowledge Gap Detection

Analyze the knowledge graph.

Example:

```text
RAG

✓ Embeddings
✓ Chunking
✓ Vector search
✓ Hybrid search
△ Reranking
✗ Evaluation
✗ Production monitoring
```

Generate:

> "Your next useful topic is RAG evaluation."

---

### 20. Build Learning Goals

User enters:

> "I want to become good at production RAG."

System analyzes existing knowledge first.

Then creates:

```text
Already know
────────────
Embeddings
```
