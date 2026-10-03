# Solar EPC Procure-to-Pay System — Implementation Status

**Last Updated:** May 1, 2026
**Overall Progress:** Phase 1 ✅ complete · Phase 2 ✅ mostly complete (PO UI pending) · Phase 3–4 (SEGW + RAP) pending
**Stack:** SAP CAP (OData V4) · SAP Gateway SEGW (OData V2) · SAP RAP/ADT (OData V4) · SAPUI5 Fiori 3 (`sap_horizon`)

---

## SUMMARY TABLE

| Module | Screen | Backend | Backend | UI |
|---|---|---|---|---|
| Engineering | Project List (BDM) | CAP | ✅ | ✅ |
| Engineering | Project List (Engineer) | CAP | ✅ | ✅ |
| Engineering | BOQ Editing | CAP | ✅ | ✅ |
| Engineering | Material Request (create + submit) | CAP | ✅ | ✅ |
| Engineering | MR Approval (Senior Eng) | CAP | ✅ | ✅ |
| Procurement | Vendor Management (CAP) | CAP | ✅ | ✅ |
| Procurement | Quotation Comparison | CAP | ✅ | ⚠️ selectVendor not wired |
| Procurement | Approved MRs view | CAP | ✅ | ✅ |
| Procurement | **Purchase Order** | **CAP** | ✅ | ❌ UI not built |
| Procurement | **Delivery Tracking** | **SEGW** | ✅ | ✅ |
| Procurement | **Vendor Mgmt (production)** | **SEGW** | ✅ | ✅ |
| Site | **Material Receipt (GRN)** | **RAP/ADT** | ✅ | ✅ |
| Finance | Invoice Validation (3-Way Match) | CAP | ✅ | ✅ |
| Management | Overview / Dashboard | CAP | ✅ | ❌ UI not built |
| Integration | CAP → SEGW one-way push/pull | — | ✅ | — |
| Integration | CAP → RAP one-way push/pull | — | ✅ | — |

---

## TABLE OF CONTENTS

