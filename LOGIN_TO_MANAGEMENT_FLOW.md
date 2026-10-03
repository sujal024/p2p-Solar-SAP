# Login to Management Dashboard — Complete File Flow Documentation

> **Project:** SolarSage EPC — Solar EPC P2P Platform
> **Stack:** SAP UI5 (Fiori Elements + Custom), SAP CAP Node.js, OData V4
> **Scope:** Every file, model, and function touched from the moment the browser loads to the Management Dashboard rendering with live KPI data.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 1 — Browser Loads the App](#2-phase-1--browser-loads-the-app)
3. [Phase 2 — Component Boot and Session Init](#3-phase-2--component-boot-and-session-init)
4. [Phase 3 — Login Screen Renders](#4-phase-3--login-screen-renders)
5. [Phase 4 — User Submits Credentials](#5-phase-4--user-submits-credentials)
6. [Phase 5 — Auth Service Call and Session Population](#6-phase-5--auth-service-call-and-session-population)
7. [Phase 6 — Route Guard and Home Page](#7-phase-6--route-guard-and-home-page)
8. [Phase 7 — Home Page Renders for MANAGEMENT Role](#8-phase-7--home-page-renders-for-management-role)
9. [Phase 8 — User Navigates to Management Dashboard](#9-phase-8--user-navigates-to-management-dashboard)
10. [Phase 9 — Management Dashboard Loads KPIs](#10-phase-9--management-dashboard-loads-kpis)
11. [Phase 10 — OVP App via managementOverview Button](#11-phase-10--ovp-app-via-managementoverview-button)
12. [File Responsibility Map](#12-file-responsibility-map)
13. [Full Sequence Diagram](#13-full-sequence-diagram)

---

## 1. Architecture Overview

```
Browser
  │
  ├─ App Router (app/router/)          ← xs-app.json: auth gate + routing
  │      ├─ XSUAA token validation
  │      └─ forwards to → srv-api (localhost:4004 in dev / CAP on CF)
  │
  ├─ CAP Node.js Server (port 4004)
  │      ├─ /auth/me()                 ← AuthService
  │      ├─ /project/                  ← ProjectService (OData V4)
  │      ├─ /vendor/                   ← VendorService
  │      ├─ /procurement/              ← ProcurementService
  │      ├─ /invoice/                  ← InvoiceService
  │      ├─ /receipt/                  ← ReceiptService
  │      └─ /dashboard/                ← DashboardService
  │
  └─ SAP UI5 SPA (app/projectmanagement/webapp/)
         ├─ Component.js               ← App boot + auth + route guard
         ├─ App.view.xml               ← Shell (back button, theme, banner)
         ├─ manifest.json              ← Routes + OData models
         ├─ service/RoleService.js     ← Role constants + permissions
         ├─ login/LoginPage.*          ← First screen
         ├─ home/HomePage.*            ← Role-adaptive dashboard
         ├─ management/ManagementDashboard.* ← Live KPI screen
         └─ vendor/QuotationComparison.*     ← Bid evaluation screen
```

---

## 2. Phase 1 — Browser Loads the App

### Files Involved
- `app/projectmanagement/webapp/index.html`
- `app/router/xs-app.json`
- `app/router/package.json`
- `app/router/default-env.json` (dev only)

### What Happens

1. **Browser requests** `https://<host>/index.html`

2. **App Router** (`@sap/approuter v21`) receives the request. It checks `xs-app.json`:
   ```json
   { "source": "^/(.*)$", "destination": "srv-api", "authenticationType": "xsuaa" }
   ```
   - In production: validates XSUAA OAuth2 Bearer token. Unauthenticated requests are redirected to the XSUAA login page.
   - In development: `default-env.json` maps `srv-api` to `http://localhost:4004`. The `forwardAuthToken: true` setting passes the Basic Auth header through to CAP.

3. **UI5 bootstrap** starts from `index.html`. It loads `sap.ui.core` and then reads `manifest.json`.

4. **`manifest.json` is parsed.** UI5 registers:
   - 5 OData V4 models (`""`, `vendorService`, `invoiceService`, `procurementService`, `dashboardService`)
   - The `i18n` ResourceModel
   - 27 route/target definitions
   - CSS resources (including `App.css`, `HomePage.css`, `LoginPage.css`, `QuotationComparison.css`)

5. **`Component.js` is instantiated** — this is the first JavaScript that executes.

---

## 3. Phase 2 — Component Boot and Session Init

### File: `app/projectmanagement/webapp/Component.js`

### Execution Order

```javascript
// 1. AppComponent.prototype.init() is called
AppComponent.prototype.init.apply(this, arguments);

// 2. Session model created and attached
const oSessionModel = new JSONModel({ authPending: true, loggedIn: false, ... });
this.setModel(oSessionModel, "session");

// 3. Route guard installed BEFORE any route resolves
this.getRouter().attachBeforeRouteMatched(this._onBeforeRouteMatched, this);

// 4. Current hash saved (supports page reload to the same route)
const sIntendedHash = HashChanger.getInstance().getHash();
sessionStorage.setItem("solarEpcIntendedHash", sIntendedHash || "");

// 5. Check for existing session in sessionStorage
const sSavedAuth = sessionStorage.getItem("solarEpcAuth");
if (sSavedAuth) {
    this._loadSession(sSavedAuth).catch(() => {
        sessionStorage.removeItem("solarEpcAuth");
    });
} else {
    oSessionModel.setProperty("/authPending", false);
    // → Router resolves → default route "" → LoginPage
}
```

### Key Design: `authPending` Semaphore

While `authPending = true`, the `_onBeforeRouteMatched` guard returns immediately without checking `loggedIn`. This prevents the router from flashing `LoginPage` during the async `/auth/me()` session restore call on page reload.

### Session Restore Path (returning user)

If `solarEpcAuth` exists in `sessionStorage` (user previously logged in this browser tab), `_loadSession` is called immediately. If the session is still valid (the CAP server accepts the credential), the user lands directly on their intended route — bypassing `LoginPage` entirely.

---

## 4. Phase 3 — Login Screen Renders

### Files Involved
- `app/projectmanagement/webapp/login/LoginPage.view.xml`
- `app/projectmanagement/webapp/login/LoginPage.controller.js`
- `app/projectmanagement/webapp/login/LoginPage.css`

### Route Resolution

With `authPending = false` and no saved session, the router resolves the empty hash pattern `""` to the `LoginPage` target.

The `_onBeforeRouteMatched` guard evaluates:
```
route = "LoginPage" → allow (always)
```

### View Structure

```
Shell (appWidthLimited=false)
  └── App
        └── Page (showHeader=false, backgroundDesign=Transparent)
              └── FlexBox (alignItems=Center, justifyContent=Center, class=loginShell)
                    └── VBox (class=loginCard)
                          ├── VBox (brandBox) — icon + "SolarSage EPC" title + subtitle
                          ├── ToolbarSeparator
                          ├── Label "Username" + Input (value={login>/username})
                          ├── Label "Password" + Input type=Password (value={login>/password})
                          ├── MessageStrip — dev user cheat sheet
                          ├── [hidden] Select — role pre-selection
                          └── Button "Continue" → onLoginPress
```

### Model

A local `login` JSONModel is created in `onInit`:
```javascript
{ username: "", password: "", selectedRole: "MANAGEMENT" }
```

This model is **isolated to the Login view** — it does not share the `session` model.

---

## 5. Phase 4 — User Submits Credentials

### File: `app/projectmanagement/webapp/login/LoginPage.controller.js`

### `onLoginPress` Flow

```javascript
onLoginPress: function () {
    const sUsername = (oModel.getProperty("/username") || "").trim();
    const sPassword = oModel.getProperty("/password") || "";

    // Path A: Empty fields
    if (!sUsername && !sPassword) {
        const sMode = oComp.getModel("session").getProperty("/authMode");
        if (sMode === "xsuaa") {
            // BTP production: attempt silent XSUAA session
            oComp._loadSession()
        } else {
            // Local dev: warn the user
            MessageBox.warning("Enter your username and password");
        }
        return;
    }

    // Path B: Only one field filled
    if (!sUsername || !sPassword) {
        MessageBox.warning("Enter both username and password.");
        return;
    }

    // Path C: Both filled → delegate to Component
    this.getOwnerComponent()
        .loginWithCredentials(sUsername, sPassword)
        .catch(function () {
            MessageBox.error("Invalid username or password.");
        });
}
```

### `Component.loginWithCredentials(username, password)`

```javascript
loginWithCredentials: function (sUsername, sPassword) {
    // 1. Build Basic Auth header
    const sAuthHeader = "Basic " + window.btoa(sUsername + ":" + sPassword);
    // 2. Persist for session restore on reload
    sessionStorage.setItem("solarEpcAuth", sAuthHeader);
    // 3. Load session (makes the /auth/me() call)
    return this._loadSession(sAuthHeader);
}
```

**Why `window.btoa`?** The CAP development server uses mocked Basic Auth. The encoded header is stored in `sessionStorage` so subsequent page reloads don't require re-login.

---

## 6. Phase 5 — Auth Service Call and Session Population

### Files Involved
- `app/projectmanagement/webapp/Component.js` (`_loadSession`)
- `srv/auth-service.cds`
- `srv/auth-service.js`
- `app/projectmanagement/webapp/service/RoleService.js`

### `_loadSession(authHeader)` Flow

```
1. oSessionModel.setProperty("/authPending", true)
2. fetch("/auth/me()", { headers: { Authorization: authHeader } })
   │
   ├── App Router receives request
   │     → matches route 4: ^/(.*)$ → srv-api
   │     → forwards with Authorization header
   │
   ├── CAP receives GET /auth/me()
   │     → AuthService.on('me', ...) → _sessionFor(req)
   │     │
   │     │  _sessionFor logic:
   │     │  1. authKind = cds.env.requires.auth.kind ("mocked" in dev)
   │     │  2. isLocalSimulation = (authKind === "mocked")
   │     │  3. CAP validates Basic Auth header against .cdsrc.json users
   │     │  4. capRoles = user.is("Engineer") ? [...] : all roles for admin
   │     │  5. uiRoles = capRoles.map(r => UI_ROLE_BY_CAP_ROLE[r])
   │     │  6. currentRole = ROLE_PRIORITY.find(r => uiRoles includes r)
   │     │  7. Returns UserSession { userId, userName, email, authMode,
   │     │                           isLocalSimulation, canSwitchRole,
   │     │                           currentRole, capRoles, uiRoles }
   │
   └── Response JSON received by _loadSession
         │
         ├── RoleService.parseRoleList(oSession.uiRoles) → ["MANAGEMENT"]
         ├── RoleService.getPrimaryRole(aUiRoles) → "MANAGEMENT"
         ├── _applyAuthorizationHeader(sAuthHeader)
         │     → Sets Authorization on all 5 OData models
         │
         └── oSessionModel.setData({
               authPending: false,
               loggedIn: true,
               currentRole: "MANAGEMENT",
               userName: "Vikram Mehta",
               uiRoles: ["MANAGEMENT"],
               availableRoles: [{ key: "MANAGEMENT", text: "Management" }],
               ...
             })
```

### `_applyAuthorizationHeader`

Iterates over all 6 model names (`""`, `vendorService`, `invoiceService`, `procurementService`, `receiptService`, `dashboardService`) and calls `oModel.changeHttpHeaders({ Authorization: authHeader })`. This ensures every subsequent OData request from every service carries the authentication header.

### `.cdsrc.json` User for `mgmt1`

The `mgmt1` user is defined in the `[development]` block:
```json
"mgmt1": {
  "password": "pass",
  "roles": ["Management", "ProjectManager", "ProcurementOfficer", "FinanceOfficer"]
}
```

This means `mgmt1` gets 4 CAP roles. `AuthService._sessionFor` maps these to UI roles: `["MANAGEMENT", "PROJECT_MANAGER", "PROCUREMENT_OFFICER", "FINANCE_OFFICER"]`. `ROLE_PRIORITY` then selects `MANAGEMENT` as `currentRole`.

---

## 7. Phase 6 — Route Guard and Home Page Navigation

### File: `app/projectmanagement/webapp/Component.js` (`_onBeforeRouteMatched`)

### After `_loadSession` completes

The session model now has `loggedIn = true`, `currentRole = "MANAGEMENT"`.

`_loadSession` then checks the intended hash:
```javascript
const sIntended = sessionStorage.getItem("solarEpcIntendedHash") || "";
const sHash = HashChanger.getInstance().getHash();

if (!sHash || sHash === "LoginPage") {
    // Currently on LoginPage → navigate to default route for role
    this.getRouter().navTo(this._getDefaultRouteForRole("MANAGEMENT"), {}, true);
    // → navTo("HomePage")
}
```

`_getDefaultRouteForRole` returns `"HomePage"` for all roles.

### Route Guard fires for `HomePage`

```javascript
_onBeforeRouteMatched: function (oEvent) {
    const sRouteName = "HomePage";
    const bAuthPending = false;  // session is resolved
    const bLoggedIn = true;
    const sRole = "MANAGEMENT";

    // authPending = false → proceed
    // route ≠ LoginPage AND loggedIn → proceed
    // RoleService.canAccessRoute("MANAGEMENT", "HomePage")
    //   → ROUTE_PERMISSIONS["HomePage"] = ["BDM", "ENGINEER", ..., "MANAGEMENT"]
    //   → includes "MANAGEMENT" → true
    // → allow navigation
}
```

---

## 8. Phase 7 — Home Page Renders for MANAGEMENT Role

### Files Involved
- `app/projectmanagement/webapp/home/HomePage.view.xml`
- `app/projectmanagement/webapp/home/HomePage.controller.js`
- `app/projectmanagement/webapp/home/DevUserSwitcher.fragment.xml`
- `app/projectmanagement/webapp/service/RoleService.js`
- `app/projectmanagement/webapp/home/HomePage.css`

### `onInit` Execution

```javascript
onInit: function () {
    const oSessionModel = oComponent.getModel("session");
    const sRole = oSessionModel.getProperty("/currentRole"); // "MANAGEMENT"

    this._initViewModel("MANAGEMENT");

    // Listen for role changes (dev user-switcher)
    oSessionModel.attachPropertyChange(this._onSessionRoleChange, this);

    // Check if we were redirected due to access denial
    if (oSessionModel.getProperty("/unauthorized")) {
        MessageBox.warning("You do not have permission...");
        oSessionModel.setProperty("/unauthorized", false);
    }
}
```

### `_initViewModel("MANAGEMENT")`

Calls `RoleService` to build the view model:

```javascript
RoleService.getAccessModel("MANAGEMENT")
// Returns flat object:
{
  displayName: "Management",
  tile_engineeringProjects: true,
  tile_procurement: true,
  tile_siteOps: true,
  tile_vendorRebates: true,
  tile_finance: true,
  insightCard: true,
  app_approvedMRs: true,
  app_createMR: true,
  app_approveMR: true,
  app_manageVendors: true,
  app_compareQuotations: true,
  app_createPO: true,
  app_trackDeliveries: true,
  app_postGR: true,
  app_reportDamage: true,
  app_validateInvoice: true,
  app_projectHealth: true,
  app_managementOverview: true,
  app_grnAnalytics: true
}
```

```javascript
RoleService.getTodos("MANAGEMENT")
// Returns 4 todos:
[
  { task: "Approve Material Request #MR-1024", state: "Error", ... },
  { task: "Evaluate Inverter Quotations", state: "Warning", ... },
  { task: "Review All Project Health Metrics", state: "None", ... },
  { task: "Approve Invoice #INV-551", state: "Success", ... }
]
```

```javascript
_getKPIData("MANAGEMENT")
// Returns:
{
  engineering: { value: "45", scale: "Total", trend: "Up", state: "Good", details: "Projects Enterprise-wide" },
  procurement: { value: "3.2", scale: "M", trend: "Down", state: "Good", details: "Spend vs Budget" },
  siteOps:     { value: "98", scale: "%", trend: "Up", state: "Good", details: "Safety Compliance" },
  vendorRebates:{ value: "120", scale: "k", trend: "Up", state: "Good", details: "Rebates Claimed" },
  finance:     { value: "12", scale: "%", trend: "Down", state: "Critical", details: "Margin Variance" }
}
```

### View Binding

The `view` JSONModel is set on the view. All bindings resolve:

| XML Binding | Resolved Value |
|---|---|
| `visible="{view>access/tile_engineeringProjects}"` | `true` — Engineering tile shows |
| `visible="{view>access/tile_procurement}"` | `true` — Procurement tile shows |
| `visible="{view>access/tile_siteOps}"` | `true` — Site Operations tile shows |
| `visible="{view>access/tile_vendorRebates}"` | `true` — Vendor Rebates tile shows |
| `visible="{view>access/tile_finance}"` | `true` — Finance tile shows |
| `visible="{view>access/insightCard}"` | `true` — Insight card visible |
| `visible="{view>access/app_managementOverview}"` | `true` — Management Overview app shows |
| `text="{view>/greeting}, {view>/userName}"` | `"Good morning, Vikram Mehta"` |
| `text="{view>/role}"` | `"Management"` |
| `{view>/todosCount}` | `4` |

### `formatTodoRows` for MANAGEMENT

MANAGEMENT sees 6 tiles (MyHome + 5 workspace tiles):
```javascript
iCount = 1 (MyHome) + 1 + 1 + 1 + 1 + 1 = 6
iRows = Math.ceil(6/2) * 2 = 6
iReduced = Math.floor(6 * 0.75) = 4
→ todoRows = Math.max(3, 4) = 4
```

The Action Center card spans 4 grid rows.

### What the MANAGEMENT Home Page Shows

```
┌─────────────────────────────────────────────────────────────────────┐
│  ☀ SolarSage EPC         Good morning, Vikram Mehta   [Profile] [⚙] │
├─────────────────────────────────────────────────────────────────────┤
│  MANAGEMENT WORKSPACE                                               │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   MyHome     │  │ Engineering  │  │  Procurement │              │
│  │  KPI: 14     │  │  KPI: 45     │  │  KPI: 3.2M   │              │
│  │  Tasks       │  │  Projects    │  │  Spend       │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Site Ops     │  │ Vend.Rebates │  │   Finance    │              │
│  │  KPI: 98%    │  │  KPI: 120k   │  │  KPI: 12%    │              │
│  │  Compliance  │  │  Rebates     │  │  Margin Var. │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ACTION CENTER (4 todos)                                     │   │
│  │  ● Approve MR #1024 [HIGH PRIORITY]                         │   │
│  │  ● Evaluate Quotations [PENDING]                            │   │
│  │  ● Review Health Metrics [DASHBOARD]                        │   │
│  │  ● Approve Invoice #INV-551 [READY]                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  APP LAUNCHER                                                       │
│  [Approved MRs] [Create MR] [Approve MR] [Manage Vendors]          │
│  [Compare Quotations] [Create PO] [Track Deliveries] [Post GR]     │
│  [Report Damage] [Validate Invoice] [Mgmt Overview] [GRN Analytics]│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Phase 8 — User Navigates to Management Dashboard

### Files Involved
- `app/projectmanagement/webapp/home/HomePage.controller.js` (`onNavPress` or `onAppPress`)
- `app/projectmanagement/webapp/Component.js` (`_onBeforeRouteMatched`)
- `app/projectmanagement/webapp/manifest.json` (target definition)
- `app/projectmanagement/webapp/management/ManagementDashboard.controller.js`
- `app/projectmanagement/webapp/management/ManagementDashboard.view.xml`

### Navigation Path A — Tile Click ("MyHome" tile for MANAGEMENT)

```javascript
onNavPress: function (oEvent) {
    const sHeader = oSource.getHeader(); // "MyHome"
    const sRole = "MANAGEMENT";
    const oRoleRoutes = ROUTE_BY_ROLE["MANAGEMENT"];
    // ROUTE_BY_ROLE["MANAGEMENT"] = {
    //   "Engineering & Projects": "ProjectsList",
    //   "Procurement": "POList",
    //   "Site Operations": "GRNList",
    //   "Finance Cockpit": "InvoiceList",
    //   "default": "ManagementDashboard"    ← MyHome for MANAGEMENT
    // }
    let sRoute = oRoleRoutes["MyHome"] || oRoleRoutes.default;
    // → sRoute = "ManagementDashboard"

    RoleService.canAccessRoute("MANAGEMENT", "ManagementDashboard")
    // ROUTE_PERMISSIONS["ManagementDashboard"] = ["MANAGEMENT"]
    // → true

    oRouter.navTo("ManagementDashboard");
}
```

### Navigation Path B — App Launcher ("Mgmt Overview" app)

```javascript
onAppPress: function (oEvent) {
    const sAppKey = "managementOverview";
    // oNavMap["managementOverview"] → special case
    window.location.href = window.location.origin + "/managementoverview/webapp/index.html";
    // → Opens the SEPARATE OVP app, not a router navTo
}
```

**This path does NOT go through the main app router.** It is a full-page navigation to the standalone OVP application. See Phase 10 for the OVP flow.

### Route Guard fires for `ManagementDashboard`

```javascript
_onBeforeRouteMatched:
  sRouteName = "ManagementDashboard"
  bLoggedIn = true
  sRole = "MANAGEMENT"
  ROUTE_PERMISSIONS["ManagementDashboard"] = ["MANAGEMENT"]
  canAccessRoute("MANAGEMENT", "ManagementDashboard") → true
  → Allow navigation
```

### Target Resolution

From `manifest.json`, the `ManagementDashboard` target:
```json
"ManagementDashboard": {
  "type": "View",
  "id": "ManagementDashboard",
  "name": "solar.epc.projectmanagement.management.ManagementDashboard",
  "viewLevel": ...
}
```

UI5 loads the view `management/ManagementDashboard.view.xml` and instantiates `management/ManagementDashboard.controller.js`.

---

## 10. Phase 9 — Management Dashboard Loads KPIs

### Files Involved
- `app/projectmanagement/webapp/management/ManagementDashboard.controller.js`
- `app/projectmanagement/webapp/management/ManagementDashboard.view.xml`
- `srv/dashboard-service.cds` (view definitions)
- `srv/dashboard-service.js` (`_getProjectHealth` handler)
- `db/schema.cds` (source entities for the views)

### `onInit` Execution

```javascript
onInit: function () {
    // 1. Create local mgmt model with placeholder KPIs
    this.getView().setModel(new JSONModel({
        kpis: {
            activeProjects: "--", projectState: "Neutral", ...
            // (all 6 KPIs initialized as "--" with "Neutral" state)
        },
        projects: [],
        vendors: [],
        procurementKPIs: []
    }), "mgmt");

    // 2. Trigger all 6 parallel data loads
    this._loadDashboard();
}
```

### `_loadDashboard()` — 6 Parallel OData Calls

All 6 methods fire simultaneously, each using `this._ds()` which returns `this.getOwnerComponent().getModel("dashboardService")` — the OData V4 model bound to `/dashboard/`.

---

#### Call 1: `_loadProjectSummary()`

**OData Request:**
```
GET /dashboard/ProjectSummary
    → App Router → CAP /dashboard/
    → DashboardService view reads epc.Projects
    → SQL: SELECT ID, projectCode, projectName, ...,
             (budget - spentAmount) AS remainingBudget,
             ROUND((spentAmount / budget) * 100, 2) AS budgetUtilizationPct
           FROM solar_epc_Projects
```

**Response processing:**
```javascript
aProjects = aCtx.map(ctx => {
    const pct = parseFloat(o.budgetUtilizationPct);
    return { ...o,
        statusState: o.status === "ACTIVE" ? "Success" : "Warning" | "None",
        budgetState: pct > 85 ? "Error" : pct > 65 ? "Warning" : "Success"
    };
});

// KPI derivation:
active      = aProjects.filter(p => p.status === "ACTIVE").length
totalBudget = SUM(p.budget)
totalSpent  = SUM(p.spentAmount)
utilPct     = (totalSpent / totalBudget) * 100

oModel.setProperty("/kpis/activeProjects", String(active))
oModel.setProperty("/kpis/budgetUtilization", String(utilPct))
oModel.setProperty("/projects", aProjects)
```

---

#### Call 2: `_loadVendorPerformance()`

**OData Request:**
```
GET /dashboard/VendorPerformanceSummary
    → DashboardService view reads epc.VendorMaster WHERE isActive = true
    → SQL: SELECT ID, vendorCode, vendorName, performanceScore,
             totalOrders, onTimeDeliveries, qualityScore,
             ROUND((onTimeDeliveries / totalOrders) * 100, 2) AS onTimeDeliveryPct
           FROM solar_epc_VendorMaster WHERE isActive = 1
```

**Response processing:**
```javascript
aVendors.sort((a, b) => b.performanceScore - a.performanceScore)
// Top-scoring vendors appear first in the leaderboard table
```

State assignment:
- `otdState`: `≥ 85% → Success`, `≥ 70% → Warning`, `< 70% → Error`
- `qualityState`: `≥ 7.5 → Success`, `≥ 5 → Warning`, `< 5 → Error`
- `scoreState`: same thresholds as `qualityState`

---

#### Call 3: `_loadProcurementKPI()`

**OData Request:**
```
GET /dashboard/ProcurementKPI
    → DashboardService view reads epc.PurchaseOrders
    → SQL: SELECT project.ID, project.projectCode, project.projectName,
             COUNT(ID) AS totalPOs, SUM(grandTotal) AS totalPOValue,
             COUNT(CASE WHEN status='CONFIRMED' THEN 1 END) AS confirmedPOs,
             COUNT(CASE WHEN status='FULLY_DELIVERED' THEN 1 END) AS deliveredPOs,
             COUNT(CASE WHEN status='CANCELLED' THEN 1 END) AS cancelledPOs
           FROM solar_epc_PurchaseOrders
           GROUP BY project.ID, project.projectCode, project.projectName
```

**KPI derivation:**
```javascript
totalValue = SUM(k.totalPOValue)
totalPOs   = SUM(k.totalPOs)
oModel.setProperty("/kpis/totalPOValue", (totalValue / 1e7).toFixed(2))
// Displayed as "X.XX Cr INR"
```

---

#### Call 4: `_loadDeliveryPerformance()`

**OData Request:**
```
GET /dashboard/DeliveryPerformance
    → DashboardService view reads epc.Deliveries
    → SQL: SELECT purchaseOrder.vendor.ID, purchaseOrder.vendor.vendorName,
             COUNT(ID) AS totalDeliveries,
             COUNT(CASE WHEN status='DELIVERED' AND delayDays=0 THEN 1 END) AS onTime,
             COUNT(CASE WHEN delayDays > 0 THEN 1 END) AS delayed,
             AVG(delayDays) AS avgDelayDays, MAX(delayDays) AS maxDelayDays
           FROM solar_epc_Deliveries
           GROUP BY purchaseOrder.vendor.ID, ...
```

**KPI derivation:**
```javascript
otdPct = (SUM(onTime) / SUM(totalDeliveries)) * 100
→ oModel.setProperty("/kpis/otdPct", String(otdPct))
// State: ≥85% → Good, ≥70% → Critical, <70% → Error
```

---

#### Call 5: `_loadInvoiceSummary()`

**OData Request:**
```
GET /dashboard/InvoiceMatchingSummary
    → DashboardService view reads epc.Invoices
    → SQL: SELECT vendor.ID, vendor.vendorName,
             COUNT(ID) AS totalInvoices, SUM(totalAmount) AS totalValue,
             COUNT(CASE WHEN status='MATCHED' THEN 1 END) AS matched,
             COUNT(CASE WHEN status='MISMATCH' THEN 1 END) AS mismatched,
             COUNT(CASE WHEN status='PAID' THEN 1 END) AS paid,
             COUNT(CASE WHEN status='APPROVED' THEN 1 END) AS approved
           FROM solar_epc_Invoices GROUP BY vendor.ID, vendor.vendorName
```

**KPI derivation:**
```javascript
cleared = SUM(paid) + SUM(matched)
pct     = (cleared / total) * 100
// State: ≥80% → Good, ≥60% → Critical, <60% → Error
```

---

#### Call 6: `_loadReceiptQuality()`

**OData Request:**
```
GET /dashboard/ReceiptQuality
    → DashboardService view reads epc.MaterialReceiptItems
    → SQL: SELECT receipt.purchaseOrder.project.ID, ...
             SUM(dispatchedQty), SUM(acceptedQty), SUM(rejectedQty),
             ROUND((SUM(rejectedQty) / SUM(dispatchedQty)) * 100, 2) AS rejectionRate
           FROM solar_epc_MaterialReceiptItems
           GROUP BY project.ID, project.projectCode
```

**KPI derivation:**
```javascript
rejPct = (SUM(totalRejected) / SUM(totalDispatched)) * 100
// State: ≤2% → Good, ≤5% → Critical, >5% → Error
```

---

### View Rendering After All 6 Calls Complete

The `mgmt` JSONModel is updated incrementally as each call resolves. The view re-renders reactively:

```
ManagementDashboard.view.xml
│
├── f:GridContainer (kpiGrid)
│     ├── f:Card: NumericHeader "Active Projects"
│     │     number="{mgmt>/kpis/activeProjects}"   ← "5"
│     │     state="{mgmt>/kpis/projectState}"       ← "Good"
│     │     details="{mgmt>/kpis/projectDetails}"   ← "10 Total Projects"
│     │
│     ├── f:Card: NumericHeader "Total PO Spend"
│     │     number="{mgmt>/kpis/totalPOValue}"      ← "12.50"
│     │     scale="Cr INR"
│     │
│     ├── f:Card: NumericHeader "On-Time Delivery"
│     │     number="{mgmt>/kpis/otdPct}"            ← "87.5"
│     │     scale="%"   state="Good"
│     │
│     ├── f:Card: NumericHeader "Invoice Clearance"
│     │     number="{mgmt>/kpis/invoiceClearance}"  ← "75.0"
│     │     scale="%"   state="Critical"
│     │
│     ├── f:Card: NumericHeader "Budget Utilization"
│     │     number="{mgmt>/kpis/budgetUtilization}" ← "25.0"
│     │     scale="%"   state="Good"
│     │
│     └── f:Card: NumericHeader "Rejection Rate"
│           number="{mgmt>/kpis/rejectionRate}"     ← "1.2"
│           scale="%"   state="Good"
│
├── Table "Active Projects — Budget Overview"
│     items="{mgmt>/projects}"
│     → rows for each project with projectCode, status (ObjectStatus),
│       budget, spentAmount, budgetUtilizationPct (color-coded)
│
├── Table "Vendor Performance Leaderboard"
│     items="{mgmt>/vendors}"
│     → rows sorted by performanceScore DESC, with OTD%, quality score
│
└── Table "Procurement Summary — By Project"
      items="{mgmt>/procurementKPIs}"
      → rows with totalPOs, confirmedPOs, deliveredPOs, totalPOValue
```

---

## 11. Phase 10 — OVP App via managementOverview Button

### Files Involved (separate app)
- `app/managementoverview/webapp/manifest.json`
- `app/managementoverview/webapp/index.html`
- `app/managementoverview/webapp/Component.js`
- `app/router/xs-app.json` (catch-all route)

### Navigation

When the user clicks the "Management Overview" app launcher tile on `HomePage`:

```javascript
onAppPress → sAppKey = "managementOverview"
window.location.href = window.location.origin + "/managementoverview/webapp/index.html";
```

This is a **full browser navigation** — the main SPA is unloaded and the OVP app loads from scratch.

### OVP App Boot

1. `index.html` loads UI5 with `sap.ovp` library
2. `manifest.json` sets `rootView: "sap.ovp.app.Main"` — the OVP framework's built-in shell
3. `sap.ovp` initializes with `containerLayout: "resizable"` and `globalFilterModel: "dashboardService"`
4. All 7 cards are instantiated using `sap.ovp.cards.v4.table` and `sap.ovp.cards.v4.list` templates

### OVP Card Loading (7 parallel OData requests)

| Card | OData Request |
|---|---|
| Budget Utilization | `GET /dashboard/ProjectSummary` |
| GRN Receipt Quality | `GET /dashboard/ReceiptQuality` |
| Vendor Performance | `GET /dashboard/VendorPerformanceSummary` |
| Procurement KPIs | `GET /dashboard/ProcurementKPI` |
| Invoice Matching | `GET /dashboard/InvoiceMatchingSummary` |
| Delivery Performance | `GET /dashboard/DeliveryPerformance` |
| 3-Way Match Summary | `GET /dashboard/ThreeWayMatchSummary` |

All 7 requests hit the same `/dashboard/` CAP endpoint. The `sap.ovp` framework handles pagination, sorting controls, and "View All" navigation automatically. The cards render in a resizable grid — users can drag to resize or reorder cards.

### Key Difference vs ManagementDashboard

| Aspect | ManagementDashboard (custom) | OVP App (managementoverview) |
|---|---|---|
| Launch path | Router `navTo("ManagementDashboard")` | `window.location.href` |
| UI framework | Custom `sap.f.cards`, tables | `sap.ovp` framework |
| KPI state logic | Hand-coded thresholds (Good/Critical/Error) | None — raw data display |
| Resizable layout | No | Yes (`containerLayout: "resizable"`) |
| Session continuity | Same SPA session | New page load (no session transfer) |
| Data source | `dashboardService` OData model | `dashboardService` OData model (same) |
| Auth | Inherited from Component session | Must re-authenticate or rely on XSUAA |

---

## 12. File Responsibility Map

Every file that is touched during the full login-to-management-dashboard flow:

### App Router Layer
| File | Role in Flow |
|---|---|
| `app/router/xs-app.json` | Validates XSUAA token, routes all traffic to `srv-api`, proxies SEGW/RAP |
| `app/router/package.json` | Defines `@sap/approuter` v21 dependency |
| `app/router/default-env.json` | Maps `srv-api` → `localhost:4004` in development |

### CAP Backend Layer
| File | Role in Flow |
|---|---|
| `srv/auth-service.cds` | Defines `me()` function and `UserSession` type |
| `srv/auth-service.js` | Resolves user identity, roles, session details from `req.user` |
| `srv/dashboard-service.cds` | Defines all 8 analytics views + `getProjectHealth` function |
| `srv/dashboard-service.js` | Implements `_getProjectHealth` composite query handler |
| `db/schema.cds` | Source entities for all dashboard views |

### UI5 App Layer
| File | Role in Flow |
|---|---|
| `webapp/index.html` | UI5 bootstrap entry point |
| `webapp/manifest.json` | Routes, models, targets |
| `webapp/Component.js` | Session init, login, route guard |
| `webapp/App.view.xml` + `App.controller.js` | Shell frame, back button, theme switcher, page banner |
| `webapp/service/RoleService.js` | Role constants, permissions, access model |
| `webapp/login/LoginPage.view.xml` | Login form UI |
| `webapp/login/LoginPage.controller.js` | Credential submission, XSUAA detection |
| `webapp/login/LoginPage.css` | Login card styling |
| `webapp/home/HomePage.view.xml` | Role-adaptive workspace UI |
| `webapp/home/HomePage.controller.js` | ViewModel init, tile navigation, app launcher |
| `webapp/home/HomePage.css` | Home page styling |
| `webapp/home/DevUserSwitcher.fragment.xml` | Dev-mode user switcher popover |
| `webapp/management/ManagementDashboard.view.xml` | KPI cards + tables layout |
| `webapp/management/ManagementDashboard.controller.js` | 6 parallel DashboardService calls |

### OVP App Layer (separate app)
| File | Role in Flow |
|---|---|
| `app/managementoverview/webapp/index.html` | OVP bootstrap |
| `app/managementoverview/webapp/manifest.json` | 7 OVP cards + dashboardService model |
| `app/managementoverview/webapp/Component.js` | OVP component init |

---

## 13. Full Sequence Diagram

```
Browser            AppRouter       CAP (:4004)      DB (SQLite)
   │                   │               │                │
   │ GET /index.html   │               │                │
   │──────────────────>│               │                │
   │ [XSUAA check]     │               │                │
   │<──────────────────│               │                │
   │                   │               │                │
   │ UI5 boots         │               │                │
   │ Component.init()  │               │                │
   │                   │               │                │
   │ GET /auth/me()    │               │                │
   │──────────────────>│               │                │
   │                   │ forward       │                │
   │                   │──────────────>│                │
   │                   │               │ AuthService    │
   │                   │               │ _sessionFor()  │
   │                   │               │ resolve roles  │
   │                   │               │                │
   │                   │<──────────────│                │
   │<──────────────────│               │                │
   │ UserSession       │               │                │
   │ {currentRole:     │               │                │
   │  "MANAGEMENT"}    │               │                │
   │                   │               │                │
   │ _applyAuthHeader  │               │                │
   │ on 5 OData models │               │                │
   │                   │               │                │
   │ navTo("HomePage") │               │                │
   │ Route guard: OK   │               │                │
   │                   │               │                │
   │ HomePage.onInit() │               │                │
   │ RoleService       │               │                │
   │ getAccessModel    │               │                │
   │ ("MANAGEMENT")    │               │                │
   │                   │               │                │
   │ [MANAGEMENT UI    │               │                │
   │  renders with all │               │                │
   │  tiles + apps]    │               │                │
   │                   │               │                │
   │ Click "MyHome"    │               │                │
   │ navTo             │               │                │
   │ ("ManagementDash")│               │                │
   │ Route guard: OK   │               │                │
   │                   │               │                │
   │ Dashboard.onInit()│               │                │
   │                   │               │                │
   │ GET /dashboard/   │               │                │
   │ ProjectSummary    │               │                │
   │──────────────────>│               │                │
   │                   │──────────────>│                │
   │                   │               │ SELECT         │
   │                   │               │ Projects +     │
   │                   │               │ calc columns   │
   │                   │               │────────────────>
   │                   │               │<────────────────
   │                   │<──────────────│                │
   │<──────────────────│               │                │
   │ [+ 5 more calls   │               │                │
   │  in parallel]     │               │                │
   │                   │               │                │
   │ KPI cards render  │               │                │
   │ Tables populate   │               │                │
   │                   │               │                │
   │ [Optional]        │               │                │
   │ Click "Mgmt       │               │                │
   │  Overview"        │               │                │
   │ window.location.  │               │                │
   │ href = /mgmt OVP  │               │                │
   │                   │               │                │
   │ GET /managemento- │               │                │
   │ verview/index.html│               │                │
   │──────────────────>│               │                │
   │ [OVP boots, 7     │               │                │
   │  cards load from  │               │                │
   │  /dashboard/ ]    │               │                │
```

---

*End of Login to Management Dashboard Flow Document*
