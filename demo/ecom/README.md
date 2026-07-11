# Ecom Dubbo Demo

This directory contains 14 independent Java Maven repositories for ecommerce domain validation.
The console under `console/` is managed as a separate frontend repository, so the local Git service manages 15 repositories in total.

## Services

- `ecom-product`: HTTP `4210`, Dubbo `4310`
- `ecom-trade`: HTTP `4211`, Dubbo `4311`
- `ecom-payment`: HTTP `4212`, Dubbo `4312`
- `ecom-aftersales`: HTTP `4213`, Dubbo `4313`
- `ecom-marketing`: HTTP `4214`, Dubbo `4314`
- `ecom-inventory`: HTTP `4215`, Dubbo `4315`
- `ecom-fulfillment`: HTTP `4216`, Dubbo `4316`
- `ecom-logistics`: HTTP `4217`, Dubbo `4317`
- `ecom-user`: HTTP `4218`, Dubbo `4318`
- `ecom-merchant`: HTTP `4219`, Dubbo `4319`
- `ecom-content`: HTTP `4220`, Dubbo `4320`
- `ecom-customer-service`: HTTP `4221`, Dubbo `4321`
- `ecom-finance`: HTTP `4222`, Dubbo `4322`
- `ecom-supply-chain`: HTTP `4223`, Dubbo `4323`
- `console`: frontend console

## Prerequisites

- Java 17+
- MySQL running locally
- Maven: `/Applications/IntelliJ IDEA CE.app/Contents/plugins/maven/lib/maven3/bin/mvn`

## Setup

```bash
cd /Users/xu/IdeaProjects/ai-coding/demo/ecom
./scripts/init-db.sh
./scripts/build-all.sh
./scripts/start-all.sh
open console/index.html
```

## Demo flow

```bash
./scripts/demo-full-chain.sh
./scripts/stop-all.sh
```

The trade service orchestrates other services through Dubbo direct URLs.

## Local Git service

The demo can manage the 14 service repositories plus the console repository through a lightweight local Git service. It follows the same basic shape as Harness Gitness: each working repository has a local bare remote under `.git-service/remotes`, and the service exposes repository operations through a small TS wrapper around Git.

```bash
cd /Users/xu/IdeaProjects/ai-coding

# Create local bare remotes and registry for all ecom-* repositories.
npm run ecom:git -- init

# Inspect all repositories.
npm run ecom:git -- status all

# Create the same branch in all 14 repositories.
npm run ecom:git -- branch all feature/local-demo

# Create requirement branches with the feature/{requirement}/{app} convention.
npm run ecom:git -- feature all REQ-2026-local-demo

# Commit and sync one repository.
npm run ecom:git -- commit ecom-product "Update product service"
npm run ecom:git -- push ecom-product
npm run ecom:git -- pull ecom-product

# Sync all repositories.
npm run ecom:git -- push all
npm run ecom:git -- pull all
```
