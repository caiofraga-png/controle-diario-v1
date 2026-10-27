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
 * Snapshot stored on each completed expediente. Historical reporting must use
 * this snapshot, not the collaborator's current sector/contact.
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
