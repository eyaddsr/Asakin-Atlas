# Reconciliation report (generated — do not edit)

Snapshot: `audit-2026-11-22+ede16c74665f` · importer 1.0.0 · schema 1.0.0

## Source accounting

| Source | Rows in archive | Preserved in candidate |
|---|---|---|
| consolidated-systems.json | 31 | 31 audited systems |
| consolidated-integrations.json | 263 | 242 claims (181 inter-system, 4 intra-system, 56 with an unresolved end) |
| consolidated-field-mappings.json | 1290 | 1282 rows |

## Field-mapping link classes

| Class | Rows | Meaning |
|---|---|---|
| matched | 868 | integrationId equals one of the reporter's own integration ids |
| token_reference | 11 | free-text reference naming exactly one own integration id — needs review |
| multi_integration | 40 | reference names 2+ own integration ids (incl. ranges) — needs review |
| unmatched_reference | 140 | reference names no own integration id (flow description, "ALL", "none") |
| missing_integration_id | 223 | no integrationId in the source row |

Non-matched rows are listed in `missing-mapping-links.json`; they are never rendered as confirmed field exchanges.

## Graph derivation

- Channels: 180 (1 two-sided by endpoint match). Flows: 217.
- Systems: 48 (30 complete, 1 partial, 17 not audited incl. external providers / registry-only / SDK).
- Conflicts: 0. Review items: 121.

| Review item kind | Count |
|---|---|
| field_not_found_on_counterpart | 27 |
| normalization_differs_from_consolidator | 38 |
| unresolved_endpoint | 56 |

| Unresolved endpoint class | Count |
|---|---|
| any_granted_caller | 26 |
| end_user | 2 |
| indirect_dependency | 2 |
| multiple_systems | 2 |
| navigation_link | 3 |
| operator | 4 |
| scheduler | 1 |
| unknown | 13 |
| unrecognized | 3 |

| Claim evidence level (agent-reported) | Count |
|---|---|
| code_observed | 142 |
| production_verified | 35 |
| proposed | 3 |
| reported | 13 |
| runtime_verified | 3 |
| test_verified | 14 |
| unknown | 32 |

## Excluded / withheld content

- Secret-like values withheld: 2. Security-finding text withheld: 22.
- Not read at all: `_tools/` (scripts), `_raw/` transcripts, `audit-prompt.txt`, `registry-screenshots/`, `integration-discrepancies.md` (mixes integration reconciliation with restricted security findings), `tracking.csv`.
- Project inventory `creator` column (personal usernames) is not imported.
- Excluded by reviewed decision (`data/private/reviewed/decisions.json`): 7 systems, 21 claims, 8 field-mapping rows, 29 evidence records that only those claims referenced. See meta notes for the system keys.

## Warnings

- none
