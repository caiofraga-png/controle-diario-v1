# Leste - Controle Diário: Firebase schema (initial)

This document records the proposed Firestore layout. It is not a claim that a
Firebase project has been created or configured.

## Identity and organization

- `users/{uid}`: administrator-maintained organizational user profile.
  Fields include corporate email, Login, Agente, current Setor/Contato IDs,
  account status, role, and timestamps. The Firebase Authentication UID is
  the stable identity key.
- `organizationSectors/{sectorId}`: administrator-maintained sector catalog.
- `organizationContacts/{contactId}`: administrator-maintained contact catalog;
  each contact references its parent `sectorId`.
- `accessRequests/{uid}`: requests awaiting an administrator's decision.
- `settings/allowedDomains`: centrally managed list of permitted corporate
  email domains.
- `adminAudit/{auditId}`: append-only record of relevant administrative actions.

The initial administrator must be provisioned through a trusted, controlled
procedure. A browser client must never be able to assign itself the admin role.

## Per-user data

- `users/{uid}/configuration/{documentId}`: that user's own task/profile/email/
  layout configuration. New users start with an independent configuration;
  the current shared Drive configuration is not copied automatically.
- `Expediente/{expedienteId}`: shared, queryable index of expediente cards for
  future sector/contact oversight. Each document must include `ownerUid`,
  `date`, `status`, `sectorId`, `sectorName`, `contactId`, `contactName`,
  `login`, `agent`, and an assignment snapshot. The collection is intentionally
  defined now; Firestore does not physically retain an empty collection until
  the first document is written.
- `users/{uid}/operational/{documentId}`: optional private per-user source/history
  records if the final repository design needs them. The `Expediente` index must
  not replace the user's own durable history.
- `users/{uid}/calendar/{documentId}`: that user's calendar.
- `users/{uid}/usefulLinks/{documentId}`: that user's useful links.

The final document IDs and subcollection split must be reconciled with the
existing repository's actual read/write operations before connecting the UI.
Large histories should be paginated; avoid a single ever-growing document.

## Historical organizational snapshot

Every completed expediente must retain an assignment snapshot captured at
completion (and, if required by the business rules, when the expediente starts):
UID, Login, Agente, Setor ID/name, and Contato ID/name. A later organizational
change updates the user's current profile only; it must not rewrite past
expedientes.

## Authorization principles

- Authentication does not imply approval.
- Approved status and role are read from a trusted user record.
- Employees read/write only their own operational data.
- Administrators can read operational records for oversight, but cannot
  create/update/delete another user's operational records.
- A separate `isSupervisor` boolean is assigned only by an administrator.
  Supervisors may read expediente cards whose recorded `sectorId` matches
  their current sector; they cannot edit or delete another employee's records.
- The `Expediente` collection stores a historical snapshot of sector/contact,
  so later transfers do not rewrite the attribution of old cards.
- Only administrators can maintain user and organizational catalog records.
- Client-side role checks are for presentation only; Firestore rules enforce
  access control.
- The rules file is a starting point and must be emulator-tested against every
  intended operation before deployment. The access-request flow and domain
  allow-list check require final implementation and verification.
