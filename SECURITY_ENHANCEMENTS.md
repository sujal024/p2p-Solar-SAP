# Security Enhancements

Branch: `security_enhancements`

This branch adds a simple role-based authentication foundation for local development and SAP BTP deployment. CAP roles remain the backend source of truth, the UI receives a normalized session from CAP, and AppRouter/XSUAA are prepared for JWT-based production access.

## What Changed

- Added XSUAA security artifacts:
  - `xs-security.json`
  - `mta.yaml`
  - `app/router/package.json`
  - `app/router/xs-app.json`
  - `app/router/default-env.json`
- Added `@sap/xssec` so CAP can validate XSUAA JWTs in production.
- Added `AuthService` at `/auth`:
  - `srv/auth-service.cds`
  - `srv/auth-service.js`
- Updated SAPUI5 startup/session handling:
  - `Component.js` now loads `/auth/me()` instead of trusting `sessionStorage`.
  - `RoleService.js` owns the CAP-role-to-UI-role mapping.
  - `HomePage` role switching is visible only for local simulation users with multiple roles.
  - `LoginPage` no longer performs fake client-side login; it only retries session loading.
- Removed the unauthenticated `QuotationComparison` route bypass. It now follows the same role guard as other pages.

## Auth Modes

### Local Development

Local auth uses CAP mocked users from the `[development]` profile in `.cdsrc.json`.

Run:

```bash
npm install
npm run dev
```

When the browser prompts for credentials, use one of the mocked users:

| User | Password | CAP roles |
|---|---|---|
| `engineer1` | `pass` | `Engineer` |
| `pm1` | `pass` | `ProjectManager` |
| `proc1` | `pass` | `ProcurementOfficer` |
| `site1` | `pass` | `SiteEngineer` |
| `finance1` | `pass` | `FinanceOfficer` |
| `mgmt1` | `pass` | `Management`, `ProjectManager`, `ProcurementOfficer`, `FinanceOfficer` |
| `admin` | `admin` | all local simulation roles |

The in-app login screen works locally:

- Enter a mocked username and password.
- The app calls `/auth/me()` with Basic auth.
- After successful login, the same local Authorization header is attached to the UI5 OData models.

Local role switching is intentionally limited:

- Single-role users cannot switch roles.
- Multi-role mocked users can switch only among roles returned by `/auth/me()`.
- `admin` can simulate all UI roles locally.

### BTP / XSUAA

Production auth uses XSUAA and JWT validation:

- AppRouter authenticates the browser session with XSUAA.
- AppRouter forwards the JWT to CAP using `forwardAuthToken: true`.
- CAP validates the JWT through XSUAA support and `@sap/xssec`.
- CAP service annotations (`@requires`, `@restrict`) and handler checks (`req.user.is(...)`) enforce access.

The production config sets CAP auth to XSUAA through `package.json` and clears mocked users from the production profile:

```json
"[production]": {
  "auth": {
    "kind": "xsuaa",
    "users": {}
  }
}
```

## Role Mapping

Backend roles keep the existing CAP names. The UI uses uppercase constants. Mapping happens once in `RoleService.js`.

| CAP/XSUAA role | UI role |
|---|---|
| `BDM` | `BDM` |
| `Engineer` | `ENGINEER` |
| `ProjectManager` | `PROJECT_MANAGER` |
| `ProcurementOfficer` | `PROCUREMENT_OFFICER` |
| `SiteEngineer` | `SITE_ENGINEER` |
| `FinanceOfficer` | `FINANCE_OFFICER` |
| `Management` | `MANAGEMENT` |

Do not rename backend roles without updating CDS annotations, XSUAA role templates, mocked users, and `RoleService.js`.

## Session Endpoint

Endpoint:

```http
GET /auth/me()
```

Example response:

```json
{
  "userId": "engineer1",
  "userName": "Rajesh Kumar",
  "email": "engineer1",
  "authMode": "mocked",
  "isLocalSimulation": true,
  "canSwitchRole": false,
  "currentRole": "ENGINEER",
  "capRoles": "Engineer",
  "uiRoles": "ENGINEER"
}
```

The response uses comma-separated role strings to keep the OData type simple. The UI parses those strings into arrays.

## AppRouter Routes

`app/router/xs-app.json` protects all routes with XSUAA.

CAP routes go to the generated `srv-api` destination:

```json
{
  "source": "^/(.*)$",
  "target": "$1",
  "destination": "srv-api",
  "authenticationType": "xsuaa",
  "csrfProtection": true
}
```

Future external service route conventions are also present:

| Backend | Route prefix | Destination |
|---|---|---|
| SEGW Delivery | `/sap/opu/odata/sap/ZSOLAR_DELIVERY_SRV/` | `SOLAR_EPC_SEGW` |
| SEGW Vendor | `/sap/opu/odata/sap/VENDOR_SRV/` | `SOLAR_EPC_SEGW` |
| RAP Material Receipt | `/sap/opu/odata4/sap/zrap_material_receipt/` | `SOLAR_EPC_RAP` |

Create the matching BTP destinations before enabling those screens in production.

## Suggested BTP Role Collections

The generated `mta.yaml` creates role collections during deployment. Suggested assignments:

