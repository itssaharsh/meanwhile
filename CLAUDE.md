# AI use disclosure

This project was built with heavy AI assistance (Claude). The Convex backend scaffold,
schema, and pipelines were AI-generated from a written build plan, then reviewed and wired
by the author. External integrations (Windy, Firecrawl, OpenAI, AgentMail, Open-Meteo) use
their public APIs; keys live only in Convex environment variables, never in the repo.

Real vs simulated is documented in the README and the build plan.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
