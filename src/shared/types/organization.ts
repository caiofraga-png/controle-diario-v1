/**
 * Organizational identity maintained by authorized administrators.
 * Authentication proves who signed in; this record determines the user's
 * approved company identity and current assignment.
 */
export type AccountStatus = "pending" | "approved" | "blocked" | "rejected";
export type UserRole = "employee" | "admin";

export interface OrganizationalUser {
  /** Stable internal identifier. Firebase Authentication UID is the source key. */
  uid: string;
  /** Corporate email returned by the verified identity provider. */
  email: string;
  /** Company login, normally the local part of the corporate email address. */
  login: string;
  /** Name used to identify the person in company systems. */
  agent: string;
  /** Stable identifier of the current organizational sector. */
  sectorId: string;
  /** Stable identifier of the contact/team within the sector. */
  contactId: string;
  /** Supervisors manage all collaborators and operational organization globally. */
  isSupervisor: boolean;
  /** Profile IDs this collaborator is allowed to select; empty means none. */
  allowedProfileIds?: string[];
  status: AccountStatus;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationalSector {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationalContact {
  id: string;
  sectorId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Snapshot stored on each expediente. History uses this snapshot rather than
 * the collaborator's current sector/contact, so old records remain attributed
 * to the assignment in force when the expediente was recorded.
 */
export interface OrganizationalAssignmentSnapshot {
  uid: string;
  login: string;
  agent: string;
  sectorId: string;
  sectorName: string;
  contactId: string;
  contactName: string;
}


/**
 * Extensible supervisor policy contract for future server-side enforcement.
 *
 * This type documents the future policy shape only. It does not grant access,
 * and must not be used as a substitute for Firestore Rules or a trusted
 * backend. The initial release still uses the temporary sector rule.
 */
export interface SupervisorAccessPolicy {
  schemaVersion: 1;
  /** Policy is assigned and maintained by an administrator. */
  enabled: boolean;
  /** Supported dimensions can grow without changing the supervisor flag. */
  scope: {
    sectorIds?: string[];
    contactIds?: string[];
    userUids?: string[];
  };
  /** Optional record constraints; server-side support must be tested first. */
  recordFilters?: {
    statuses?: string[];
    fromDate?: string;
    throughDate?: string;
  };
  updatedAt: string;
  updatedByUid: string;
}

/**
 * Denormalized card index for managerial views. It complements, but never
 * replaces, the employee's durable personal history.
 */
export interface ExpedienteIndexRecord {
  id: string;
  ownerUid: string;
  date: string;
  status: string;
  completedAt?: string;
  assignment: OrganizationalAssignmentSnapshot;
  /** Denormalized query fields; must match the assignment snapshot. */
  sectorId: string;
  sectorName: string;
  contactId: string;
  contactName: string;
  login: string;
  agent: string;
}
