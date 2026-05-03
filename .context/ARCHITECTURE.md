# Cloudbox Architecture

Cloudbox implements the paper loop as a Cloudflare app:

```txt
persona
  -> user profile
  -> filesystem policy + planned files
  -> dependency-ordered artifacts
  -> collaborators with private references
  -> multi-day simulation
  -> retrospective lessons
```

The public Worker owns the UI and API. D1 stores generated computers and run records. R2 stores artifact exports. Queues are used for longer simulation runs.

The seeded demo is intentionally complete so first load is useful before a user configures model access or waits for background work.
