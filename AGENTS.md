# Shopify app development

This app is scaffolded from a Shopify app template. See the README for framework-specific details.

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for all Shopify API and platform work. If missing, install it in the agent host per that page (or `npx skills add Shopify/shopify-ai-toolkit --list` for skill-compatible hosts) — do not add tooling to this repo.

## Working in this repo

- Merge your own PR with `gh pr merge <n> --merge` after tests pass and the demo is verified live, then delete the branch.
- Long sessions: do not ask the user to run `/clear`. Write the handoff, then continue in a background agent with fresh context.
- Stop for the user only for: a login code, posting anywhere public, or a decision you would have to guess.
