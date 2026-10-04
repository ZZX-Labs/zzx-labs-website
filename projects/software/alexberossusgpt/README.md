<div align="center">
<img src="logo.png" alt="AlexBerossusGPT" width="240" height="240">

# AlexBerossusGPT


General-purpose **learning, teaching, and review assistant** for studying virtually any subject through structured lessons, source-grounded tutoring, quizzes, flashcards, active recall, and spaced repetition.


**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Python 3.11+ / FastAPI / FAISS · JavaScript / Local Retrieval

</div>


## What it does

- Helps a user learn or review **any subject or area of knowledge**
- Builds structured study plans from a subject, level, depth, and learning goal
- Imports local **TXT**, **Markdown**, and **JSON** study sources
- Accepts pasted notes and reference material
- Chunks and indexes sources locally in the browser
- Performs BM25-style lexical retrieval over indexed material
- Answers questions using source-grounded retrieved passages
- Provides Socratic review prompts
- Generates **cloze questions**
- Generates **short-answer questions**
- Grades quiz responses with exact and lexical-similarity checks
- Generates flashcards from definitions and salient source sentences
- Adds flashcards to a local **spaced repetition** queue
- Uses an SM-2-style review schedule
- Tracks quiz accuracy, study plans, review events, and due cards
- Exports and imports the complete learning workspace as JSON
- Optionally connects to **local Ollama**
- Optionally connects to a trusted compatible model proxy
- Keeps imported study sources local unless the user explicitly chooses an external model provider


## Install

### Native Python Edition

```bash
python -m venv .venv && . .venv/bin/activate
# Windows:
# .venv\Scripts\activate

pip install fastapi uvicorn sqlalchemy psycopg2 faiss-cpu numpy pydantic requests jinja2
```

If the native repository provides a `requirements.txt`, prefer:

```bash
pip install -r requirements.txt
```

### Web Edition

No JavaScript package installation is required.

Serve the project directory:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```


## Run (Web)

Deploy or serve:

```text
/projects/software/alexberossusgpt/
```

The browser workbench contains:

```text
Learn
Study Sources
Tutor
Quiz
Flashcards
Review
Progress
Model Provider
```


## Learn

Create a study plan by selecting:

```text
subject
current level
study depth
number of units
learning goal
```

AlexBerossusGPT constructs a sequence that includes:

```text
foundations
core concepts
methods
worked examples
connections
common errors
practice
synthesis
advanced structure
review
assessment
next directions
```

When study sources are indexed, the plan can incorporate relevant source documents.


## Study Sources

The browser edition accepts:

```text
.txt
.md
.markdown
.json
pasted text
```

Imported source content is read into browser memory and split into manageable chunks.

Default chunk size:

```text
~900 characters
```

Alternative chunk sizes can be selected from the interface.


## Local Retrieval

The browser uses a lightweight BM25-style lexical retrieval engine.

For query term `t` in chunk `d`:

```text
score(t,d) =
IDF(t)
×
TF(t,d) × (k1 + 1)
────────────────────────────────────────
TF(t,d) + k1 × (1 - b + b × |d| / avgdl)
```

Current constants:

```text
k1 = 1.5
b  = 0.75
```

This gives the static browser edition meaningful local retrieval without requiring FAISS or a server process.


## Tutor

The local tutor:

1. tokenizes the question;
2. retrieves the most relevant source chunks;
3. ranks them;
4. presents the retrieved passages transparently;
5. recommends an active-learning follow-up.

If no relevant local source exists, the local tutor says so rather than inventing unsupported subject facts.


## Optional Model Provider

Broader subject instruction can be supplied by an optional model backend.

### Local Ollama

Default example:

```text
http://localhost:11434
```

Model example:

```text
llama3.2
```

The web page calls:

```text
POST /api/generate
```

when the user explicitly enables Ollama.


### Compatible Proxy

A trusted server-side proxy can also be configured.

This is the recommended route for hosted models requiring API credentials.

Do not embed secret API keys directly into static browser JavaScript.


## Quiz Generation

The quiz engine generates:

```text
cloze questions
short-answer questions
mixed quizzes
```

Cloze questions replace a salient source term:

```text
Original:
"A blockchain is a distributed ledger."

