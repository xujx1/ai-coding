# Activity Hit Preview Demo Fixture

This fixture is a recorded real run for the activity hit preview case.

- Source run: `PDRbY_AI59`
- Display name after auto injection: `活动命中预览 Demo`
- Input MRD: `activity-hit-preview-mrd.md`
- Projects: `marketing`, `marketing-admin`
- Workflow layout: `dynamic-fanout`
- Branches: backend-only `marketing`, backend/frontend/E2E `marketing-admin`

The server copies `run/` into `runtime-projects/runs/<newRunId>` on startup when `AI_CODING_AUTO_DEMO` is enabled. The copy process rewrites run IDs and absolute paths; do not edit runtime copies when updating this fixture.