| Role collection | Role template |
|---|---|
| `BDM (maha_project <org>-<space>)` | `BDM` |
| `Engineer (maha_project <org>-<space>)` | `Engineer` |
| `ProjectManager (maha_project <org>-<space>)` | `ProjectManager` |
| `ProcurementOfficer (maha_project <org>-<space>)` | `ProcurementOfficer` |
| `SiteEngineer (maha_project <org>-<space>)` | `SiteEngineer` |
| `FinanceOfficer (maha_project <org>-<space>)` | `FinanceOfficer` |
| `Management (maha_project <org>-<space>)` | `Management` |

## RAP And SEGW Notes

The UI should keep using the shared `session` model for CAP, RAP, and SEGW screens. Do not add screen-specific login logic.

Expected ownership:

- `SiteEngineer`: RAP GRN/material receipt screens.
- `ProcurementOfficer`: SEGW delivery/vendor screens.
- `Management`: broad cross-module access.

Important: RAP and SEGW must still enforce their own backend authorization. This branch prepares UI routing and JWT forwarding conventions, but ABAP-side PFCG/RAP authorization must be configured separately.

## Verification

Completed on this branch:

```bash
git branch --show-current
# security_enhancements

npm install
npx cds build
npx cds env requires.auth --production
```

Local session smoke tests:

```http
GET /auth/me()
Authorization: Basic engineer1:pass
```

Result:

- `currentRole = ENGINEER`
- `capRoles = Engineer`
- `canSwitchRole = false`

```http
GET /auth/me()
Authorization: Basic admin:admin
```

Result:

- `currentRole = MANAGEMENT`
- all CAP/UI roles returned
- `canSwitchRole = true`

Authorization smoke test:

- `engineer1` requesting `/vendor/VendorMaster` returns `403`, as expected.
- Production auth config reports `kind = xsuaa` and `users = {}`.

Skipped:

- `mbt build`, because the `mbt` command is not installed on this machine.

## BTP Smoke Test Checklist

After deploying the MTAR:

- User with no role collection cannot access the app/services.
- Single-role users see only matching tiles/routes.
- Management sees expected cross-module access.
- `/auth/me()` returns XSUAA-derived roles, not local mocked mode.
- CAP service calls receive a validated JWT from AppRouter.
- RAP/SEGW destination routes are tested after destinations and backend authorizations are configured.

## Final Local Demo Checklist

Use this section to show that role-based auth works locally without BTP.

### 1. Start The App

```bash
npm run dev
```

Open:

```text
http://localhost:4004
```

The app shows the SolarSage login screen. Enter one of the local mocked users below. If Chrome also shows a browser authentication prompt because of a direct backend request, use the same username and password.

### 2. Use These Local Users

| Username | Password | Role shown in UI | CAP role |
|---|---|---|---|
| `engineer1` | `pass` | Engineer | `Engineer` |
| `pm1` | `pass` | Senior Engineer | `ProjectManager` |
| `proc1` | `pass` | Procurement Officer | `ProcurementOfficer` |
| `site1` | `pass` | Site Engineer | `SiteEngineer` |
| `finance1` | `pass` | Finance Officer | `FinanceOfficer` |
| `mgmt1` | `pass` | Management | `Management`, `ProjectManager`, `ProcurementOfficer`, `FinanceOfficer` |
| `admin` | `admin` | Management by default; can switch roles locally | all local roles |
| `priyanshu.uict22@sot.pdpu.ac.in` | `pass` | Management by default; can switch assigned roles locally | `Engineer`, `ProjectManager`, `Management`, `ProcurementOfficer`, `SiteEngineer`, `FinanceOfficer` |

### 3. What To Check In The Login Screen

- Enter `engineer1` as username and `pass` as password.
- Click `Continue`.
- You should land in the Engineer experience.
- Logout is not implemented yet, so to test another user, use an incognito window or clear the browser session/auth cache.
- For BTP/XSUAA, leave username and password empty and click `Continue` after the XSUAA login has completed.

### 4. What To Check In The UI

- Login as `engineer1` / `pass`.
- You should land in the Engineer experience.
- The local role switch dropdown should not appear because `engineer1` has one role.
- Engineer-only routes should work.
- Procurement/vendor routes should be blocked.

Then login as `admin` / `admin`:

- You should land as Management.
- The local role switch dropdown should appear.
- Switch between roles to demonstrate local role simulation.
- Tiles and route access should change according to the selected role.

### 5. Quick API Checks

With the dev server running, check the current session:

```bash
curl -u engineer1:pass "http://localhost:4004/auth/me()"
```

Expected result includes:

```json
{
  "authMode": "mocked",
  "isLocalSimulation": true,
  "currentRole": "ENGINEER",
  "capRoles": "Engineer",
  "uiRoles": "ENGINEER"
}
```

Check that backend authorization is really enforced:

```bash
curl -i -u engineer1:pass "http://localhost:4004/vendor/VendorMaster"
```

Expected result:

```text
HTTP/1.1 403 Forbidden
```

Check admin local simulation:

```bash
curl -u admin:admin "http://localhost:4004/auth/me()"
```

Expected result includes:

```json
{
  "authMode": "mocked",
  "isLocalSimulation": true,
  "canSwitchRole": true,
  "currentRole": "MANAGEMENT"
}
```

### 6. Important Note

The login screen is only a local credential entry helper. Roles still come from:

- CAP mocked users locally.
- XSUAA JWT role collections in BTP.

The in-app role selector is only a local simulation helper for users with multiple mocked roles.

Local mocked passwords are plain development-only values in `.cdsrc.json`. They are not used in BTP. In production, XSUAA validates the JWT issued after real identity-provider login, and CAP checks roles from that JWT.
