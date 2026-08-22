# Berossus

Corpus-building and retrieval pipelines for domain-specific LLM tooling.

**Version:** 0.3.0-beta  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D

## Browser edition

The static web port provides a complete local corpus workflow without requiring a model download:

```text
document ingestion
SHA-256 document deduplication
configurable chunking + overlap
SHA-256 chunk deduplication
deterministic hashed lexical vectors
cosine + lexical retrieval
retrieval evaluation
JSONL dataset export
workspace export/import
```

The browser vectorizer is deliberately labeled as a deterministic baseline.

The native stack remains the semantic-embedding path:

```text
PyTorch
Transformers
SentenceTransformers
FAISS
```

## Evaluation

Evaluation records use:

```json
{
  "query": "example query",
  "expectedTitle": "expected-source.md"
}
```

Metrics:

```text
hit@k
MRR
```

## Deployment

Extract directly into:

```text
/projects/software/berossus/
```

## JavaScript API

```javascript
window.Berossus
Berossus.addDocument(title, text, source)
Berossus.rebuild()
Berossus.search(query, k)
Berossus.workspace()
Berossus.getState()
```