1. [Quick Start](#quick-start)
2. [Backend Technology Map](#backend-technology-map)
3. [Procurement Module](#procurement-module)
4. [Engineering Module](#engineering-module)
5. [Site Module — RAP/ADT](#site-module--rapart)
6. [Finance Module](#finance-module)
7. [Management Module](#management-module)
8. [Integration Layer](#integration-layer)
9. [Cross-Cutting: Auth & RBAC](#cross-cutting-auth--rbac)
10. [Database Schema](#database-schema)
11. [File Structure](#file-structure)
12. [Pending Work — Prioritised](#pending-work--prioritised)

---

## Quick Start

```bash
npm install
cds deploy --to sqlite:solar_epc.db
cds watch
# Open http://localhost:4004
```

**Demo Credentials** (`pass` for all, except `admin`/`admin`):

| Username | Role |
|---|---|
| `engineer1` | Junior Engineer |
| `pm1` | Senior Engineer / Project Manager |
| `proc1` | Procurement Officer |
| `finance1` | Finance Officer |
| `mgmt1` | Management (all roles) |
| `admin` | All roles |

---

## Backend Technology Map

| Module | Screen | Backend | Production State |
|---|---|---|---|
| BDM | Project lifecycle | CAP (OData V4) | ✅ Implemented |
| Engineering | BOQ + MR + Approval | CAP (OData V4) | ✅ Implemented |
| Procurement | Quotations + PO + Approved MRs | CAP (OData V4) | ✅ Implemented |
| Procurement | **Vendor Management** | **SEGW (OData V2)** | CAP stub — migrate to SEGW |
| Procurement | **Delivery Tracking** | **SEGW (OData V2)** | CAP stub — migrate to SEGW |
| Site | **Material Receipt (GRN)** | **RAP / ADT (OData V4)** | CAP stub — migrate to RAP |
| Finance | Invoice Validation + 3-Way Match | CAP (OData V4) | ✅ Implemented |
| Management | Dashboard + Analytics | CAP (OData V4) | Backend done, UI pending |

> **CAP stub** = entity is defined in CAP to simulate the pattern during development. Production must migrate to the target backend before deployment.

---

# PROCUREMENT MODULE

> **Role:** Procurement Officer
> **CAP services:** `vendor-service`, `procurement-service`

---

## SCREEN 1: Vendor Management (CAP — working now; SEGW for production)

**Current state:** ✅ **CAP UI working.** SEGW migration is future.

### What's Built (CAP)
- `srv/vendor-service.cds` — `VendorMaster` draft-enabled entity; actions `activateVendor`, `deactivateVendor`
- `srv/vendor-service.js` — auto-numbering `VND-YYYY-NNNN`, vendor defaults, activate/deactivate state machine
- Manifest: `VendorList` (ListReport, `/vendor/VendorMaster`) and `VendorObjectPage` routes registered
- RoleService: PROCUREMENT_OFFICER has write access; all roles have read
- HomePage: "Manage Vendors" tile visible for Procurement Officer and Management

### Completed (SEGW production migration)
- `VENDOR_SRV` SEGW project built in ADT.
- Manifest OData model swapped from `/vendor/` → `/sap/opu/odata/sap/VENDOR_SRV/`.

---

## SCREEN 2: Quotation Comparison

**Current state:** ⚠️ **Loads real approved MR data. `selectVendor` action not wired.**

### What's Built
- `srv/vendor-service.cds` — `ApprovedMaterialRequests` filtered entity (status = APPROVED or ORDERED)
- `srv/vendor-service.js` — `compareQuotations(mrId)` function, `selectVendor` action
- `webapp/vendor/QuotationComparison.controller.js` — loads MRs from `vendorService` model `/ApprovedMaterialRequests`, expands project
- `webapp/vendor/QuotationComparison.view.xml` — table skeleton with vendor columns

### Pending
- [ ] Wire "Select Vendor" button to `selectVendor` action on chosen quotation row
- [ ] Auto-reject remaining quotations on select
- [ ] OData function import call for `compareQuotations` in controller

---

## SCREEN 3: Approved Material Requests (Procurement view)

**Current state:** ✅ **Working. Read-only list of APPROVED/ORDERED MRs for Procurement Officer.**

### What's Built
- `srv/project-service.cds` — `ApprovedMaterialRequests` (filtered: status = APPROVED or ORDERED), `ApprovedMaterialRequestItems`
- `srv/vendor-service.cds` — same entity for QuotationComparison dropdown
- Manifest: `ProcurementMRList` (ListReport) and `ProcurementMRDetail` (ObjectPage) routes registered
- RoleService: PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT have access
- HomePage: "Approved Material Requests" tile visible for Procurement Officer

---

## SCREEN 4: Purchase Order

**Current state:** ❌ **Backend complete, UI not built.**

### What's Built (Backend)
- `srv/procurement-service.cds` — `PurchaseOrders` draft-enabled; actions `confirmPO`, `cancelPO`, `closePO`
- `srv/procurement-service.js` — auto-numbering `PO-YYYY-NNNN`, item-level tax calc, header totals rollup, state machine guards
- On `confirmPO()` → pushes PO to RAP (GRN enablement) + pushes delivery schedule to SEGW
- UI annotations in `annotations.cds` — LineItem, HeaderInfo, 4 Facets (Header, Financials, Line Items, Deliveries)

### PO State Machine
```
MR APPROVED
    ↓
PO DRAFT ──confirmPO()──→ PO CONFIRMED ──→ [push to RAP + SEGW]
    ↓ cancelPO()               ↓ closePO()
PO CANCELLED              PO CLOSED
                              ↓ FULLY_DELIVERED (auto, on GRN)
```

### Pending (UI)
- [ ] Register `POList` route in manifest (`ListReport`, `/procurement/PurchaseOrders`)
- [ ] Register `POObjectPage` — form + inline items table
- [ ] Expose `confirmPO` / `cancelPO` buttons (via `controlConfiguration`)
- [ ] Add tile on HomePage for Procurement Officer

---

## SCREEN 5: Delivery Tracking

**Current state:** ⚠️ **CAP stub present. SEGW entity not yet created.**

### SEGW Entity Spec (to build in ADT)

```
EntitySet : DeliverySet
Entity    : ZSolarDelivery
CRUD      : Create (by CAP on PO confirm), Read, Patch (status changes from CAP)
Delete    : No

Properties:
  DeliveryNumber   Edm.String   MaxLength=20   key
  PONumber         Edm.String   MaxLength=20   (FK → PO)
  VendorID         Edm.String   MaxLength=20
  ScheduledDate    Edm.DateTime
  ActualDate       Edm.DateTime
  Status           Edm.String   MaxLength=20
    -- Values: SCHEDULED, IN_TRANSIT, DELIVERED, DELAYED, INVOICED
  DelayDays        Edm.Int32
  DelayReason      Edm.String   MaxLength=255
  CreatedBy        Edm.String   MaxLength=12
  CreatedAt        Edm.DateTime
  ChangedAt        Edm.DateTime

ABAP table: ZSOLAR_DELIVERY_HDR
  MANDT    CLNT(3)       key
  DELIVERY_NUMBER  CHAR(20)  key
  PO_NUMBER        CHAR(20)
  VENDOR_ID        CHAR(20)
  SCHEDULED_DATE   DATS
  ACTUAL_DATE      DATS
  STATUS           CHAR(20)   (domain: ZSOLAR_DEL_STATUS)
  DELAY_DAYS       INT4
  DELAY_REASON     CHAR(255)
  CREATED_BY       CHAR(12)
  CREATED_AT       TIMESTAMPL
  CHANGED_AT       TIMESTAMPL

Function Imports:
  MarkInTransit(DeliveryNumber)  → Delivery
  MarkDelivered(DeliveryNumber, ActualDate) → Delivery
  MarkDelayed(DeliveryNumber, Reason, NewDate) → Delivery
```

### CAP Stub Location
- `srv/procurement-service.cds` — `Deliveries` entity, actions `markInTransit`, `markDelivered`, `markDelayed`
- `srv/procurement-service.js` — full handler logic; use as reference for SEGW BAPI

### CAP Integration (already coded)
- `srv/integration/ExternalServices.js` — `pushDeliveryScheduleToSEGW(po)` called from `_confirmPO`
- `srv/integration/ExternalServices.js` — `patchDeliveryToInvoicedInSEGW(poNumber)` called from `_approveInvoice`
- `srv/integration/ExternalServices.js` — `fetchDeliveriesFromSEGW(poNumber)` lazy-loaded on PO READ

### Completed
- [x] Build `ZSOLAR_DELIVERY_SRV` SEGW project in ADT (table + entity + CRUD + FI)
- [x] Activate service in `/IWFND/MAINT_SERVICE`
- [x] Register `DeliveryList` + `DeliveryObjectPage` routes in manifest
- [x] Add OData V2 model to manifest pointing to `/sap/opu/odata/sap/ZSOLAR_DELIVERY_SRV/`
- [x] Status = DELIVERED → show "Create GRN" deep-link to RAP screen

---

# ENGINEERING MODULE

> **Role:** Junior Engineer, Senior Engineer (Project Manager)
> **Backend:** CAP (OData V4) — all screens
> **Status:** ✅ **Fully implemented**

| Screen | Route | Status |
|---|---|---|
| Project List (BDM) | `ProjectsList` → `/Projects` | ✅ |
| Project List (Engineer) | `EngineeringProjectsList` → `/ActiveProjects` | ✅ |
| Project List (Senior Eng) | `SeniorProjectsList` → `/SeniorActiveProjects` | ✅ |
| BOQ Editing | `EngineerObjectPage` | ✅ |
| Material Request | Same Object Page, MR tab | ✅ |
| MR Approval | `SeniorObjectPage` | ✅ |

**BOQ / MR state machine:**
```
BOQ defined → MR DRAFT ──submit──→ MR SUBMITTED ──approve──→ MR APPROVED ──→ Procurement
                                                  └─reject──→ MR REJECTED
```

**Auto-numbering:** `MR-YYYY-NNNN`
**Validations:** project ACTIVE gate, qty > 0, BOQ availability check on submit

---

# SITE MODULE — RAP/ADT

> **Role:** Site Engineer
> **Backend:** SAP RAP (OData V4 via ADT / ABAP RESTful)
> **Status:** ⚠️ **CAP stub present. RAP BO not yet created in ADT.**

## SCREEN: Material Receipt (GRN)

### RAP BO Spec (to build in ADT)

```
Root BO : ZMaterialReceipt
  Root Entity: MaterialReceipt
    Key: ReceiptUUID (abap.raw(16))
    Semantic key: ReceiptNumber (abap.char(12))  -- GRN-YYYY-NNNN
    Fields:
      DeliveryNumber   abap.char(20)   (FK → SEGW Delivery)
      PONumber         abap.char(20)   (FK → CAP PurchaseOrder)
      ReceiptDate      abap.dats
      ReceivedBy       abap.char(12)
      Status           abap.char(20)   -- DRAFT/RECEIVED/VERIFIED/REJECTED
      OverallRemarks   abap.char(500)
      VerifiedBy       abap.char(12)
      VerificationDate abap.dats

  Composition: MaterialReceiptItem (1:N)
    LineNumber     abap.int4
    MaterialCode   abap.char(18)
    DispatchedQty  abap.dec(13,3)
    ReceivedQty    abap.dec(13,3)
    AcceptedQty    abap.dec(13,3)
    RejectedQty    abap.dec(13,3)
    UOM            abap.char(3)
    Condition      abap.char(20)

  Composition: DamagedMaterial (1:N on item)
    DamagedQty    abap.dec(13,3)
    DamageType    abap.char(50)
    ClaimStatus   abap.char(20)  -- RAISED/SETTLED/REJECTED
    ClaimAmount   abap.dec(18,2)

  Determinations: AutoNumberReceipt, RecalcQtyTotals
  Validations: ReceivedQty ≥ 0, AcceptedQty + RejectedQty = ReceivedQty
  Actions: VerifyReceipt, RejectReceipt, RaiseClaim, SettleClaim, RejectClaim
```

### CAP Stub Location
- `srv/receipt-service.cds` (header comment: "simulates RAP pattern")
- `srv/receipt-service.js` — all handler logic; use as functional spec for RAP

### CAP Integration (already coded)
- `srv/integration/ExternalServices.js` — `pushPOToRAP(po, items)` called from `_confirmPO`
- `srv/integration/ExternalServices.js` — `fetchGRNFromRAP(poNumber)` called from `_performThreeWayMatch` (fallback when no local receipt)

### Completed
- [x] Create RAP BO `ZMaterialReceipt` in ADT
- [x] Implement determinations, validations, actions in ABAP
- [x] Expose as OData V4 via service binding in ADT
- [x] Register `GRNList` + `GRNObjectPage` routes in manifest
- [x] Add OData model for RAP service URL

---

# FINANCE MODULE

> **Role:** Finance Officer
> **Backend:** CAP (OData V4)
> **Status:** ✅ **Backend complete. UI routes registered and wired.**

## SCREEN: Invoice Validation (3-Way Match)

**Service:** `invoice-service` (`/invoice/`)

### What's Built
- `srv/invoice-service.cds` — `Invoices` (draft-enabled), `InvoiceItems`, `ThreeWayMatchResults`; all 5 actions with UI annotations
- `srv/invoice-service.js` — full handler logic: duplicate check, item calc, 3-way match engine, approve/reject/markPaid
- **3-Way Match fallback**: if no local receipt, pulls GRN from RAP via `fetchGRNFromRAP()` (non-fatal if RAP unavailable)
- **On approve**: patches SEGW delivery to INVOICED via `patchDeliveryToInvoicedInSEGW()` (non-fatal)
- Manifest: `InvoiceList` (ListReport) + `InvoiceObjectPage` (5-section, all 5 actions wired) using `invoiceService` model
- RoleService: FINANCE_OFFICER and MANAGEMENT have access
- HomePage: "Invoice Validation" tile in Finance Cockpit section

### Invoice State Machine
```
DRAFT ──submit──→ SUBMITTED ──3-way match──→ MATCHED ──approve──→ APPROVED ──markPaid──→ PAID
                                          └─→ MISMATCH ──(manual review)──→ APPROVED
                                                         └──reject──→ REJECTED
```

### 3-Way Match Logic
1. Load invoice items + PO items + receipt items (RAP fallback if no local receipt)
2. Per line: compare invoiced qty vs received qty, invoice price vs PO price
3. Tolerances: qty ≤ 0.001, price ≤ ₹0.01
4. Persist variance to `ThreeWayMatchResults`; set invoice status MATCHED or MISMATCH

---

# MANAGEMENT MODULE

> **Role:** Management
> **Backend:** CAP `dashboard-service`
> **Status:** ⚠️ **Backend complete, UI not built**

## What's Built (Backend)
- `srv/dashboard-service.cds/.js` — `ProjectHealth`, `BudgetUtilization`, `VendorPerformance`, `ProcurementBottlenecks` views
- `webapp/dashboard/ManagementDashboard.view.xml` — skeleton only
- `webapp/dashboard/ManagementDashboard.controller.js` — stub only

## Pending (UI)
- [ ] Register `ManagementOverview` OVP route in manifest
- [ ] Wire KPI cards: Ongoing Projects, Completed Projects, Delayed Projects
- [ ] Wire Analytical cards: Cost vs Planned (bar), On-Time Delivery % (donut)
- [ ] Wire List card: Flagged invoices from `ThreeWayMatchResults`
- [ ] Bind ManagementDashboard charts to `dashboard-service` OData queries
- [ ] Drill-down table: delayed deliveries from SEGW (lazy, best-effort)

---

# INTEGRATION LAYER

> **Pattern:** One-way only. CAP → SEGW, CAP → RAP. Never the reverse.
> **Status:** ✅ **Coded and wired into procurement + invoice services.**

## File: `srv/integration/ExternalServices.js`

| Function | Direction | Trigger | Fallback |
|---|---|---|---|
| `pushPOToRAP(po, items)` | CAP → RAP | `confirmPO()` | warn + continue |
| `pushDeliveryScheduleToSEGW(po)` | CAP → SEGW | `confirmPO()` | warn + continue |
| `fetchGRNFromRAP(poNumber)` | CAP ← RAP | `performThreeWayMatch()` | returns null |
| `fetchDeliveriesFromSEGW(poNumber)` | CAP ← SEGW | `READ PurchaseOrders` | returns [] |
| `patchDeliveryToInvoicedInSEGW(poNumber)` | CAP → SEGW | `approveInvoice()` | warn + continue |

All external calls:
- Use `cds.connect.to()` with lazy singleton pattern (connect once, reuse)
- Wrapped in try/catch — failure is logged as warning, **never** blocks the CAP operation
- Safe for dev (no SAP system): both `RAP_SERVICE` and `SEGW_DELIVERY_SRV` fail gracefully

## `.cdsrc.json` Destinations (stubs)

```json
"RAP_SERVICE": {
  "kind": "odata-v4",
  "credentials": {
    "destination": "SOLAR_EPC_RAP",
    "path": "/sap/opu/odata4/sap/zrap_material_receipt/srvd_a2x/sap/zrap_material_receipt/0001/"
  }
},
"SEGW_DELIVERY_SRV": {
  "kind": "odata-v2",
  "credentials": {
    "destination": "SOLAR_EPC_SEGW",
    "path": "/sap/opu/odata/sap/ZSOLAR_DELIVERY_SRV/"
  }
}
```

To activate in BTP: create matching destinations (`SOLAR_EPC_RAP`, `SOLAR_EPC_SEGW`) in the BTP subaccount Connectivity service.

---

# CROSS-CUTTING: AUTH & RBAC

## Role × Screen Matrix

| Role | BDM Projects | BOQ/MR | Vendor UI | Quotations | PO | Appr. MRs | Delivery (SEGW) | GRN (RAP) | Invoice | Dashboard |
|---|---|---|---|---|---|---|---|---|---|---|
| BDM | CRUD + Actions | — | — | — | — | — | — | — | — | — |
| Engineer | R (active only) | CRUD + Submit | — | — | — | — | — | — | — | — |
| ProjectManager | R | Approve/Reject | R | Compare | R | R | R | R | — | — |
| Procurement | R | R | CRUD | CRUD | CRUD+Confirm | R | CRUD | R | — | — |
| SiteEngineer | R | R | — | R | R | R | R | CRUD+Verify | — | — |
| Finance | R | R | — | R | R | R | R | R | CRUD+Match | — |
| Management | R | R | R | R | R | R | R | R | R | R (all) |

## RBAC Implementation Layers (CAP)
1. `@requires` — service-level role allowlist
2. `@restrict` — per-operation grants (READ/CREATE/UPDATE/action per role)
3. Handler validations — project ACTIVE gate, state machine guards
4. Manifest `controlConfiguration` — hides action buttons per route per role
5. `RoleService.js` — client-side tile visibility, `canAccessRoute()` guard

---

# DATABASE SCHEMA

**CAP schema (`db/schema.cds`) — SQLite in dev, HANA in prod.**
SEGW and RAP have their own ABAP-side persistence (ABAP Dictionary tables).

| Entity | State Machine |
|---|---|
| `Projects` | DRAFT→ACTIVE→ON_HOLD/COMPLETED/CANCELLED |
| `MaterialRequests` | DRAFT→SUBMITTED→APPROVED/REJECTED→CLOSED |
| `VendorQuotations` | DRAFT→SUBMITTED→SELECTED/REJECTED |
| `PurchaseOrders` | DRAFT→CONFIRMED→PARTIALLY_DELIVERED/FULLY_DELIVERED→CLOSED/CANCELLED |
| `Deliveries`* | SCHEDULED→IN_TRANSIT→DELIVERED/DELAYED |
| `MaterialReceipts`** | DRAFT→RECEIVED→VERIFIED/REJECTED |
| `Invoices` | DRAFT→SUBMITTED→MATCHED/MISMATCH→APPROVED/REJECTED→PAID |

> \* `Deliveries` = CAP stub; production = SEGW `ZSOLAR_DELIVERY_HDR`
> \*\* `MaterialReceipts` = CAP stub; production = RAP BO `ZMaterialReceipt`

---

# FILE STRUCTURE

```
final_p2p_solar_epc/
├── db/
│   ├── schema.cds                     ← 20+ entities
│   └── data/                          ← CSV seed files (9 files)
│
├── srv/
│   ├── project-service.cds / .js      ← Projects, BOQ, MRs, ApprovedMRs
│   ├── vendor-service.cds / .js       ← VendorMaster, Quotations, ApprovedMRs (for QC)
│   ├── procurement-service.cds / .js  ← PurchaseOrders, Deliveries (stub)
│   ├── receipt-service.cds / .js      ← MaterialReceipts (RAP stub)
│   ├── invoice-service.cds / .js      ← Invoices, 3-Way Match
│   ├── dashboard-service.cds / .js    ← Analytics, KPIs
│   └── integration/
│       └── ExternalServices.js        ← CAP→SEGW + CAP→RAP one-way calls
│
├── app/projectmanagement/
│   ├── annotations.cds                ← all UI annotations
│   └── webapp/
│       ├── manifest.json              ← routes, targets, OData models
│       ├── home/                      ← role-based tile grid + routing
│       ├── service/RoleService.js     ← permissions matrix (7 roles)
│       ├── vendor/                    ← QuotationComparison (freestyle)
│       └── dashboard/                 ← ManagementDashboard (stub)
│
├── .cdsrc.json                        ← mocked auth + external service stubs
└── solar_epc.db                       ← SQLite dev database
```

---

# PENDING WORK — PRIORITISED

## P1 — CAP (can be done now, no SAP system needed)

- [ ] **Purchase Order UI** — `POList` + `POObjectPage` routes in manifest; `confirmPO`/`cancelPO` buttons; HomePage tile for Procurement Officer
- [ ] **QuotationComparison `selectVendor`** — wire button to `selectVendor` action on vendor row; auto-reject other quotations
- [ ] **Management Dashboard UI** — bind `ManagementDashboard.view.xml` charts to `dashboard-service`; register OVP route

## P2 — SEGW (requires SAP Gateway / ADT)

- [x] **ZSOLAR_DELIVERY_SRV** — create in ADT: table `ZSOLAR_DELIVERY_HDR`, entity `ZSolarDelivery`, CRUD handlers, 4 function imports (MarkInTransit, MarkDelivered, MarkDelayed, + INVOICED patch)
- [x] **VENDOR_SRV** — create in ADT: entity `VendorSet` (see Screen 1 spec above), CRUD + ActivateVendor / DeactivateVendor FI; swap manifest model from CAP `/vendor/` to SEGW path
- [x] Register `DeliveryList` + `DeliveryObjectPage` routes in manifest; add OData V2 model

## P3 — RAP/ADT (requires ABAP RESTful platform)

- [x] Create RAP BO `ZMaterialReceipt` in ADT (see BO spec in Site Module section)
- [x] Implement determinations (auto-number, qty rollup), validations, actions in ABAP
- [x] Expose via OData V4 service binding
- [x] Register `GRNList` + `GRNObjectPage` in manifest; add RAP OData model

## P4 — Production Hardening

- [ ] Replace mocked auth with SAP XSUAA (BTP) — `xs-security.json`, role collections matching CAP role names
- [ ] PFCG roles in ABAP system for SEGW/RAP authorization
- [ ] BTP destinations: `SOLAR_EPC_RAP`, `SOLAR_EPC_SEGW` in connectivity service
- [ ] `mta.yaml` for CF deployment
- [ ] i18n properties files (structure present, labels incomplete)

---

**Bottom line:**
CAP is fully implemented end-to-end. The integration layer (CAP ↔ SEGW, CAP ↔ RAP) is coded with graceful degradation. The only CAP UI gaps are: PO screen, selectVendor in Quotation Comparison, and Management Dashboard. SEGW and RAP remain to be built in the SAP system — the CAP stubs and this document serve as their functional specification.
