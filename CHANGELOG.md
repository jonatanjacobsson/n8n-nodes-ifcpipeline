# Changelog

All notable changes to `n8n-nodes-ifcpipeline` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.1] - 2026-04-20

### Added

- Self-tuning client-side rate limiter in `nodes/shared/GenericFunctions.ts`.
  One adaptive token bucket per gateway `baseUrl` is shared by every IFC\*
  node, every workflow and every concurrent execution inside a given n8n
  process, so workflows queuing many jobs cannot collectively exceed the
  gateway's real capacity. No UI, no configuration.
  - Starts at 80 req/s (well under the measured ~150 req/s end-to-end
    ceiling observed through Cloudflare), additively increases +1 req/s per
    second of sustained success, capped at 200 req/s.
  - Multiplicatively halves the rate (floor 2 req/s) on any `429` or `503`
    response, honouring a server-provided `Retry-After` header (numeric
    seconds or HTTP-date, clamped to 30 s).
  - Retries the request exactly once after pushback so a single transient
    `429` does not fail a workflow item.
  - Acquisitions are serialised on a per-bucket promise chain to keep
    refill/token accounting race-free under concurrent fan-out.

## [0.7.0] - 2026-04-19

This release aligns the package exclusively with the **object-storage (S3/MinIO)
variant** of [ifcpipeline](https://github.com/jonatanjacobsson/ifcpipeline).
The target deployment must run with `USE_OBJECT_STORAGE=true`. There is no
filesystem fallback — legacy filesystem deployments should stay on `0.6.x`.

### Breaking

- Removed the implicit filesystem-mode code paths. All paths travelling through
  these nodes are normalised to canonical S3 object keys (e.g.
  `uploads/model.ifc`, `output/csv/report.csv`).
- `IfcPipelineApi` credential no longer offers a Storage Mode selector; it is
  object-storage only.

### Added

- `Ifc2Peppol` node for converting IFC quantity take-offs into Peppol BIS 3.0
  invoice payloads.
- `storage_ref` convenience field on `IfcPipeline · uploadFile` responses, so
  downstream worker nodes can be wired without manual path massaging.
- `normalizeObjectKey` and `resolveStorageRef` helpers in
  `nodes/shared/GenericFunctions.ts`.
- Object-storage smoke-test workflow at
  `ifcpipeline-objectstorage/example n8n workflows/ObjectStorage_Smoke_Test.json`.

### Changed

- All worker-node placeholders now use bucket-relative S3 keys aligned with
  each worker's default output prefix (`output/csv/`, `output/ids/`,
  `output/json/`, `output/converted/`, `output/patch/`, `output/qto/`,
  `output/peppol/`, …).
- `getFiles` picker handles empty S3 responses gracefully (shows a hint rather
  than an error when the bucket is empty).
- `ifcPipelineApiRequestDownload` follows redirects so it can transparently
  consume presigned S3 URLs served by the gateway's `/download/{token}`.
- `deploy-local.sh` now targets `ifcpipeline-objectstorage` and restarts/starts
  the n8n service in that compose stack.
- README rewritten for object-storage-only usage with an S3-key reference
  table.

### Security

All findings below are in the **developer / CI toolchain** — the published
`dist/` has no runtime dependencies and `pnpm audit --prod` was, and still is,
clean. The overrides below eliminate the audit noise for contributors and
CI runners.

- Bumped `axios` override to `>=1.15.0` — addresses
  [CVE-2026-40175](https://nvd.nist.gov/vuln/detail/CVE-2026-40175)
  (prototype-pollution / CRLF header-injection gadget, CVSS 4.8) and
  [CVE-2026-25639](https://nvd.nist.gov/vuln/detail/cve-2026-25639)
  (`mergeConfig` DoS, CVSS 7.5).
- Bumped `lodash` override to `>=4.18.0` — addresses code-injection via
  `_.template` imports and prototype pollution in `_.unset` / `_.omit`.
- Added overrides for `follow-redirects` (`>=1.16.0`), `micromatch`
  (`>=4.0.8`), `picomatch` (`>=2.3.2`), `minimatch@3` (`>=3.1.4`) and
  `minimatch@9` (`>=9.0.7`), `brace-expansion@1` (`>=1.1.13`) and
  `brace-expansion@2` (`>=2.0.3`), and `flatted` (`>=3.4.2`) to close
  ReDoS / prototype-pollution advisories in the dev tree.
- Pinned `eslint-plugin-n8n-nodes-base` to `1.16.3` (lockstep with the ruleset
  the repo was authored against).

## [0.6.0] and earlier

See the git history and
[npm version page](https://www.npmjs.com/package/n8n-nodes-ifcpipeline?activeTab=versions)
for earlier releases.
