# Ecom Integration Tests

This repository stores long-lived cross-application integration tests for the demo ecom system.

It is a testing repository, not a business implementation application. Requirement ownership should not fan out implementation work to this repository. AI Testing can generate temporary scripts under `runtime-projects/runs/{runId}/artifacts/testing/...`; after review, accepted scripts can be promoted here.

## Layout

- `fixtures/`: scenario data templates.
- `src/data-builders/`: domain-specific test data builders.
- `src/runtime/`: service URL config and HTTP helpers.
- `tests/integration/`: executable cross-application tests.
- `reports/`: local test output, ignored by Git.

## Run

Start demo services first:

```bash
cd /Users/xu/IdeaProjects/ai-coding/demo/ecom
./scripts/init-db.sh
./scripts/build-all.sh
./scripts/start-all.sh
```

Then run tests:

```bash
cd /Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-integration-tests
npm test
```

Use `npm run test:live` in CI or pipeline execution when services must be reachable. Without `ECOM_REQUIRE_LIVE=1`, tests skip cleanly if the demo services are not running.

## Seed Data

Seed the default targeted-campaign stock guard scenario:

```bash
npm run seed
```

The seed flow writes data through public service APIs:

1. Product: create SKU and set sale status.
2. Inventory: create stock row and available quantity.
3. Marketing: create campaign that references the SKU.

Domain data builders live in `src/data-builders/domains.js` and can be reused by AI-generated test scripts.
