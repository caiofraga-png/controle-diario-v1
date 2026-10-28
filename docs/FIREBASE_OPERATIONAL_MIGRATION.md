# Operational persistence migration plan

Status: design contract for the feature branch; not yet wired into the application.

This plan is intentionally additive. The current Drive-backed repository remains the runtime source until the Firestore adapter and UI flow are integrated and validated. Do not remove Drive compatibility or change `main` as part of this design step.

## Existing behavior that must be preserved

The current implementation in `src/web/dataRepository.ts` and `src/web/calendarHistoryService.ts` defines these behaviors:

- Configuration consists of tasks, profiles, email templates/global email selections, and layout; it is validated as schema version 1 and cross-checked for valid task/profile/email references.
- Calendar data contains special dates (days off and holidays).
- The current expediente is nullable and contains a date, profile snapshot, task/email completion marks, observations, and creation/update timestamps.
- Closing an expediente creates a completed historical record and clears current/previous state. The existing close flow also attempts recovery when a previous write appears to have completed already; that duplicate-recovery behavior must be retained.
- History is versioned. Errata creates a new version rather than overwriting the original and may change only completion marks and observation. Task structure, task text/link/roteiro, email content, and email identity remain unchanged.
- Calendar history derives completed dates from the existence of history records.
- The existing task and importer business rules are outside the scope of this storage migration.

## Proposed Firestore storage mapping

All private records are scoped under the authenticated Firebase UID. A UID is the stable identity; email, Login, Setor, and Contato are mutable attributes and must not be used as ownership keys.

| Current Drive concept | Proposed Firestore location | Notes |
|---|---|---|
| Task/profile/email/layout configuration files | `users/{uid}/configuration/{documentId}` | Keep the current schemaVersion and existing validation. First login must not copy another user's configuration automatically. |
| Special calendar dates | `users/{uid}/calendar/{documentId}` | Preserve special-date semantics; use bounded documents rather than one growing document. |
| Current expediente | `users/{uid}/operational/currentState` | Store the current `EstadoAtual` payload plus owner UID and timestamps. |
| Previous/in-progress recovery snapshot | `users/{uid}/operational/previousState` | Preserve the current recovery semantics until the close operation is migrated and tested. |
| Durable history versions | `users/{uid}/operational/history_{date}_R{version}` | Store each complete `RegistroHistorico` version as its own document. Document ID must be deterministic so retries can detect a prior write. |
| Shared managerial card index | `Expediente/{ownerUid}_{date}` | One current index card per owner/date; contains owner UID and assignment snapshot. It is an index only, not the authoritative history. Errata should update the card's latest-version metadata, not replace the personal history. |
| Useful links | `users/{uid}/usefulLinks/{documentId}` | Separate from expediente state and configuration. |

These are proposed IDs and must be implemented consistently in the repository, Firestore rules, and queries. If a collision-safe encoding is required for a UID/date/version, centralize it in one helper instead of constructing IDs throughout the UI.

## Historical organizational assignment

At the moment an expediente is completed, read the approved user's current organizational profile and the matching sector/contact names, then save a frozen snapshot containing:

- Firebase UID;
- Login and Agente;
- Setor ID and name;
- Contato ID and name.

Write the same snapshot into the authoritative history record and the corresponding `Expediente` index. A later profile transfer must not rewrite old snapshots. A current in-progress state should not be assigned a final historical snapshot until the business flow defines the correct moment; if a start-time snapshot is needed later, store it separately from the completion-time snapshot.

## Safe write sequence for completing an expediente

The migrated close operation must be retry-safe and preserve the existing recovery behavior:

1. Validate the current state and configuration with the existing validation functions.
2. Determine the deterministic history document ID for the next version and check for an already completed record for this date/expediente before creating a duplicate.
3. Capture the assignment snapshot from the approved profile and organizational catalogs.
4. Write the full history record and the denormalized `Expediente` index as a coordinated Firestore batch/transaction where the operation's read/write constraints permit it.
5. Verify that the expected durable record can be read back.
6. Clear current and previous state only after the durable write is confirmed.
7. If the client loses connection during the write, the next attempt must detect and recover the already-saved record instead of creating a second completion.

A Firestore batch is atomic for writes but does not itself make arbitrary pre-write reads atomic. Use a transaction when the decision to create a version depends on reads that must be protected from races. If transaction limits or existing data shape prevent that, document the idempotency strategy and test concurrent retries.

## History and errata

- The authoritative history remains under the owner's UID.
- A new errata is a new version with `origemVersao` pointing to the source version.
- Reuse the existing validation in `CalendarHistoryService.saveErrata`; do not relax it as part of the backend swap.
- The index document may carry the latest version and summary fields for managerial cards, but must not contain or replace the full history.
- List history with bounded queries and pagination; do not load every historical record into memory at startup.

## Authorization and query constraints

- Employee access to private configuration, calendar, current state, and history is restricted to their own UID.
- Admin read access is for oversight only; it must not grant write/delete access to another user's operational records.
- A supervisor can read only index records allowed by the active Firestore policy. The first version uses the current sector as the baseline, but future filters must be backed by server-enforced policy rather than UI filtering.
- Every query must be compatible with Firestore Rules. A client-side `where` filter is not itself an authorization boundary.
- The index's `sectorId`, `contactId`, `login`, `agent`, `ownerUid`, and status/date fields must agree with the stored snapshot and authoritative record.
- Avoid exposing arbitrary write access to identity fields, role, supervisor flag, or approval status.

## Required validation before switching the runtime

1. Unit/build checks for schema conversion and existing validation.
2. Firestore Emulator tests for own-user read/write, cross-user denial, admin read-only oversight, supervisor same-sector read, supervisor other-sector denial, and denied edits/deletes of other users' records.
3. Complete expediente: success, network interruption, retry after success, and no duplicate history/index card.
4. Errata: valid mark/observation edit creates a new version; changing task structure, roteiro, links, email content, or email identity is rejected.
5. Calendar: special dates and completed-date indicators match the existing behavior.
6. User transfer: old records retain their original Setor/Contato snapshot while new records use the new assignment.
7. Multi-user isolation: two users can work independently on the same date without overwriting each other's current state, configuration, calendar, or history.
8. End-to-end browser test using a real Firebase test project before deployment. CI compilation alone does not prove rules or runtime correctness.

## Migration boundary

No production Drive data is copied or deleted by this plan. Historical records remain in the current Drive until a separately approved migration procedure evaluates ownership, authorship, duplicate dates, versions, and assignment snapshots. Do not bulk-import historical records without that review.