Question:
"A _____ is a distributed ledger."
```

Short-answer questions are generated from definitional or explanatory source sentences where possible.


## Quiz Grading

Cloze items use normalized exact/containment matching.

Short-answer items use lexical overlap.

For token sets `A` and `B`:

```text
similarity =
|A ∩ B|
────────
max(|A|, |B|)
```

The grading result is intended for study feedback, not formal high-stakes assessment.


## Flashcards

Flashcards are generated from:

```text
definition sentences
important terms
salient explanatory sentences
```

Example:

```text
Front:
blockchain

Back:
A distributed ledger maintained by a network of participants.
```


## Spaced Repetition

Review scheduling uses an SM-2-style model.

Each card stores:

```text
repetitions
intervalDays
ease
dueAt
lastReviewedAt
```

Recall quality is graded:

```text
0  complete failure
1
2
3  difficult but recalled
4
5  perfect recall
```

For successful recall, the interval expands using the card's ease factor.

For failed recall, repetitions reset and the interval returns to one day.


## Progress

The browser tracks:

```text
study plans built
quiz attempts
correct answers
total questions
review events
review due
scheduled cards
reviewed today
```


## Workspace Export

The complete learning state can be exported as:

```text
zzx.alexberossusgpt.workspace.v1
```

The workspace contains:

```text
subject configuration
study plan
corpus
flashcards
review schedule
progress
```


---

## Directory layout

```text
alexberossusgpt/
├─ index.html
├─ style.css
├─ script.js
├─ alexberossusgpt.js
├─ corpus.js
├─ tutor.js
├─ quiz.js
├─ review.js
├─ hook.css
├─ hook.js
├─ manifest.json
├─ README.md
└─ logo.png
```


---

## JavaScript API

The primary browser module is:

```javascript
window.AlexBerossusGPT
```

Core methods:

```javascript
AlexBerossusGPT.addSource(title, text)
AlexBerossusGPT.search(query, limit)

AlexBerossusGPT.buildPlan(options)
AlexBerossusGPT.ask(question)

AlexBerossusGPT.generateQuiz(count, mode)
AlexBerossusGPT.generateFlashcards(limit)

AlexBerossusGPT.addReviewCards(cards)
AlexBerossusGPT.getDueReviews()

AlexBerossusGPT.setTutorProvider(provider, name)

AlexBerossusGPT.exportWorkspace()
AlexBerossusGPT.getState()
```

Local corpus/indexing is implemented in:

```javascript
window.AlexBerossusCorpus
```

Tutoring is implemented in:

```javascript
window.AlexBerossusTutor
```

Quiz and flashcard generation are implemented in:

```javascript
window.AlexBerossusQuiz
```

Spaced repetition is implemented in:

```javascript
window.AlexBerossusReview
```


---

## Privacy

The browser implementation is local-first.

By default, the page does not upload:

```text
study documents
notes
flashcards
quiz responses
review state
learning progress
```

Network access occurs only when the user explicitly enables:

```text
local Ollama
trusted model proxy
```


---

## Notes

The native project can use FastAPI, SQLAlchemy, PostgreSQL, and FAISS for persistent server-side indexing and retrieval.

The static browser edition replaces native FAISS with a lightweight lexical index so the learning workflow remains functional without a server.

For broader teaching beyond user-provided source material, connect an optional model backend.

For source-grounded study, the browser can work entirely without one.


---

## Usage quickstart

- **Choose subject**: `Learn` → enter subject, level, depth, and goal
- **Add sources**: `Study Sources` → import files or paste notes
- **Build plan**: `Learn` → `USE SOURCE CORPUS`
- **Ask questions**: `Tutor` → enter a question → `ASK`
- **Quiz yourself**: `Quiz` → choose question count → `GENERATE QUIZ`
- **Make cards**: `Flashcards` → `GENERATE FLASHCARDS`
- **Schedule review**: `ADD ALL TO REVIEW`
- **Review**: `Review` → grade recall from `0` to `5`
- **Save everything**: `Progress` → `EXPORT WORKSPACE`
