# Security Specification: Hardened Raffle Firebase Rules

This specification establishes the data invariants and testing framework for the Firebase Firestore security rules, as defined by Phase 0 and the 8 Pillars of Hardened Rules.

## 1. Data Invariants
- **Identity Invariant**: Users can only read and write their own profile (`/users/{uid}`). No client can modify their own role to `"admin"`.
- **Relational Integrity Invariant**: A Ticket can only be reserved if its `buyerUid` matches the active user's authenticated UID (`request.auth.uid`). No user can reserve a ticket on behalf of another user.
- **Campaign Gate Invariant**: Only admins (whose UID is present in `/admins/{uid}`) can create or modify raffle campaigns, or manually confirm a ticket reservation.
- **Terminal State Lock**: A campaign marked as `"drawn"` or a ticket marked as `"confirmed"` cannot be modified or deleted by standard clients.
- **Temporal Integrity**: All date timestamps (`createdAt`, `updatedAt`, `reservedAt`) must be verified using the database server timestamp (`request.time`).

---

## 2. The "Dirty Dozen" Attack Vectors
The following scenarios represent malicious inputs designed to compromise system integrity. The security rules MUST reject all of these with `PERMISSION_DENIED`.

1. **Role Escalation**: Authenticated client tries to write `role: "admin"` in their own profile under `/users/{uid}`.
2. **Profile Spoofing**: Authenticated user `USER_A` tries to write profiles under `/users/USER_B`.
3. **Admin Configuration Injection**: Unauthenticated or client tries to write their UID directly under `/admins/ATTACKER_UID`.
4. **Campaign Modification by Client**: Regular client tries to edit/pause or draw an existing campaign under `/campaigns/{campaignId}`.
5. **Campaign Injection**: Regular client tries to invoke `create` on a mock campaign with a custom price and target.
6. **Ticket Identity Hijack**: Active user `USER_A` tries to reserve a ticket under `/campaigns/{campaignId}/tickets/{ticketId}` with `buyerUid: "USER_B"`.
7. **Reservation Stealing**: Active user `USER_A` tries to overwrite a ticket that is already reserved by `USER_B`.
8. **Self-Confirmation (Gratis Purchase)**: Regular client tries to update their reserved ticket status directly to `"confirmed"` without administrator authentication.
9. **Release Confirmed Ticket**: Regular client tries to release/cancel a ticket that was already `"confirmed"` by the administrator.
10. **Resource Exhaustion Payload**: Injecting a massive string (e.g. 500KB description or a giant ID of 5000 chars) into document IDs or campaign names.
11. **Client Spoofed Timestamp**: Writing `reservedAt: "2026-01-01T00:00:00Z"` using a local clock value instead of the server timestamp logic `request.time`.
12. **Blanket Query Scraping**: Attempting a list query on `/users` or `/admins` as a standard logged-in user without matching individual owner parameters.

---

## 3. Security Rules Outline (Conceptual)

The accompanying `firestore.rules` will be mapped specifically to:
- **Default Deny**: `match /{document=**} { allow read, write: if false; }`
- **Global Helper Functions**:
  - `isSignedIn()`: Checks if `request.auth != null`.
  - `isVerifiedUser()`: Checks email verification or authentication token validity.
  - `isOwner(userId)`: Checks if current UID matches resource path's ID.
  - `isAdmin()`: Validates existing document inside `/admins/$(request.auth.uid)`.
  - `isValidId(id)`: Verifies format restrictions on key-length and allowable characters.
- **Validation Functions**:
  - `isValidUser(data)`: Structurally validates CPF, phone, role restriction.
  - `isValidCampaign(data)`: Strictly blocks unauthorized changes and structure.
  - `isValidTicket(data)`: Ensures consistent ownership mappings.
