# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Standing practice: on each release, move `[Unreleased]` to a dated `[X.Y.Z]`
section rather than letting it accumulate indefinitely.

## [Unreleased]

## [0.5.1] - 2026-10-02

### Changed

- Refreshed all npm dependencies; `vitest` and `@vitest/coverage-v8` moved to 5.0.1 together, and snapshot keys were regenerated for vitest 5 `$name` formatting.
- Aligned `biome.json` schema with Biome CLI 2.5.14.
- Routine Dependabot bumps (zod, vite, i18next, react-i18next, Docker GitHub Actions, and others) merged throughout September; auto-merge is now enabled for Dependabot PRs.

## [0.5.0] - 2026-08-10

### Changed

- Container base image names are now fully qualified for Podman.

## [0.4.2] - 2026-08-10

### Security

- Cleared the osv-scan gate.
- Forced `undici` to 7.29.0 to clear Dependabot alerts.

## [0.4.1] - 2026-07-26

### Security

- Bumped transitive dependencies to clear OSV-Scanner findings.

### Changed

- Dependency bumps including TypeScript 7, Vite 8.1, Vitest 4.1, Tailwind 4.3 and newer Docker/checkout GitHub Actions.

## [0.4.0] - 2026-06-28

### Added

- Debian Preseed target: section emitters, `late_command` builder, `scripts.earlyCommands` emitted as `preseed/early_command`, a Preseed format and `rawPreseed` override in the form with i18n keys, plus golden-snapshot tests.

### Fixed

- Host-only apt mirrors keep `/debian`; root-key recipe covered; CI and validator issues from review addressed.

## [0.3.0] - 2026-06-27

### Added

- Container image (Dockerfile) published to GHCR.
- Warn-on-intent cross-format field policy: fields that a target format cannot express are surfaced as warnings.

## [0.2.0] - 2026-06-27

First tagged release; the project was built the same day in five phases.

### Added

- `InstallSpec` model (Zod) with a Kickstart engine, an Ubuntu Autoinstall engine and a format toggle with the full form.
- Validation diagnostics, profiles and presets with opt-in draft autosave, and client-side `$6$` password hashing.
- i18n in English, French, German and Italian.
- Round-trip import of existing Kickstart and Autoinstall files with format detection, a fidelity diff and passthrough buckets so unmodelled keys are preserved.

[Unreleased]: https://github.com/fjacquet/linux-generators/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/fjacquet/linux-generators/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/fjacquet/linux-generators/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/fjacquet/linux-generators/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/fjacquet/linux-generators/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/fjacquet/linux-generators/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/fjacquet/linux-generators/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/fjacquet/linux-generators/releases/tag/v0.2.0
