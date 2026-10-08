# Gimbal documentation

**Start here**

- [Getting started](getting-started.md): install, init, doctor, connect your agent, first test, CI.
- [Agent guide](agent-guide.md): what your coding agent is told to do (the same text as the skill it loads).

**Concepts**

- [How it works](concepts/how-it-works.md): grounding, healing, repair, scoring, verification.
- [Spec format](concepts/spec-format.md): the JSON test format, the YAML DSL and the assertions.
- [Repairs](concepts/repairs.md): proposals, abstentions, accept and reject, CI behaviour.
- [Page snapshots](concepts/page-snapshots.md): what `getPage` returns and what it does not.
- [Determinism](concepts/determinism.md): what is pinned and what is not.

**Reference**

- [CLI](reference/cli.md) · [MCP tools](reference/mcp-tools.md) · [Configuration](reference/configuration.md) · [REST API](reference/rest-api.md)

**Project**

- [Architecture](architecture.md)
- [Evidence](evidence.md): how healing is measured, and the numbers.
- [Releasing](releasing.md) (maintainers)
- [Decision records](adr/): [001 no model at run time](adr/ADR-001.md) · [002 spec, grounding, healing, repair](adr/ADR-002.md) · [003 TypeScript on Node](adr/ADR-003.md) · [004 page snapshots](adr/ADR-004.md) · [005 repairs](adr/ADR-005.md)
