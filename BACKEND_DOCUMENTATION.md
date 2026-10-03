# Backend Documentation — Solar EPC P2P CAP Project

> **Project:** Solar EPC Procure-to-Pay (P2P) Platform
> **Stack:** SAP CAP (Node.js), OData V4, SQLite (dev) / HANA (prod)
> **Namespace:** `solar.epc`
> **Services:** 7 domain services + 1 integration layer
> **External Systems:** SAP SEGW (OData V2) for delivery tracking, SAP RAP (OData V4) for GRN

---

## Table of Contents

1. [DB Layer — `db/schema.cds`](#1-db-layer--dbschemacds)
2. [Seed Data — `db/data/*.csv`](#2-seed-data--dbdatacsv)
3. [Auth Service](#3-auth-service)
4. [Project Service](#4-project-service)
5. [Procurement Service](#5-procurement-service)
6. [Vendor Service](#6-vendor-service)
7. [Receipt Service](#7-receipt-service)
8. [Invoice Service](#8-invoice-service)
9. [Dashboard Service](#9-dashboard-service)
10. [External Integration Layer](#10-external-integration-layer)
11. [App Router — `app/router/`](#11-app-router--approuter)
12. [End-to-End Request Flow](#12-end-to-end-request-flow)

---

# 1. DB Layer — `db/schema.cds`

## Purpose

This is the **single source of truth** for the entire domain model. All seven services import from this file using `using solar.epc as epc from '../db/schema'`. It defines all enums, master data entities, transactional entities, and their relationships — modelling the full procurement lifecycle of a solar EPC company, from project creation through invoice payment.

---

## 1.1 Type Definitions (Enums)

Enum types enforce valid state transitions across the system and are mapped to UI criticality colors by handler code.

| Type | Values | Used In |
|---|---|---|
| `ProjectStatus` | `DRAFT`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `CANCELLED` | `Projects.status` |
| `RequestStatus` | `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `ORDERED`, `CLOSED` | `MaterialRequests.status` |
| `QuotationStatus` | `DRAFT`, `SUBMITTED`, `UNDER_EVALUATION`, `SELECTED`, `REJECTED` | `VendorQuotations.status` |
| `POStatus` | `DRAFT`, `CONFIRMED`, `PARTIALLY_DELIVERED`, `FULLY_DELIVERED`, `CLOSED`, `CANCELLED` | `PurchaseOrders.status` |
| `DeliveryStatus` | `SCHEDULED`, `IN_TRANSIT`, `DELAYED`, `DELIVERED`, `PARTIALLY_DELIVERED` | `Deliveries.status` |
| `ReceiptStatus` | `PENDING`, `VERIFIED`, `PARTIALLY_ACCEPTED`, `FULLY_REJECTED` | `MaterialReceipts.status` |
| `InvoiceStatus` | `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `MATCHED`, `MISMATCH`, `APPROVED`, `REJECTED`, `PAID` | `Invoices.status` |
| `MatchStatus` | `MATCHED`, `QUANTITY_MISMATCH`, `PRICE_MISMATCH`, `BOTH_MISMATCH`, `PENDING` | `ThreeWayMatchResults` |
| `UserRole` | `ENGINEER`, `PROJECT_MANAGER`, `PROCUREMENT_OFFICER`, `SITE_ENGINEER`, `FINANCE_OFFICER`, `MANAGEMENT` | `Users.role` |
| `MaterialCondition` | `GOOD`, `DAMAGED`, `PARTIAL` | `MaterialReceiptItems.condition` |
| `DamageType` | `PHYSICAL`, `TRANSIT`, `MANUFACTURING`, `WEATHER` | `DamagedMaterials.damageType` |
| `ClaimStatus` | `PENDING`, `CLAIMED`, `SETTLED`, `REJECTED` | `DamagedMaterials.claimStatus` |

**Design Note:** Using `String` enum types (not integers) ensures readable OData filter queries and human-friendly CSV seed data. The `managed` mixin from `@sap/cds/common` auto-populates `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy` on all transactional entities.

---

## 1.2 Master Data Entities

### `MaterialMaster`

Represents the catalogue of all procurable materials (solar panels, cables, inverters, mounting structures, etc.).

| Field | Type | Business Meaning |
|---|---|---|
| `materialCode` | `String(20)` | Unique material code used in BOQ, MR, PO, GRN, Invoice line items |
| `description` | `String(200)` | Human-readable description shown across all UIs |
| `uom` | `String(10)` | Unit of measure (e.g., `NOS`, `MTR`, `KG`) — carried into every transactional line |
| `category` | `String(50)` | Groups materials (e.g., `PANELS`, `CABLES`) for dashboard analytics |
| `hsnCode` | `String(20)` | Indian HSN code for GST compliance |
| `taxRate` | `Decimal(5,2)` | Default GST rate (18%); inherited into MR items, PO items, invoice items |
| `isActive` | `Boolean` | Materials with `isActive = false` are filtered out in all service projections |

**Data Flow:** `MaterialMaster` is referenced (as `@readonly` projections) in every service. BOQ items, MR items, quotation items, PO items, receipt items, and invoice items all carry a `material` association pointing here.

---

### `VendorMaster`

Represents approved suppliers from whom POs are raised and invoices received.

| Field | Type | Business Meaning |
|---|---|---|
| `vendorCode` | `String(20)` | Auto-generated as `VND-{YEAR}-{SEQ}` by both `VendorService` and `ProjectService` |
| `gstin` / `pan` | `String(20)` | GST and tax compliance fields, mandatory for Indian statutory reporting |
| `bankAccount` / `bankIFSC` | `String` | Payment disbursement fields used after invoice approval |
| `performanceScore` | `Decimal(5,2)` | Running score (0–10), adjusted automatically: +0.2 per accurate invoice, −0.3 per rejected invoice, −0.5 per damaged receipt |
| `totalOrders` | `Integer` | Incremented each time a PO is confirmed for this vendor |
| `onTimeDeliveries` | `Integer` | Incremented when a delivery is marked `DELIVERED` with `delayDays = 0` |
| `qualityScore` | `Decimal(5,2)` | Decremented by 0.5 for each receipt with rejections via `_penalizeVendorQuality` |

**Design Note:** Performance scoring is automatically maintained across three separate services (`ProcurementService`, `ReceiptService`, `InvoiceService`). This creates a live vendor scorecard without any manual entry.

---

### `Users`

Internal user directory used for role assignment, `requestedBy`, `approvedBy`, `receivedBy`, and `verifiedBy` associations across transactional documents.

| Field | Type | Business Meaning |
|---|---|---|
| `userId` | `String(20)` | Maps to CAP's `req.user.id` for auto-fill logic |
| `role` | `UserRole` | Stored role — used for display in UI; actual authorization is enforced through CAP `@restrict` annotations, not this field |
| `isActive` | `Boolean` | Inactive users are excluded from all service projections |

---

## 1.3 Project & BOQ Entities

### `Projects`

The root aggregate for all EPC work. Every BOQ item, Material Request, and Purchase Order traces back to a project.

| Field | Type | Business Meaning |
|---|---|---|
| `projectCode` | `String(20)` | Auto-generated as `PRJ-{YEAR}-{SEQ}` by `_generateProjectCode` |
| `capacityKWp` | `Decimal(10,2)` | Solar plant capacity in kilowatt-peak — the primary sizing metric |
| `budget` / `spentAmount` | `Decimal(18,2)` | Budget tracking; `spentAmount` is incremented automatically when invoices are approved |
| `status` | `ProjectStatus` | Controls whether BOQ/MR activities are permitted (the "active gate") |
| `projectManager` | `Association to Users` | The PM who approves material requests for this project |
| `boqItems` | `Composition of many BOQItems` | Child compositions, making BOQ part of the Project aggregate |
| `materialRequests` | `Composition of many MaterialRequests` | Child compositions, scoped to this project |

**Design Note:** The `Composition` keyword (not `Association`) means BOQ items and MRs are **deep-insertable** from the project object page and are **cascade-deleted** if the project is deleted. This is intentional — BOQ without a project has no meaning.

---

### `BOQItems`

The Bill of Quantity — the engineering plan of what materials are needed for a project.

| Field | Type | Business Meaning |
|---|---|---|
| `plannedQty` | `Decimal(13,3)` | Total quantity required per engineering design |
| `requestedQty` | `Decimal(13,3)` | Running total of quantities already requested via MRs; incremented on MR submit, reversed on rejection |
| `orderedQty` | `Decimal(13,3)` | Running total of quantities already ordered via POs |
| `receivedQty` | `Decimal(13,3)` | Running total of accepted quantities from GRNs; updated via the `_updateDeliveredQty` chain in `ReceiptService` |
| `estimatedValue` | `Decimal(18,2)` | Auto-calculated by `_calculateBOQValue` as `plannedQty × estimatedRate` |

**Relationships:** `BOQItems` is linked to `Projects` (parent), `MaterialMaster` (reference), and referenced from `MaterialRequestItems.boqItem`. This linkage enables quantity-tracking from plan → request → order → receipt.

---

### `MaterialRequests` and `MaterialRequestItems`

Represents a Purchase Requisition (PR) raised by an Engineer for materials needed on site.

**`MaterialRequests` key fields:**

| Field | Business Meaning |
|---|---|
| `requestNumber` | Auto-generated as `MR-{YEAR}-{SEQ}` |
| `requiredDate` | Mandatory — drives procurement urgency |
| `priority` | `LOW`, `MEDIUM`, `HIGH` — informs procurement scheduling |
| `requestedBy` / `approvedBy` | Association to `Users`; `requestedBy` is auto-filled from the logged-in user |
| `status` | Full workflow: `DRAFT → SUBMITTED → APPROVED/REJECTED → ORDERED → CLOSED` |
| `quotations` | Composition of vendor quotations sourced for this MR |

**`MaterialRequestItems` key fields:**

| Field | Business Meaning |
|---|---|
| `boqItem` | Links back to the BOQ line; enables quantity-availability check during item creation |
| `requestedQty` | Must not exceed `BOQItem.plannedQty − BOQItem.requestedQty` |
| `estimatedValue` | Auto-calculated as `estimatedRate × requestedQty` |

---

## 1.4 Procurement Entities

### `VendorQuotations` and `VendorQuotationItems`

An RFQ response from a vendor for a specific Material Request.

| Field | Business Meaning |
|---|---|
| `quotationNumber` | Auto-generated as `QT-{YEAR}-{SEQ}` |
| `isSelected` | `true` only for the winning quotation; all sibling quotations are auto-rejected when this is set |
| `subtotal` / `taxAmount` / `totalAmount` | Recalculated automatically whenever items are created/updated/deleted |
| `deliveryLeadDays` | Vendor's promised delivery timeline — used for PO delivery date planning |
| `status` | `DRAFT → SUBMITTED → UNDER_EVALUATION → SELECTED/REJECTED` |

---

### `PurchaseOrders` and `PurchaseOrderItems`

A confirmed order issued to a selected vendor.

| Field | Business Meaning |
|---|---|
| `poNumber` | Auto-generated as `PO-{YEAR}-{SEQ}` |
| `quotation` | Optional reference to the winning `VendorQuotation` that led to this PO |
| `materialRequest` | Optional reference to the originating MR for traceability |
| `grandTotal` | Header total recalculated as items are added/modified |
| `deliveredQty` | Maintained on `PurchaseOrderItems`; updated by `ReceiptService._updateDeliveredQty` when GRN items are saved |
| `pendingQty` | Derived as `orderedQty − deliveredQty`; computed on-the-fly after every READ |
| `status` | Auto-transitions: `CONFIRMED → PARTIALLY_DELIVERED → FULLY_DELIVERED` based on delivery completeness |

**Relationships:** `PurchaseOrders` has two compositions — `items` (PO line items) and `deliveries` (delivery schedules). Both are accessible within the same draft transaction in `ProcurementService`.

---

### `Deliveries` and `DeliveryItems`

Represents a physical shipment against a PO.

| Field | Business Meaning |
|---|---|
| `deliveryNumber` | Auto-generated as `DEL-{YEAR}-{SEQ}` |
| `delayDays` | Calculated as actual delivery date − scheduled date when `markDelivered` is called |
| `eWayBillNumber` | Indian GST e-Way Bill reference for goods in transit |
| `status` | `SCHEDULED → IN_TRANSIT → DELAYED/DELIVERED` |

**Design Note:** A delivery is a child of a PO (`PurchaseOrders.deliveries`), but also spawns `MaterialReceipts` (`Deliveries.receipts`). This models the real-world flow: a truck is dispatched (Delivery), arrives at site (Receipt / GRN).

---

## 1.5 Receipt and Finance Entities

### `MaterialReceipts` and `MaterialReceiptItems`

Represents a Goods Receipt Note (GRN) — the physical acceptance of delivered materials at the project site.

| Field | Business Meaning |
|---|---|
| `receiptNumber` | Auto-generated as `GRN-{YEAR}-{SEQ}` |
| `receivedBy` / `verifiedBy` | Site Engineer records receipt; Procurement Officer verifies |
| `status` | `PENDING → VERIFIED / PARTIALLY_ACCEPTED / FULLY_REJECTED` |
| `acceptedQty` / `rejectedQty` | Must sum to `receivedQty`; validated by `_validateReceiptItem` |
| `condition` | Auto-derived: `PARTIAL` if `rejectedQty > 0 && acceptedQty > 0`, `DAMAGED` if all rejected |

---

### `DamagedMaterials`

Tracks damaged items found during GRN inspection and manages the vendor claim lifecycle.

| Field | Business Meaning |
|---|---|
| `claimStatus` | `PENDING → CLAIMED → SETTLED / REJECTED` |
| `claimAmount` | Financial value of the claim; mandatory when raising a claim |
| `photoReference` | Stores a reference/URL to damage photos for claim evidence |
| `vendorResponse` | Vendor's reply when settling or rejecting the claim |

---

### `Invoices` and `InvoiceItems`

Vendor-submitted invoices requiring three-way matching before payment approval.

| Field | Business Meaning |
|---|---|
| `invoiceNumber` | Auto-generated as `INV-{YEAR}-{SEQ}` |
| `vendorInvoiceNo` | The vendor's own invoice number; duplicate check enforced at creation |
| `receipt` | Links to the GRN — mandatory before running three-way match |
| `status` | `DRAFT → SUBMITTED → UNDER_REVIEW → MATCHED/MISMATCH → APPROVED/REJECTED → PAID` |
| `paymentReference` | Bank transfer reference, mandatory when marking paid |

---

### `ThreeWayMatchResults`

Each row represents a per-line comparison between PO qty/price, GRN accepted qty, and Invoice qty/price.

| Field | Business Meaning |
|---|---|
| `quantityMatch` / `priceMatch` | Line-level match result per axis |
| `overallStatus` | Worst-case rollup: `MATCHED`, `QUANTITY_MISMATCH`, `PRICE_MISMATCH`, `BOTH_MISMATCH` |
| `qtyVariance` / `priceVariance` / `valueVariance` | Signed differences (positive = invoice exceeds PO/GRN) |
| `remarks` | Auto-generated human-readable summary, e.g. `"Qty variance: +2.000; Price variance: +150.0000"` |

**Tolerance Logic (from `InvoiceService`):**
- Quantity tolerance: ±0.001 (effectively zero, for 3-decimal-place quantities)
- Price tolerance: ±0.01 INR (1 paisa — accounts for floating-point rounding)

---

### `VendorPerformanceLog`

Formal scorecard entries for periodic vendor evaluations, separate from the running auto-adjusted scores on `VendorMaster`.

| Field | Business Meaning |
|---|---|
| `deliveryScore` / `qualityScore` / `pricingScore` / `responseScore` | Individual dimension scores (0–5) |
| `overallScore` | Weighted combined score |
| `onTimeDelivery` / `damageReported` / `invoiceAccuracy` | Boolean flags for quick KPI reporting |

---

# 2. Seed Data — `db/data/*.csv`

CSV files in `db/data/` are loaded by CAP on `cds deploy` and `cds watch` to populate the SQLite database for development.

| File | Entity | Key Content |
|---|---|---|
| `solar.epc-Projects.csv` | `Projects` | 10 projects: 5 `ACTIVE` (Maharashtra, Rajasthan, MP, Tamil Nadu, Karnataka), 2 `ON_HOLD`, 3 `CANCELLED`. Budget range: ₹3.95 Cr – ₹9.5 Cr. All share the same `projectManager_ID` (USR-002). |
| `solar.epc-Users.csv` | `Users` | 5 users: `Admin BDM` (BDM), `Eng Manager` (PROJECT_MANAGER), `Proc Officer` (PROCUREMENT_OFFICER), `Arjun Singh` and `Sneha Gupta` (both ENGINEER) |
| `solar.epc-MaterialMaster.csv` | `MaterialMaster` | Solar-specific materials (panels, inverters, cables, mounting, etc.) |
| `solar.epc-VendorMaster.csv` | `VendorMaster` | Pre-seeded vendors with GSTIN, bank details, and initial performance scores |
| `solar.epc-MaterialRequests.csv` / `solar.epc-MaterialRequestItems.csv` | `MaterialRequests` / `MaterialRequestItems` | Sample MRs in various statuses for development testing |
| `solar.epc-BOQItems.csv` | `BOQItems` | BOQ lines linked to the 5 active projects |
| `solar.epc-VendorQuotations.csv` / `solar.epc-VendorQuotationItems.csv` | `VendorQuotations` / `VendorQuotationItems` | Sample quotation responses from vendors |

**Note on naming convention:** CAP resolves CSV files to entities by matching `{namespace}-{EntityName}.csv` exactly. The semicolon (`;`) delimiter is used throughout (not comma) to avoid conflicts with commas in address fields.

---

# 3. Auth Service

## File: `srv/auth-service.cds`

### Purpose

Exposes a single function `me()` that returns the current user's identity and role information in a format the UI can consume. This bridges CAP's internal authentication context (XSUAA tokens in production, mocked users in development) to a normalized `UserSession` type the frontend can rely on.

### Exposed API

- **Endpoint:** `GET /auth/me()`
- **Requires:** `authenticated-user` (any logged-in user can call this)
- **Returns:** `UserSession` object

### `UserSession` Fields

| Field | What It Contains |
|---|---|
| `userId` | The authenticated user's ID from `req.user.id` |
| `userName` | Resolved from `req.user.attr.name` or `attr.given_name` (XSUAA claims) |
| `email` | From `req.user.attr.email` |
| `authMode` | `"mocked"`, `"dummy"`, or `"xsuaa"` — tells the UI which environment it's in |
| `isLocalSimulation` | `true` when running locally; UI uses this to show a role-switcher |
| `canSwitchRole` | `true` only in local simulation AND when the user has multiple roles |
| `currentRole` | The highest-priority role (priority order: `MANAGEMENT > PROJECT_MANAGER > PROCUREMENT_OFFICER > FINANCE_OFFICER > SITE_ENGINEER > ENGINEER > BDM`) |
| `capRoles` | Comma-separated CAP role names (e.g., `"Engineer,ProjectManager"`) |
| `uiRoles` | Comma-separated UI role constants (e.g., `"ENGINEER,PROJECT_MANAGER"`) |

## File: `srv/auth-service.js`

### Key Logic: `_sessionFor(req)`

**Step 1 — Detect environment:**
Reads `cds.env.requires.auth.kind`. If `"mocked"` or `"dummy"`, the user is in local development.

**Step 2 — Resolve CAP roles:**
In local simulation, the `admin` user and wildcard (`*`) users get all 7 CAP roles. Otherwise, roles are filtered using `user.is(role)` — which internally checks XSUAA JWT token claims.

**Step 3 — Map CAP → UI roles:**
The `UI_ROLE_BY_CAP_ROLE` mapping converts CAP technical role names (e.g., `ProjectManager`) to uppercase UI constants (`PROJECT_MANAGER`) that the Fiori app checks against.

**Step 4 — Resolve current role:**
Walks the `ROLE_PRIORITY` array and returns the first UI role that the user holds. `Management` always wins if present, ensuring management users see the broadest view.

### Why This Exists

CAP's built-in `req.user` object is authorization-focused (grants/denials), not UI-oriented. This service gives the frontend a clean, stable contract for adaptive rendering — showing/hiding UI sections based on role without coupling the UI to XSUAA internals.

---

# 4. Project Service

## File: `srv/project-service.cds`

### Purpose

The largest service in the system, acting as the **Engineering Hub**. It covers the complete project lifecycle (BDM creates and activates projects), BOQ management (Engineers define material requirements), Material Request workflow (raise → submit → approve/reject), and also exposes read-only references to procurement and invoice data for cross-functional visibility.

### Access Control

`@requires: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer','FinanceOfficer']` — broadly accessible, with fine-grained restrictions per entity.

### Exposed Entities and Their Role Restrictions

| Entity | BDM | Engineer | ProjectManager | Management | ProcurementOfficer | FinanceOfficer |
|---|---|---|---|---|---|---|
| `Projects` | Full CRUD + lifecycle actions | READ (ACTIVE only), UPDATE (ACTIVE only) | READ (ACTIVE only) | Full CRUD + lifecycle actions | READ | — |
| `BOQItems` | READ | CREATE, UPDATE, DELETE | READ | Full CRUD | READ | — |
| `MaterialRequests` | READ | CREATE, UPDATE, submitRequest | approveRequest, rejectRequest, closeRequest | Full CRUD + all actions | READ | — |
| `Invoices` | — | — | — | Full CRUD + all invoice actions | — | Full CRUD + all invoice actions |
| `VendorMaster` | READ | READ | READ | CRUD + activate/deactivate | CRUD + activate/deactivate | READ |

### Entity Variants: `ActiveProjects`, `SeniorActiveProjects`

The service exposes **three parallel hierarchies** of project-scoped entities:

1. **`Projects` / `BOQItems` / `MaterialRequests`** — Top-level, used by BDM and Management
2. **`ActiveProjects` / `ActiveProjects_BOQItems` / `ActiveProjects_MaterialRequests`** — Filtered to `status = 'ACTIVE'`; the primary Engineer view
3. **`SeniorActiveProjects` / `SeniorActiveProjects_*`** — Same `ACTIVE` filter, but gives ProjectManager both READ and UPDATE on MRs (for approval access from within the project context)

This design lets CAP's OData navigation work correctly from each entity view's object page while enforcing role-specific data access through `@restrict`.

### Actions on `Projects`

| Action | Allowed By | Guard Logic |
|---|---|---|
| `activateProject()` | BDM, Management | Status must be `DRAFT` or `ON_HOLD` |
| `putOnHold(reason)` | BDM, Management | Status must be `ACTIVE` |
| `completeProject()` | BDM, Management | Status must be `ACTIVE`; auto-sets `endDate` |
| `cancelProject(reason)` | BDM, Management | Blocked if already `COMPLETED` or `CANCELLED` |

### Actions on `MaterialRequests`

| Action | Allowed By | Guard Logic |
|---|---|---|
| `submitRequest()` | Engineer, Management | Status must be `DRAFT`; must have at least one item |
| `approveRequest(approvalRemarks)` | ProjectManager, Management | Status must be `SUBMITTED` |
| `rejectRequest(rejectionReason)` | ProjectManager, Management | Status must be `SUBMITTED`; reason is mandatory; BOQ quantities are reversed |
| `closeRequest()` | ProjectManager, Management | Status must be `APPROVED` or `ORDERED` |

### `ApprovedMaterialRequests` — Procurement Bridge

A read-only, role-restricted projection showing only `status = 'APPROVED' OR status = 'ORDERED'` MRs. Accessible to `ProcurementOfficer`, `ProjectManager`, `Management`, `BDM`. This is the entry point through which procurement sees what engineering has signed off on and begins vendor sourcing.

---

## File: `srv/project-service.js`

### Auto-Numbering Handlers

All fired as `before('CREATE', ...)` hooks.

| Handler | Entity | Pattern Generated |
|---|---|---|
| `_generateProjectCode` | Projects | `PRJ-{YEAR}-{0001…}` — queries last `projectCode` by `createdAt desc`, parses sequence |
| `_generateRequestNumber` | MaterialRequests (all 3 variants) | `MR-{YEAR}-{0001…}` — same pattern; also auto-fills `requestedBy` from `req.user.id` |
| `_generateVendorCode` | VendorMaster | `VND-{YEAR}-{0001…}` |
| `_generateInvoiceNumber` | Invoices | `INV-{YEAR}-{0001…}` |

**Pattern:** All number generators use `SELECT.one ... .orderBy('createdAt desc')` to get the most recent record, regex-extract the sequence, and increment. This is a simple but effective approach for SQLite dev — HANA sequences would be needed for high-concurrency production.

---

### Business Gate: `_checkProjectActiveGate`

Fires as `before(['CREATE','UPDATE','DELETE'], ...)` on BOQ items and MR entities.

**Logic:**
1. Extracts `project_ID` from `req.data`. If missing (e.g., on UPDATE/DELETE with just an ID), fetches the record first.
2. Looks up the project's current status.
3. If not `ACTIVE`, returns `HTTP 403`: `"Action blocked: Engineering activities are only allowed when the Project is ACTIVE. Current status is {status}."`

**Why it exists:** Prevents Engineers from raising material requests or modifying BOQ on cancelled, completed, or on-hold projects — a critical data integrity guard.

---

### `_preventHeaderUpdateByEngineer`

Fires as `before('UPDATE', Projects)`.

**Logic:** If the user has the `Engineer` role (and not `BDM` or `Management`), checks if any non-structural fields are being updated. If so, returns `HTTP 403`. Draft activation callbacks (where `IsActiveEntity = true`) are explicitly excluded to allow CAP draft finalization to proceed.

**Why it exists:** Engineers should only be able to modify BOQ items and create MRs. They should not be able to rename projects, change budgets, or reassign project managers.

---

### `_validateRequestItem`

Fires as `before('CREATE', MaterialRequestItems)`.

**Logic:**
1. Validates `requestedQty > 0` and `material_ID` is present.
2. Auto-assigns `lineNumber` by counting existing items for the same `request_ID`.
3. Calculates `estimatedValue = estimatedRate × requestedQty`.
4. If `boqItem_ID` is provided, looks up the BOQ line and enforces: `requestedQty ≤ (plannedQty − requestedQty)`. Exceeding available BOQ quantity returns `HTTP 400`.

---

### `_submitRequest` — BOQ Quantity Update

When an MR is submitted:
1. Validates status is `DRAFT` and has items.
2. Sets status to `SUBMITTED`.
3. **Loops through all items** — for each item with a `boqItem_ID`, increments `BOQItems.requestedQty` by the item's `requestedQty`.

This ensures the BOQ always reflects how much has been requested, preventing over-requesting.

---

### `_rejectRequest` — BOQ Quantity Reversal

The mirror of `_submitRequest`. When rejected:
1. **Loops through all items** — for each item with a `boqItem_ID`, decrements `BOQItems.requestedQty` (clamped to 0).
2. Sets status to `REJECTED`.

This releases the "held" BOQ quantity so Engineers can re-raise a corrected request.

---

### Three-Way Match (in ProjectService context)

`project-service.js` contains a duplicate implementation of `_performThreeWayMatch` for the `Invoices` entity exposed under `ProjectService`. The logic is identical to `InvoiceService._performThreeWayMatch` — the duplication exists because `ProjectService` also exposes `Invoices` (for `FinanceOfficer` working from within the project context) and the handler must be registered against the local entity reference.

---

### Post-Read Enrichment: `_enrichProjects` and `_enrichRequests`

Fires as `after('READ', ...)` on all project and MR entity variants.

Sets the virtual `criticality` field (an integer 0–3) which drives Fiori color coding:

| Status | Criticality | Color in Fiori |
|---|---|---|
| `DRAFT` | `0` | Grey (neutral) |
| `ACTIVE` | `3` | Green |
| `ON_HOLD` | `2` | Orange |
| `COMPLETED` | `1` | Blue |
| `CANCELLED` | `1` | Grey |
| `SUBMITTED` (MR) | `2` | Orange |
| `APPROVED` (MR) | `3` | Green |
| `REJECTED` (MR) | `1` | Red |
| `ORDERED` (MR) | `3` | Green |
| `CLOSED` (MR) | `0` | Grey |

---

# 5. Procurement Service

## File: `srv/procurement-service.cds`

### Purpose

Manages the **Purchase Order lifecycle and physical delivery tracking**. Procurement Officers work here after an MR is approved: they create POs from selected vendor quotations, confirm them (which triggers external system notifications), and track deliveries through to completion.

### Access Control

`@requires: ['ProcurementOfficer','Management','ProjectManager','SiteEngineer']`

### Exposed Entities

| Entity | Mode | Description |
|---|---|---|
| `PurchaseOrders` | Draft-enabled, full CRUD | Central PO management with Confirm/Cancel/Close actions |
| `PurchaseOrderItems` | Full CRUD | PO line items; auto-calculates amounts |
| `Deliveries` | Full CRUD | Delivery schedule and status tracking |
| `DeliveryItems` | Full CRUD | Per-delivery line items (dispatch quantities) |
| `MaterialMaster`, `VendorMaster`, `Projects`, `MaterialRequests`, `VendorQuotations` | `@readonly` | Reference data for UI value helps and cross-navigation |

### UI Annotations

`procurement-service.cds` contains extensive inline UI annotations:

- **`UI.LineItem`** for both POs and Deliveries
- **`UI.Facets`** structuring the PO object page into "PO Header", "Financial Details", "PO Line Items", and "Deliveries" tabs
- **Analytics annotations** (`@Analytics.Measure`, `@Aggregation.ApplySupported`) enabling the Analytical List Page (ALP) for spend analysis
- **`UI.Chart`** definitions: a donut chart (POs by Status) and a bar chart (Spend by Vendor)
- **`UI.SelectionVariant#ActivePOs`** pre-filters the list to exclude `CANCELLED` POs by default

### Actions on `PurchaseOrders`

| Action | Guard Logic |
|---|---|
| `confirmPO()` | Status must be `DRAFT`; must have line items; increments `VendorMaster.totalOrders`; triggers `pushDeliveryScheduleToSEGW` and `pushPOToRAP` |
| `cancelPO(reason)` | Blocked if status is `FULLY_DELIVERED`, `CLOSED`, or `CANCELLED` |
| `closePO()` | Allowed from `CONFIRMED`, `PARTIALLY_DELIVERED`, or `FULLY_DELIVERED` |

### Actions on `Deliveries`

| Action | Guard Logic |
|---|---|
| `markInTransit()` | Status must be `SCHEDULED` |
| `markDelivered(actualDate)` | Status must be `IN_TRANSIT` or `DELAYED`; calculates `delayDays`; triggers `_updatePODeliveryStatus`; increments `VendorMaster.onTimeDeliveries` if `delayDays = 0` |
| `markDelayed(reason, newDate)` | Status must be `SCHEDULED` or `IN_TRANSIT`; `reason` is mandatory; calculates delay days from today |

---

## File: `srv/procurement-service.js`

### `_calculatePOItemAmounts`

Fires `before(['CREATE','UPDATE'], PurchaseOrderItems)`.

**Logic:** `baseAmount = orderedQty × unitPrice` → `taxAmount = base × (taxPercent ?? 18) / 100` → `totalAmount = base + tax`. Also initializes `pendingQty = orderedQty` and `deliveredQty = 0` on creation.

### `_recalculatePOTotals`

Fires `after(['CREATE','UPDATE','DELETE'], PurchaseOrderItems)`.

**Logic:** Fetches all items for `purchaseOrder_ID`, sums `subtotal` and `taxAmount`, writes `grandTotal` back to the PO header. This keeps the PO financial summary always consistent without requiring the UI to compute it.

### `_derivePendingQty`

Fires `after('READ', PurchaseOrderItems)`.

**Logic:** Calculates `pendingQty = orderedQty − deliveredQty` in memory after each read. This is a virtual derivation — not stored separately — ensuring stale values never appear.

### `_confirmPO` — External Integration Trigger

After setting `status = 'CONFIRMED'`:
1. Increments `VendorMaster.totalOrders += 1`.
2. Calls `ext.pushDeliveryScheduleToSEGW(po)` — fire-and-forget, non-fatal.
3. Calls `ext.pushPOToRAP(po, items)` — fire-and-forget, non-fatal.

Both external calls use `.catch(() => {})` — failures in `SEGW` or `RAP` do not roll back the PO confirmation. This is correct for a solar EPC context where external systems may be unavailable during site commissioning.

### `_markDelivered` — Downstream Updates

After marking a delivery as delivered:
1. Calculates `delayDays = Math.max(0, (actual − scheduled) / 86400000)`.
2. Calls `_updatePODeliveryStatus(poId)` which sums all `deliveredQty` across PO items and transitions the PO to `PARTIALLY_DELIVERED` or `FULLY_DELIVERED`.
3. If `delayDays = 0`, increments `VendorMaster.onTimeDeliveries += 1`.

### `_enrichWithSEGWDeliveries`

Fires `after('READ', PurchaseOrders)`.

**Logic:** For each PO in the result, calls `ext.fetchDeliveriesFromSEGW(poNumber)`. If external delivery records are found, attaches them to `po.externalDeliveries`. Wrapped in `try/catch` — SEGW unavailability (common in dev) is silently ignored.

### `_validatePO`

Fires `before('CREATE', PurchaseOrders)`.

Enforces:
- `vendor_ID`, `project_ID`, `deliveryDate` are mandatory
- `deliveryDate > poDate` (can't deliver before ordering)

---

# 6. Vendor Service

## File: `srv/vendor-service.cds`

### Purpose

Dedicated service for **Vendor Master maintenance and RFQ/Quotation management**. Procurement Officers use this service to register new vendors, solicit and evaluate quotations, and select the winning bidder for a Material Request.

### Access Control

`@requires: ['ProcurementOfficer','Management','ProjectManager']`

### Key Design Decisions

**`ApprovedMaterialRequests` view:** Exposes only MRs with `status = 'APPROVED' OR status = 'ORDERED'`. This pre-filters what the Procurement Officer sees in the quotation creation flow — they cannot raise quotations against DRAFT or REJECTED MRs.

**`compareQuotations` function:** A custom OData function (not an action) that accepts a `materialRequestId` UUID. It transitions submitted quotations to `UNDER_EVALUATION` status and returns the full list sorted by `totalAmount ascending` — enabling side-by-side comparison. This simulates a lightweight sourcing event.

### Actions on `VendorQuotations`

| Action | Guard | Side Effect |
|---|---|---|
| `submitQuotation()` | Status must be `DRAFT`; must have items; `validityDate` must be set | Status → `SUBMITTED` |
| `selectVendor(selectionReason)` | Status must be `SUBMITTED` or `UNDER_EVALUATION` | Sets `isSelected = true`, `status = 'SELECTED'`; **rejects all sibling quotations** for the same MR |
| `rejectQuotation(reason)` | Cannot reject already `SELECTED` or `REJECTED` | Sets `status = 'REJECTED'`, stores reason in `commercialRemarks` |

---

## File: `srv/vendor-service.js`

### `_selectVendor` — Sibling Rejection Logic

This is the most important business rule in `VendorService`:

1. Fetches all quotations for the same `materialRequest_ID` where `ID != selectedID`.
2. Loops and sets each sibling to `{ status: 'REJECTED', isSelected: false }`.
3. Then sets the target quotation to `{ status: 'SELECTED', isSelected: true, selectionReason }`.

This ensures **exactly one vendor is selected per Material Request** — a fundamental procurement integrity requirement.

### `_compareQuotations`

1. Fetches quotations for the MR where status is `SUBMITTED`, `UNDER_EVALUATION`, or `SELECTED`.
2. Transitions any `SUBMITTED` quotations to `UNDER_EVALUATION` (marks that evaluation has begun).
3. Returns quotations ordered by `totalAmount asc` — the cheapest option first.

**Observation:** The function doesn't perform weighted scoring (factoring in lead days, quality score, payment terms). This is a simplification — a real procurement system would apply a weighted L1/L2/L3 scoring matrix.

### `_recalculateHeader`

Fires `after(['CREATE','UPDATE','DELETE'], VendorQuotationItems)`. Mirrors the same pattern as PO and Invoice total recalculation — ensures `VendorQuotations.subtotal`, `taxAmount`, `totalAmount` are always current.

---

# 7. Receipt Service

## File: `srv/receipt-service.cds`

### Purpose

Manages **Goods Receipt Notes (GRNs) and damaged material claims**. Site Engineers record what actually arrived vs. what was dispatched. Quality discrepancies trigger vendor quality score penalties and enable formal insurance/warranty claims.

### Access Control

`@requires: ['SiteEngineer','ProcurementOfficer','Management']`

### Exposed Entities

| Entity | Mode | Description |
|---|---|---|
| `MaterialReceipts` | Draft-enabled | GRN header — linked to delivery and PO |
| `MaterialReceiptItems` | Full CRUD | Per-material acceptance/rejection quantities |
| `DamagedMaterials` | Full CRUD with actions | Damaged item tracking with claim lifecycle |
| Reference entities | `@readonly` | `MaterialMaster`, `VendorMaster`, `PurchaseOrders`, `PurchaseOrderItems`, `Deliveries`, `DeliveryItems`, `Users` |

### Actions on `MaterialReceipts`

| Action | Guard | Logic |
|---|---|---|
| `verifyReceipt(verificationRemarks)` | Status must be `PENDING`; must have items | Determines status based on accepted/rejected totals: `VERIFIED` (no rejections), `PARTIALLY_ACCEPTED` (some accepted, some rejected), `FULLY_REJECTED` (all rejected); penalizes vendor quality if rejections exist |
| `rejectReceipt(rejectionReason)` | Status must be `PENDING`; reason mandatory | Status → `FULLY_REJECTED` |

### Actions on `DamagedMaterials`

| Action | Guard |
|---|---|
| `raiseClaim(claimAmount)` | Status must be `PENDING`; `claimAmount > 0` mandatory |
| `settleClaim(settlementAmount, response)` | Status must be `CLAIMED` |
| `rejectClaim(reason)` | Status must be `CLAIMED`; reason mandatory |

---

## File: `srv/receipt-service.js`

### `_validateReceiptItem`

Fires `before(['CREATE','UPDATE'], MaterialReceiptItems)`.

Enforces:
- `receivedQty ≥ 0`, `acceptedQty ≥ 0`, `rejectedQty ≥ 0`
- `acceptedQty + rejectedQty = receivedQty` (within 0.001 tolerance)
- Auto-sets `condition`: `PARTIAL` when both accepted and rejected, `DAMAGED` when all rejected

### `_updateDeliveredQty` — The Quantity Cascade

This is the most critical quantity-tracking chain in the entire system. Fires `after('CREATE', MaterialReceiptItems)`.

**Chain:**
```
MaterialReceiptItems.acceptedQty
    → PurchaseOrderItems.deliveredQty += acceptedQty
    → PurchaseOrderItems.pendingQty = orderedQty - deliveredQty
    → (if poItem.requestItem_ID exists)
        → MaterialRequestItems (lookup boqItem_ID)
            → BOQItems.receivedQty += acceptedQty
```

This single handler maintains BOQ completion tracking automatically. The `DashboardService.MaterialConsumption` view reads `BOQItems.receivedQty` to compute `completionPct` — meaning GRN entries directly power the project progress dashboard.

### `_penalizeVendorQuality`

Fires inside `_verifyReceipt` when `totalRejected > 0`.

**Logic:**
1. Fetches the PO to get `vendor_ID`.
2. Decrements `VendorMaster.qualityScore` by 0.5, clamped to minimum 0.
3. Uses `cds.entities('solar.epc')` (global namespace lookup) rather than `this.entities` because the `VendorMaster` entity is not directly exposed in `ReceiptService`.

---

# 8. Invoice Service

## File: `srv/invoice-service.cds`

### Purpose

Dedicated Finance service simulating an **SAP RAP-style invoice management pattern**. Finance Officers enter vendor invoices, run the three-way match engine, and manage the approval-to-payment workflow.

### Access Control

`@requires: ['FinanceOfficer','Management']`

### Exposed Entities

| Entity | Mode | Description |
|---|---|---|
| `Invoices` | Draft-enabled | Invoice header with full action lifecycle |
| `InvoiceItems` | Full CRUD | Invoice line items (quantity + price) |
| `ThreeWayMatchResults` | `@readonly` | Match audit trail — read-only, generated by `performThreeWayMatch` |
| Reference entities | `@readonly` | `VendorMaster`, `PurchaseOrders`, `PurchaseOrderItems`, `MaterialReceipts`, `MaterialReceiptItems`, `MaterialMaster`, `Users` |

### Actions on `Invoices`

| Action | Guard | Side Effect |
|---|---|---|
| `submitInvoice()` | `DRAFT` only; must have items | → `SUBMITTED` |
| `performThreeWayMatch()` | `SUBMITTED`, `UNDER_REVIEW`, or `MISMATCH` only; `receipt_ID` must be set | Deletes old match results; generates new `ThreeWayMatchResults` rows; sets invoice to `MATCHED` or `MISMATCH` |
| `approveInvoice()` | `MATCHED`, `MISMATCH`, or `UNDER_REVIEW` | → `APPROVED`; increments `Projects.spentAmount`; adjusts `VendorMaster.performanceScore +0.2`; triggers `patchDeliveryToInvoicedInSEGW` |
| `rejectInvoice(reason)` | Not `PAID` or `REJECTED`; reason mandatory | → `REJECTED`; adjusts `VendorMaster.performanceScore −0.3` |
| `markPaid(paymentReference, paymentDate)` | `APPROVED` only; `paymentReference` mandatory | → `PAID`; records payment reference and date |

---

## File: `srv/invoice-service.js`

### `_validateInvoice`

Fires `before('CREATE', Invoices)`. Two checks:
1. `vendorInvoiceNo` and `purchaseOrder_ID` are mandatory.
2. **Duplicate prevention:** Queries `Invoices` for matching `vendorInvoiceNo + vendor_ID`. If found, returns `HTTP 400 "Vendor invoice already exists for this vendor"`. This prevents Finance from entering the same vendor document twice.

### `_performThreeWayMatch` — Core Engine

This is the most complex function in the project.

**Inputs:** Invoice items, PO items, Receipt items (with RAP fallback).

**RAP Fallback Logic:**
```
1. Load local MaterialReceiptItems where receipt_ID = inv.receipt_ID
2. If empty → call ext.fetchGRNFromRAP(po.poNumber)
3. Map RAP GRN items to local receipt item shape (best-effort field mapping)
```

This means the three-way match can work even if the GRN was created in the external SAP RAP system rather than locally.

**Match Algorithm (per invoice line):**

```
poQty       = PO item orderedQty
receivedQty = Receipt item acceptedQty
invoicedQty = Invoice item invoicedQty
poPrice     = PO item unitPrice
invPrice    = Invoice item unitPrice

qtyDeviation   = |invoicedQty - receivedQty|
priceDeviation = |invPrice - poPrice|

qtyMatched   = qtyDeviation ≤ 0.001
priceMatched = priceDeviation ≤ 0.01

lineStatus:
  Both match     → MATCHED
  Only qty fails → QUANTITY_MISMATCH
  Only price fails → PRICE_MISMATCH
  Both fail      → BOTH_MISMATCH
```

**Variance fields stored:**
- `qtyVariance = invoicedQty − receivedQty` (positive = invoice claims more than received)
- `priceVariance = invPrice − poPrice` (positive = invoice price exceeds PO price)
- `valueVariance = qtyVariance × invPrice` (financial impact of the discrepancy)

**Overall Invoice Status:**
- All lines `MATCHED` → Invoice → `MATCHED`
- Any line mismatched → Invoice → `MISMATCH`

**Note:** The engine always clears previous match results (`DELETE FROM ThreeWayMatchResults WHERE invoice_ID = ID`) before inserting new ones. Re-running the match is therefore idempotent and safe.

### `_approveInvoice` — Budget Impact

After approval:
1. **`_updateProjectSpentAmount(poId, totalAmount)`:** Chains `Invoices → PurchaseOrders → Projects` and increments `spentAmount += totalAmount`. This is how the budget utilization percentage in `DashboardService.ProjectSummary` stays current.
2. **`_updateVendorInvoiceScore(vendorId, true)`:** Adds `+0.2` to `VendorMaster.performanceScore`, clamped to 10.
3. **`ext.patchDeliveryToInvoicedInSEGW(poNumber)`:** Fire-and-forget PATCH to mark SEGW delivery records as `INVOICED`.

---

# 9. Dashboard Service

## File: `srv/dashboard-service.cds`

### Purpose

Read-only analytics service providing pre-aggregated views and KPI functions to Management, Project Managers, Finance Officers, and Procurement Officers. All views are computed directly from the `solar.epc` namespace using CDS SQL-like syntax — no denormalized summary tables are maintained.

### Access Control

`@requires: ['Management','ProjectManager','FinanceOfficer','ProcurementOfficer']`

### Exposed Views

| View | Source Entities | Key Metrics |
|---|---|---|
| `ProjectSummary` | `epc.Projects` | `remainingBudget = budget − spentAmount`; `budgetUtilizationPct = (spentAmount / budget) × 100` |
| `ProcurementKPI` | `epc.PurchaseOrders` | Per-project: `totalPOs`, `totalPOValue`, `confirmedPOs`, `deliveredPOs`, `cancelledPOs` — grouped by project |
| `DeliveryPerformance` | `epc.Deliveries` | Per-vendor: `totalDeliveries`, `onTime` (delivered with `delayDays = 0`), `delayed`, `avgDelayDays`, `maxDelayDays` |
| `ReceiptQuality` | `epc.MaterialReceiptItems` | Per-project: `totalDispatched`, `totalAccepted`, `totalRejected`, `rejectionRate = (rejected / dispatched) × 100` |
| `InvoiceMatchingSummary` | `epc.Invoices` | Per-vendor: `totalInvoices`, `totalValue`, `matched`, `mismatched`, `paid`, `approved` |
| `VendorPerformanceSummary` | `epc.VendorMaster` | Filtered `isActive = true`; adds `onTimeDeliveryPct = (onTimeDeliveries / totalOrders) × 100` |
| `MaterialConsumption` | `epc.BOQItems` | Per BOQ line: `pendingQty = plannedQty − receivedQty`; `completionPct = (receivedQty / plannedQty) × 100` |
| `ThreeWayMatchSummary` | `epc.ThreeWayMatchResults` | Per-project: counts by match status, `totalVariance = SUM(ABS(valueVariance))` |

**Design Note:** These views leverage CDS `CASE WHEN` and `COUNT(CASE WHEN ... THEN 1 END)` for conditional aggregation. This is evaluated by the underlying database (SQLite/HANA) and performs efficiently without application-layer aggregation.

---

## File: `srv/dashboard-service.js`

### `_getProjectHealth(projectId)`

A composite function handler that produces a single health summary object by sequentially querying across four entity types.

**Logic:**

1. **Budget utilization:** `(spentAmount / budget) × 100`
2. **Procurement status:** `"X/Y POs confirmed"` — counts non-DRAFT, non-CANCELLED POs
3. **Delivery status:** Fetches all deliveries for the project's POs; returns `"X/Y delivered, Z delayed"`
4. **Invoice status:** Fetches all invoices for the project's POs; returns `"X/Y paid, Z pending"`
5. **Overall health classification:**
   - `CANCELLED` or `COMPLETED` → mirrors project status
   - `budgetUtilization > 90%` → `AT_RISK`
   - `budgetUtilization > 75%` → `CAUTION`
   - Otherwise → `ON_TRACK`

**Note:** This function uses `cds.entities('solar.epc')` to access `PurchaseOrders`, `Deliveries`, `Invoices` — entities not exposed in `DashboardService` itself. This is valid because CAP's global entity registry is accessible anywhere within the application process.

---

# 10. External Integration Layer

## File: `srv/integration/ExternalServices.js`

### Purpose

This module implements a **one-way outbound integration layer** from CAP to two external SAP systems. The direction is strictly `CAP → external` for writes, with limited read-backs. All calls are **fire-and-warn** — failures emit log warnings but do not cause exceptions or transaction rollbacks.

### External Systems

| System | Kind | Destination Name | Purpose |
|---|---|---|---|
| `SEGW_DELIVERY_SRV` | OData V2 | `SOLAR_EPC_SEGW` | `ZSOLAR_DELIVERY_SRV` — Legacy ABAP service managing delivery schedules |
| `RAP_SERVICE` | OData V4 | `SOLAR_EPC_RAP` | `ZRAP_MATERIAL_RECEIPT` — Modern ABAP RAP service managing GRNs |

Both are configured in `.cdsrc.json` under `requires`, pointing to Cloud Foundry `destination` names. In development, connections fail gracefully and log `"connect failed (dev mode)"`.

### Lazy Connection Initialization

Both `getRAPService()` and `getSEGWService()` use module-level cached variables (`rapSvc`, `segwSvc`). The first call establishes the connection via `cds.connect.to()`; subsequent calls return the cached instance. This avoids repeated connection overhead per request.

### Functions

#### `pushPOToRAP(po, items)`

Triggered by: `ProcurementService._confirmPO`

**Sends:** `POST /PurchaseOrderSet` to RAP with PO number, vendor code, project code, and line items (material code, ordered qty, unit price, UOM).

**Purpose:** Enables the external RAP system to create a GRN entry against this PO — essential for the three-way match flow if GRNs are processed in the external system.

---

#### `pushDeliveryScheduleToSEGW(po)`

Triggered by: `ProcurementService._confirmPO`

**Sends:** `POST /DeliverySet` to SEGW with PO number, vendor ID, scheduled date, and initial status `"SCHEDULED"`.

**Purpose:** Creates a delivery tracking record in the legacy SEGW system so the logistics team can monitor and update delivery status from the ABAP side.

---

#### `fetchGRNFromRAP(poNumber)`

Triggered by: `InvoiceService._performThreeWayMatch` (fallback path)

**Sends:** `GET /GRNSet?$filter=PONumber eq '{poNumber}'&$expand=Items`

**Returns:** First GRN record found, or `null`. Used when `MaterialReceiptItems` in CAP are empty (GRN was done in external RAP, not locally).

---

#### `fetchDeliveriesFromSEGW(poNumber)`

Triggered by: `ProcurementService._enrichWithSEGWDeliveries` (after READ)

**Sends:** `GET /DeliverySet?$filter=PONumber eq '{poNumber}'`

**Returns:** Array of delivery records. Merged into `po.externalDeliveries` virtual field on PO read results.

---

#### `patchDeliveryToInvoicedInSEGW(poNumber)`

Triggered by: `InvoiceService._approveInvoice`

**Logic:** Fetches deliveries for the PO from SEGW, then patches each one with `{ Status: 'INVOICED' }` — informing the legacy logistics system that the invoice has been approved and payment is due.

---

# 11. App Router — `app/router/`

## File: `app/router/xs-app.json`

### Purpose

Defines routing rules for the SAP App Router (`@sap/approuter`). The App Router is the single entry point in Cloud Foundry — all browser requests pass through it, and it handles XSUAA token validation before forwarding traffic to backend destinations.

### Routes Breakdown

| Route Source Pattern | Target | Destination | Auth | CSRF |
|---|---|---|---|---|
| `^/sap/opu/odata/sap/ZSOLAR_DELIVERY_SRV/(.*)$` | `/sap/opu/odata/sap/ZSOLAR_DELIVERY_SRV/$1` | `SOLAR_EPC_SEGW` | `xsuaa` | Yes |
| `^/sap/opu/odata/sap/VENDOR_SRV/(.*)$` | `/sap/opu/odata/sap/VENDOR_SRV/$1` | `SOLAR_EPC_SEGW` | `xsuaa` | Yes |
| `^/sap/opu/odata4/sap/zrap_material_receipt/(.*)$` | `/sap/opu/odata4/sap/zrap_material_receipt/$1` | `SOLAR_EPC_RAP` | `xsuaa` | Yes |
| `^/(.*)$` | `$1` | `srv-api` | `xsuaa` | Yes |

### Route Analysis

**Routes 1–3 (external ABAP systems):**
Direct reverse-proxy rules that forward specific OData paths to the two external SAP systems (`SOLAR_EPC_SEGW` for SEGW delivery service, `SOLAR_EPC_RAP` for the RAP GRN service). These allow the Fiori UI to call SEGW/RAP directly from the browser without CORS issues, with XSUAA authentication enforced by the App Router.

**Route 4 (catch-all `^/(.*)$`):**
The default fallback that forwards all remaining requests to the `srv-api` destination — which resolves to the CAP Node.js server. This covers all CAP OData endpoints (`/project/`, `/procurement/`, `/vendor/`, `/receipt/`, `/invoice/`, `/dashboard/`, `/auth/`).

**Security:** Every route uses `authenticationType: "xsuaa"` — unauthenticated requests are rejected at the App Router before reaching any backend. `csrfProtection: true` prevents cross-site request forgery on all mutating operations.

---

## File: `app/router/package.json`

### Dependencies

| Package | Version | Role |
|---|---|---|
| `@sap/approuter` | `^21.0.0` | The App Router runtime — handles XSUAA OAuth2 flows, session management, routing |

### Start Command

`node node_modules/@sap/approuter/approuter.js` — launches the approuter as a Node.js process. In Cloud Foundry, this is the process started by the `web` module in `mta.yaml`.

---

## File: `app/router/default-env.json`

### Purpose

Local development environment configuration. Provides mock destination bindings so the App Router can forward requests without Cloud Foundry's environment variable injection.

### Configured Destinations

| Name | URL | Token Forwarding |
|---|---|---|
| `srv-api` | `http://localhost:4004` | `forwardAuthToken: true` — passes the XSUAA (or mocked) JWT token through to the CAP server |

**Security Risk:** This file contains the local development destination configuration. It should be in `.gitignore` for production setups (or use `default-env.json.example` + CI injection). Currently it only contains a localhost URL, so the risk is minimal, but it establishes a pattern that could include credentials if extended.

---

## File: `app/services.cds`

A single-line file:
```
using from './projectmanagement/annotations';
```

This imports the Fiori UI annotations from `app/projectmanagement/annotations.cds` into the service layer, making them available to the CAP model compiler for metadata generation. It bridges the UI-specific annotations with the service definitions.

---

# 12. End-to-End Request Flow

## Full P2P Lifecycle Trace

The following traces a complete Solar EPC procurement cycle from project creation to invoice payment.

---

### Phase 1: Project Creation and Activation

```
BDM → App Router → /project/Projects (POST)
    → XSUAA validates token; role "BDM" confirmed
    → ProjectService.before('CREATE', Projects)
        → _generateProjectCode: queries last project, generates "PRJ-2026-0001"
        → sets status = 'DRAFT', spentAmount = 0
    → CAP writes to solar.epc-Projects (SQLite/HANA)

BDM → /project/Projects/{ID}/activateProject (POST)
    → ProjectService._activateProject
        → validates status = 'DRAFT'
        → UPDATE Projects SET status = 'ACTIVE'
    → Project is now ACTIVE — Engineers can begin BOQ work
```

---

### Phase 2: BOQ Definition by Engineer

```
Engineer → /project/ActiveProjects/{ID}/boqItems (POST)
    → @restrict validates Engineer role + project status = ACTIVE
    → ProjectService.before('SAVE', BOQItems)
        → _calculateBOQValue: estimatedValue = plannedQty × estimatedRate
    → BOQ line item saved with plannedQty, requestedQty = 0, receivedQty = 0
```

---

### Phase 3: Material Request Workflow

```
Engineer → /project/ActiveProjects/{PID}/materialRequests (POST)
    → _checkProjectActiveGate: confirms project ACTIVE
    → _generateRequestNumber: "MR-2026-0001"
    → status = 'DRAFT', requestedBy auto-filled from req.user

Engineer → adds items via /materialRequests/{ID}/items (POST)
    → _validateRequestItem: checks qty > 0, material is set
    → validates BOQ availability: requestedQty ≤ (plannedQty − requestedQty)
    → auto-assigns lineNumber

Engineer → submitRequest action
    → validates status = 'DRAFT' and items exist
    → for each item with boqItem_ID:
        → BOQItems.requestedQty += item.requestedQty (BOQ is now "committed")
    → status → 'SUBMITTED'

ProjectManager → approveRequest(approvalRemarks)
    → validates status = 'SUBMITTED'
    → status → 'APPROVED'; approvalDate set; approvedBy set from req.user
```

---

### Phase 4: Vendor Quotation and Selection

```
ProcurementOfficer → /vendor/VendorMaster (POST)
    → VendorService._generateVendorCode: "VND-2026-0001"
    → performanceScore, totalOrders, etc. initialized to 0

ProcurementOfficer → /vendor/VendorQuotations (POST, linked to APPROVED MR)
    → _generateQuotationNumber: "QT-2026-0001"
    → status = 'DRAFT'

ProcurementOfficer → adds items to quotation
    → _calculateItemAmounts: taxAmount and totalAmount computed
    → after every item change: _recalculateHeader updates VendorQuotations totals

ProcurementOfficer → submitQuotation
    → validates DRAFT, has items, has validityDate
    → status → 'SUBMITTED'

ProcurementOfficer → compareQuotations(materialRequestId)
    → all SUBMITTED quotations → UNDER_EVALUATION
    → returns list sorted by totalAmount ASC (cheapest first)

ProcurementOfficer → selectVendor(selectionReason) on winning quotation
    → all sibling quotations → { status: 'REJECTED', isSelected: false }
    → winning quotation → { status: 'SELECTED', isSelected: true }
```

---

### Phase 5: Purchase Order

```
ProcurementOfficer → /procurement/PurchaseOrders (POST)
    → _validatePO: vendor, project, deliveryDate mandatory; deliveryDate > poDate
    → _generatePONumber: "PO-2026-0001"
    → status = 'DRAFT'

ProcurementOfficer → adds PO items
    → _calculatePOItemAmounts: baseAmount, taxAmount, totalAmount computed
    → _recalculatePOTotals: PO grandTotal updated

ProcurementOfficer → confirmPO
    → validates DRAFT + has items
    → status → 'CONFIRMED'; approvalDate set
    → VendorMaster.totalOrders += 1
    → ext.pushDeliveryScheduleToSEGW(po) [fire-and-forget]
    → ext.pushPOToRAP(po, items) [fire-and-forget]
```

---

### Phase 6: Delivery Tracking

```
ProcurementOfficer → /procurement/Deliveries (POST, linked to PO)
    → _generateDeliveryNumber: "DEL-2026-0001"
    → status = 'SCHEDULED'

ProcurementOfficer → markInTransit
    → validates SCHEDULED
    → status → 'IN_TRANSIT'

ProcurementOfficer → markDelivered(actualDate) or markDelayed(reason, newDate)
    → markDelivered:
        → calculates delayDays
        → _updatePODeliveryStatus: checks all PO items' deliveredQty
            → PO → 'PARTIALLY_DELIVERED' or 'FULLY_DELIVERED'
        → if delayDays = 0: VendorMaster.onTimeDeliveries += 1
    → markDelayed:
        → calculates delayDays from today − scheduledDate
        → status → 'DELAYED'; new scheduledDate set
```

---

### Phase 7: Goods Receipt (GRN)

```
SiteEngineer → /receipt/MaterialReceipts (POST, linked to Delivery + PO)
    → _generateReceiptNumber: "GRN-2026-0001"
    → status = 'PENDING'

SiteEngineer → adds receipt items
    → _validateReceiptItem: qty ≥ 0; accepted + rejected = received; auto-set condition
    → after CREATE: _updateDeliveredQty cascades:
        → PurchaseOrderItems.deliveredQty += acceptedQty
        → PurchaseOrderItems.pendingQty = orderedQty − deliveredQty
        → BOQItems.receivedQty += acceptedQty (via requestItem → boqItem chain)

SiteEngineer → verifyReceipt(verificationRemarks)
    → calculates totalAccepted, totalRejected from items
    → status → VERIFIED / PARTIALLY_ACCEPTED / FULLY_REJECTED
    → if rejections: _penalizeVendorQuality → VendorMaster.qualityScore −= 0.5

SiteEngineer → raiseClaim(claimAmount) on DamagedMaterials
    → claimStatus: PENDING → CLAIMED
```

---

### Phase 8: Invoice and Three-Way Match

```
FinanceOfficer → /invoice/Invoices (POST, linked to PO + GRN)
    → _generateInvoiceNumber: "INV-2026-0001"
    → _validateInvoice: checks no duplicate vendorInvoiceNo for same vendor
    → status = 'DRAFT'

FinanceOfficer → adds invoice items
    → _calculateItemAmounts: taxAmount, totalAmount computed
    → _recalculateInvoiceTotals: Invoice totals updated

FinanceOfficer → submitInvoice
    → validates DRAFT + has items → status → 'SUBMITTED'

FinanceOfficer → performThreeWayMatch
    → loads: invoice items, PO items, receipt items (with RAP fallback)
    → DELETE previous ThreeWayMatchResults for this invoice
    → per invoice line:
        → find matching PO item (by poItem_ID or material_ID)
        → find matching receipt item (by material_ID or poItem_ID)
        → compare qty (tolerance 0.001) and price (tolerance 0.01)
        → classify: MATCHED / QUANTITY_MISMATCH / PRICE_MISMATCH / BOTH_MISMATCH
    → INSERT ThreeWayMatchResults rows
    → invoice → 'MATCHED' (all lines) or 'MISMATCH' (any line fails)

FinanceOfficer → approveInvoice
    → validates MATCHED or UNDER_REVIEW
    → status → 'APPROVED'; approvalDate set
    → _updateProjectSpentAmount: Projects.spentAmount += invoice.totalAmount
    → _updateVendorInvoiceScore: VendorMaster.performanceScore += 0.2
    → ext.patchDeliveryToInvoicedInSEGW(poNumber) [fire-and-forget]

FinanceOfficer → markPaid(paymentReference, paymentDate)
    → validates APPROVED + paymentReference present
    → status → 'PAID'; paymentReference and paymentDate stored
```

---

### Phase 9: Dashboard and Analytics

```
Management / ProjectManager → /dashboard/ProjectSummary
    → Reads Projects view: remainingBudget, budgetUtilizationPct (spentAmount updated in Phase 8)

Management → /dashboard/getProjectHealth(projectId)
    → DashboardService._getProjectHealth:
        → queries Projects, PurchaseOrders, Deliveries, Invoices
        → returns: { projectCode, budgetUtilization, procurementStatus, deliveryStatus, invoiceStatus, overallHealth }
        → overallHealth: AT_RISK (>90%), CAUTION (>75%), ON_TRACK (<75%)

Management → /dashboard/MaterialConsumption
    → Shows BOQItems with completionPct = (receivedQty / plannedQty) × 100
    → receivedQty was updated in Phase 7 (_updateDeliveredQty cascade)

ProcurementOfficer → /dashboard/VendorPerformanceSummary
    → Shows performanceScore (live, updated across Phases 5/7/8), onTimeDeliveryPct
```

---

## Authentication Flow

```
Browser → App Router (xs-app.json)
    → XSUAA validates OAuth2 Bearer token
    → route matched: ^/(.*)$ → forwards to srv-api (localhost:4004 in dev)
    → CAP reads req.user from token
    → @requires annotation verified: role must be in allowed list
    → @restrict annotation evaluated per operation + entity
    → handler receives req with populated req.user.id, req.user.is(role)
    → AuthService.me() available at any time for UI role resolution
```

---

---

# 13. Frontend Layer — `app/projectmanagement/`

## Overview

The frontend is a **single SAP UI5 application** (`solar.epc.projectmanagement`) that hosts every role-specific screen. It has no separate per-role app — instead, a central `Component.js` with a route guard and `RoleService.js` adapt the entire UI dynamically based on the authenticated user's role. A second standalone app (`solar.epc.managementoverview`) provides the OVP executive dashboard.

**Key frontend files:**

| File | Responsibility |
|---|---|
| `webapp/Component.js` | App boot, session management, route guard |
| `webapp/App.controller.js` | Shell: back-button history, theme switcher, page banner |
| `webapp/manifest.json` | All 27 routes, 5 OData models, all targets |
| `webapp/service/RoleService.js` | Role constants, route permissions, access model, todo items |
| `webapp/login/LoginPage.controller.js` | Credential-based login + XSUAA SSO detection |
| `webapp/home/HomePage.controller.js` | Role-adaptive home screen |
| `webapp/management/ManagementDashboard.controller.js` | Management KPI dashboard |
| `webapp/vendor/QuotationComparison.controller.js` | Side-by-side quotation evaluation |

---

## File: `app/projectmanagement/webapp/manifest.json`

### Purpose

The application manifest is the single configuration source for all routing, data sources, and UI5 library dependencies. It defines 5 OData V4 models and 27 named routes.

### Data Sources and Models

| Model Name | Service URI | Backing CAP Service |
|---|---|---|
| (default) | `/project/` | `ProjectService` |
| `vendorService` | `/vendor/` | `VendorService` |
| `invoiceService` | `/invoice/` | `InvoiceService` |
| `procurementService` | `/procurement/` | `ProcurementService` |
| `dashboardService` | `/dashboard/` | `DashboardService` |

All models use `operationMode: "Server"`, `autoExpandSelect: true`, and `earlyRequests: true` — standard Fiori Elements performance settings.

### Route Map

| Route Name | URL Pattern | Target | Allowed Roles |
|---|---|---|---|
| `LoginPage` | `` (empty) | `LoginPage` | All |
| `HomePage` | `home` | `HomePage` | All |
| `ProjectsList` | `Projects` | `ProjectsList` | BDM, MANAGEMENT |
| `ProjectsObjectPage` | `Projects({key})` | `ProjectsObjectPage` | BDM, MANAGEMENT |
| `EngineeringProjectsList` | `ActiveProjects` | `EngineeringProjectsList` | ENGINEER, MANAGEMENT |
| `EngineerObjectPage` | `ActiveProjects({key})` | `EngineerObjectPage` | ENGINEER, MANAGEMENT |
| `SeniorProjectsList` | `SeniorActiveProjects` | `SeniorProjectsList` | PROJECT_MANAGER, MANAGEMENT |
| `SeniorObjectPage` | `SeniorActiveProjects({key})` | `SeniorObjectPage` | PROJECT_MANAGER, MANAGEMENT |
| `VendorList` | `VendorMaster` | `VendorList` | PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT |
| `VendorObjectPage` | `VendorMaster({key})` | `VendorObjectPage` | PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT |
| `QuotationComparison` | `CompareQuotations` | `QuotationComparison` | PROJECT_MANAGER, PROCUREMENT_OFFICER, MANAGEMENT |
| `MRApprovalDashboard` | `MaterialRequests` | `MRApprovalDashboard` | PROJECT_MANAGER, MANAGEMENT |
| `MRApprovalDetail` | `MaterialRequests({key})` | `MRApprovalDetail` | PROJECT_MANAGER, MANAGEMENT |
| `ProcurementMRList` | `ApprovedMaterialRequests` | `ProcurementMRList` | PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT |
| `ProcurementMRDetail` | `ApprovedMaterialRequests({key})` | `ProcurementMRDetail` | PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT |
| `GRNList` | `GRNReceipts` | `GRNList` | SITE_ENGINEER, PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT |
| `GRNObjectPage` | `GRNReceipts({key})` | `GRNObjectPage` | SITE_ENGINEER, PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT |
| `DeliveryList` | `Deliveries` | `DeliveryList` | SITE_ENGINEER, PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT |
| `DeliveryObjectPage` | `Deliveries({key})` | `DeliveryObjectPage` | SITE_ENGINEER, PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT |
| `POList` | `PurchaseOrders` | `POList` | PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT |
| `POObjectPage` | `PurchaseOrders({key})` | `POObjectPage` | PROCUREMENT_OFFICER, PROJECT_MANAGER, MANAGEMENT |
| `InvoiceList` | `Invoices` | `InvoiceList` | FINANCE_OFFICER, MANAGEMENT |
| `InvoiceObjectPage` | `Invoices({key})` | `InvoiceObjectPage` | FINANCE_OFFICER, MANAGEMENT |
| `EngineerMRObjectPage` | `ActiveProjects({key})/materialRequests({mrKey})` | `EngineerMRObjectPage` | ENGINEER, MANAGEMENT |
| `SeniorMRObjectPage` | `SeniorActiveProjects({key})/materialRequests({mrKey})` | `SeniorMRObjectPage` | PROJECT_MANAGER, MANAGEMENT |
| `GRNAnalytics` | `GRNReceiptAnalytics` | `GRNAnalytics` | MANAGEMENT, PROJECT_MANAGER, PROCUREMENT_OFFICER |
| `ManagementDashboard` | (custom target) | `ManagementDashboard` | MANAGEMENT only |

**Design Note:** Routes for `EngineerMRObjectPage` and `SeniorMRObjectPage` use nested patterns (`ActiveProjects({key})/materialRequests({mrKey})`) to support deep-linking directly into a Material Request within its parent Project context. This is essential for the MR approval workflow.

---

## File: `webapp/Component.js`

### Purpose

The application component is the central **authentication orchestrator**. It:
1. Creates a `session` JSONModel shared across all views
2. Installs a `beforeRouteMatched` guard that blocks unauthorized navigation
3. Handles login via credentials or restores session from `sessionStorage`
4. Propagates the `Authorization` header to all 5 OData models after credential login

### Session Model Schema

```json
{
  "authPending": true,
  "authMode": "",
  "isLocalSimulation": false,
  "canSwitchRole": false,
  "currentRole": "MANAGEMENT",
  "availableRoles": [],
  "capRoles": [],
  "uiRoles": [],
  "userId": "",
  "userName": "",
  "email": "",
  "loggedIn": false,
  "unauthorized": false,
  "lastDeniedRoute": ""
}
```

`authPending: true` acts as a semaphore — the route guard skips all enforcement while it is `true`, preventing flashes of unauthorized screens during the async `/auth/me()` fetch.

### `loginWithCredentials(username, password)`

Called by `LoginPage.controller.js` on form submit.

**Logic:**
1. Encodes credentials as `Basic {btoa(username:password)}`
2. Stores the header in `sessionStorage` under key `solarEpcAuth`
3. Calls `_loadSession(authHeader)` which fetches `/auth/me()` with the header

### `_loadSession(authHeader)`

The core session bootstrap function.

**Logic:**
1. Sets `authPending = true`
2. Calls `GET /auth/me()` with the `Authorization` header
3. On success: populates all session model properties from the `UserSession` response
4. Calls `_applyAuthorizationHeader` to inject the header into all 5 OData models
5. Checks `solarEpcIntendedHash` from `sessionStorage` to restore navigation state on reload
6. Navigates to `HomePage` if currently on `LoginPage`
7. On failure: sets `loggedIn = false`, navigates to `LoginPage`, removes stale `sessionStorage`

### `_onBeforeRouteMatched(event)`

The route guard. Runs before every navigation.

**Logic tree:**
```
If authPending → skip (auth in progress)
If route = LoginPage AND loggedIn → redirect to HomePage
If route = LoginPage → allow (user must log in)
If NOT loggedIn → redirect to LoginPage
If RoleService.canAccessRoute(role, routeName) = false →
    set unauthorized = true, lastDeniedRoute = routeName
    redirect to HomePage
Else → allow navigation
```

---

## File: `webapp/service/RoleService.js`

### Purpose

A pure JavaScript service module (no UI5 dependencies) that is the **single source of truth for all role-based UI decisions** in the frontend. It is consumed by `Component.js`, `HomePage.controller.js`, and `LoginPage.controller.js`.

### Role Constants (`ROLES`)

| Constant | Value | Backend CAP Role | Display Name |
|---|---|---|---|
| `BDM` | `"BDM"` | `BDM` | Business Development Manager |
| `ENGINEER` | `"ENGINEER"` | `Engineer` | Engineer |
| `PROJECT_MANAGER` | `"PROJECT_MANAGER"` | `ProjectManager` | Senior Engineer |
| `PROCUREMENT_OFFICER` | `"PROCUREMENT_OFFICER"` | `ProcurementOfficer` | Procurement Officer |
| `SITE_ENGINEER` | `"SITE_ENGINEER"` | `SiteEngineer` | Site Engineer |
| `FINANCE_OFFICER` | `"FINANCE_OFFICER"` | `FinanceOfficer` | Finance Officer |
| `MANAGEMENT` | `"MANAGEMENT"` | `Management` | Management |

**Note:** `PROJECT_MANAGER` is the CAP backend role name but displays as "Senior Engineer" in the UI — a deliberate product decision to map the system role name to the solar EPC org structure terminology.

### `ROUTE_PERMISSIONS`

A map of every route name to the roles that can access it. Used by `canAccessRoute(role, routeName)`. Unknown routes default to open (no restriction). Key restrictions:

- `ManagementDashboard` → `MANAGEMENT` only
- `ProjectsList` / `ProjectsObjectPage` → `BDM`, `MANAGEMENT` only (full project CRUD view)
- `EngineeringProjectsList` / `EngineerObjectPage` → `ENGINEER`, `MANAGEMENT` only
- `InvoiceList` / `InvoiceObjectPage` → `FINANCE_OFFICER`, `MANAGEMENT` only

### `ROLE_ACCESS`

Per-role configuration object used by `getAccessModel()` to produce a flat JSONModel-bindable object. Controls:

- **`tiles`**: Which workspace tiles appear on HomePage (engineeringProjects, procurement, siteOps, vendorRebates, finance)
- **`features`**: `insightCard` flag (PROJECT_MANAGER, PROCUREMENT_OFFICER, FINANCE_OFFICER, MANAGEMENT see an insight card)
- **`apps`**: App launcher visibility (13 app shortcuts)

**Role tile visibility summary:**

| Role | Engineering | Procurement | Site Ops | Vendor Rebates | Finance |
|---|---|---|---|---|---|
| BDM | Yes | No | No | No | No |
| ENGINEER | Yes | No | No | No | No |
| PROJECT_MANAGER | Yes | Yes | No | No | No |
| PROCUREMENT_OFFICER | No | Yes | No | No | No |
| SITE_ENGINEER | No | No | Yes | No | No |
| FINANCE_OFFICER | No | No | No | No | Yes |
| MANAGEMENT | Yes | Yes | Yes | Yes | Yes |

### `ROLE_TODOS`

Role-specific pre-seeded task items shown in the "Action Center" on HomePage. Each todo has `task`, `project`, `role`, `icon`, `status`, `state`. Clicking a todo routes to the relevant functional screen via `onTodoPress`.

### Public API Methods

| Method | Purpose |
|---|---|
| `canAccessRoute(role, routeName)` | Returns `true` if the role is in `ROUTE_PERMISSIONS[routeName]` |
| `getAccessModel(role)` | Returns flat object for JSONModel: `tile_*`, `app_*`, `insightCard` |
| `getTodos(role)` | Returns the role's pre-seeded todo list |
| `getPrimaryRole(uiRoles[])` | Returns highest-priority role from the `ROLE_PRIORITY` array |
| `getRoleOptions(uiRoles[])` | Returns `[{key, text}]` array for a `Select` control |
| `getDisplayName(role)` | Returns display string (e.g., `"Senior Engineer"` for `PROJECT_MANAGER`) |

---

## File: `webapp/login/LoginPage.controller.js` + `LoginPage.view.xml`

### Purpose

The first screen. Handles both credential-based authentication (local/dev) and XSUAA SSO (BTP/production).

### View Structure

A centered `FlexBox` containing:
- Brand icon (`sap-icon://energy-savings-item`) + title "SolarSage EPC"
- Username `Input` bound to `login>/username`
- Password `Input` (type Password) bound to `login>/password`
- `MessageStrip` showing the dev user cheat sheet (users and password `pass`)
- "Continue" `Button` wired to `onLoginPress`
- Hidden `Select` for role pre-selection (not currently visible in production flow)

### `onLoginPress` Logic

```
If both fields empty AND authMode = "xsuaa" → attempt XSUAA silent SSO via _loadSession()
If both fields empty AND authMode ≠ "xsuaa" → show warning "Enter credentials"
If one field empty → show warning "Enter both fields"
If both filled → call Component.loginWithCredentials(username, password)
    On failure → MessageBox.error("Invalid username or password")
```

This means in BTP production, users can click "Continue" with empty fields to trigger the XSUAA token check. Locally, they must enter credentials from the dev user list.

---

## File: `webapp/App.controller.js`

### Purpose

Controls the outer `App.view.xml` shell — the persistent frame around all pages. Provides:
1. **Back-button history stack** — manually tracks hash history in `_aHashHistory` array
2. **Theme switcher** — ActionSheet with 4 SAP Horizon/Quartz themes via `Theming.setTheme()`
3. **Page banner** — context-sensitive promotional banner that appears above certain pages (e.g., `VendorList` shows a "Vendor Evaluation Workspace" banner with a "Compare Quotations" next-step button)

### `_onRouteMatched`

Fires on every route change. Updates the back-button visibility (hidden on `LoginPage` and `HomePage`) and the page banner config.

### `_updatePageBanner`

A configuration-driven approach: a `mBannerConfig` map defines which routes show banners and what their content is. Only `VendorList` currently has a banner configured, guiding users from vendor browsing to the `QuotationComparison` screen.

---

## File: `webapp/home/HomePage.controller.js` + `HomePage.view.xml`

### Purpose

The role-adaptive home screen. The same view renders differently for all 7 roles — showing only the workspace tiles, KPI cards, app shortcuts, and action items relevant to each role.

### `onInit` Logic

1. Reads `currentRole` from the shared `session` model
2. Calls `_initViewModel(role)` to build the `view` JSONModel with all display data
3. Attaches a `propertyChange` listener on the session model to react to role switches (dev mode)
4. Shows `MessageBox.warning` if redirected here due to an access denial (`unauthorized = true`)

### View Model Properties

| Property | Type | What It Drives |
|---|---|---|
| `greeting` | String | Time-aware greeting (Good morning/afternoon/evening) |
| `userName` | String | Displayed in the header |
| `role` | String | Role display name below username |
| `todos` | Array | Action Center todo list |
| `todosCount` | Integer | Badge count on Action Center card |
| `access` | Object | Flat `RoleService.getAccessModel()` result — drives all `visible="{view>access/tile_...}"` bindings |
| `kpis` | Object | KPI values per workspace tile |
| `todoRows` | Integer | GridContainer row span for the Action Center card (dynamic height) |
| `editMode` | Boolean | Enables drag-and-drop tile reordering |

### `ROUTE_BY_ROLE` Mapping

Used by `onNavPress` when a workspace tile is tapped.

| Role | "Engineering & Projects" tile | "Procurement" tile | "Site Operations" tile | "Finance Cockpit" tile | default |
|---|---|---|---|---|---|
| BDM | `ProjectsList` | — | — | — | `ProjectsList` |
| ENGINEER | `EngineeringProjectsList` | — | — | — | `EngineeringProjectsList` |
| PROJECT_MANAGER | `SeniorProjectsList` | `ProcurementMRList` | — | — | `SeniorProjectsList` |
| PROCUREMENT_OFFICER | — | `POList` | — | — | `POList` |
| SITE_ENGINEER | — | — | `GRNList` | — | `GRNList` |
| FINANCE_OFFICER | — | — | — | `InvoiceList` | `InvoiceList` |
| MANAGEMENT | `ProjectsList` | `POList` | `GRNList` | `InvoiceList` | `ManagementDashboard` |

### `onAppPress`

Handles clicks on the app launcher grid. Maps `appKey` data attributes to target routes:

| App Key | Target Route |
|---|---|
| `manageVendors` | `VendorList` |
| `createMR` | `EngineeringProjectsList` |
| `approveMR` | `MRApprovalDashboard` |
| `compareQuotations` | `QuotationComparison` |
| `approvedMRs` | `ProcurementMRList` |
| `createPO` | `POList` |
| `trackDeliveries` | `DeliveryList` |
| `postGR` / `reportDamage` | `GRNList` |
| `validateInvoice` | `InvoiceList` |
| `managementOverview` | Full-page redirect to `/managementoverview/webapp/index.html` |
| `grnAnalytics` | `GRNAnalytics` |

**Special case for `managementOverview`:** Uses `window.location.href` instead of the router — the OVP app is a **separate** `sap.ovp` application at a different URL path, not a route within the main app.

### `onSwitchUser` (dev mode only)

Opens a `DevUserSwitcher.fragment.xml` popover with the list of dev users. On selection, calls `Component.loginWithCredentials(userId, "pass")` then `window.location.reload()` to restart the app with the new identity.

### `formatTodoRows`

Calculates the GridContainer row span for the Action Center card dynamically:
- Counts visible workspace tiles (each tile is 2 rows high)
- Uses `Math.ceil(tileCount / 2) * 2` to compute total tile rows
- Reduces by 25% with `Math.floor(rows * 0.75)` and clamps to minimum 3

---

## File: `webapp/management/ManagementDashboard.controller.js` + view

### Purpose

A **MANAGEMENT-only** live KPI dashboard that reads directly from `DashboardService` OData views. Replaces the static mock data on `HomePage` with real aggregated data for executives.

### KPI Cards (6 total, using `sap.f.cards.NumericHeader`)

| KPI | Source View | Calculation | State Logic |
|---|---|---|---|
| Active Projects | `ProjectSummary` | `COUNT(status = 'ACTIVE')` | `> 0 → Good` |
| Total PO Spend | `ProcurementKPI` | `SUM(totalPOValue) / 1e7` (in Cr INR) | `> 0 → Good` |
| On-Time Delivery | `DeliveryPerformance` | `SUM(onTime) / SUM(totalDeliveries) × 100` | `≥ 85% → Good`, `≥ 70% → Critical`, `< 70% → Error` |
| Invoice Clearance | `InvoiceMatchingSummary` | `(SUM(paid) + SUM(matched)) / SUM(totalInvoices) × 100` | `≥ 80% → Good`, `≥ 60% → Critical`, `< 60% → Error` |
| Budget Utilization | `ProjectSummary` | `SUM(spentAmount) / SUM(budget) × 100` | `> 85% → Error`, `> 65% → Critical`, `else → Good` |
| Rejection Rate | `ReceiptQuality` | `SUM(totalRejected) / SUM(totalDispatched) × 100` | `≤ 2% → Good`, `≤ 5% → Critical`, `> 5% → Error` |

### Tables (3 total)

| Table | Source View | Sorted By |
|---|---|---|
| Active Projects — Budget Overview | `ProjectSummary` | Default |
| Vendor Performance Leaderboard | `VendorPerformanceSummary` | `performanceScore DESC` |
| Procurement Summary — By Project | `ProcurementKPI` | Default |

### `_loadDashboard`

Fires 6 parallel `bindList(...).requestContexts()` calls to `dashboardService`. Each is `try/catch`-wrapped and fails silently with a `console.warn` — the dashboard degrades gracefully if any view is temporarily unavailable.

---

## File: `webapp/vendor/QuotationComparison.controller.js`

### Purpose

A custom screen (not a Fiori Elements template) that provides a **side-by-side vendor quotation comparison** for a selected Material Request. Procurement Officers and Senior Engineers use this to evaluate competing bids and select the winning vendor.

### Workflow

1. On `onInit`: fetches `ApprovedMaterialRequests` from `VendorService` with `$expand=project`
2. User selects an MR from the dropdown → MR details panel populates
3. User clicks "Compare" → calls `VendorService.compareQuotations(materialRequestId)` OData function
4. Function response is enriched with vendor details fetched by ID
5. Results display sorted ascending by `totalAmount` (cheapest first)
6. Each row shows `isBestPrice` flag and `savingsVsAvg` (how much more expensive vs cheapest)

### Statistics Panel

| Metric | Calculation |
|---|---|
| Best Price | `MIN(totalAmount)` |
| Best Vendor | Vendor name of the cheapest quotation |
| Average Price | `SUM(totalAmount) / COUNT` |
| Fastest Delivery | `MIN(deliveryLeadDays)` |
| Savings vs Average | `avgPrice - bestPrice` |

### `onSelectVendor`

Programmatically creates a `sap.m.Dialog` (not an XML fragment) that prompts for a `selectionReason`. On confirm:
1. Calls `VendorService.VendorQuotations(ID,IsActiveEntity)/VendorService.selectVendor(...)` OData action
2. On success: refreshes the comparison results (so sibling rejections are immediately reflected)

---

# 14. Frontend Application — `app/managementoverview/`

## File: `app/managementoverview/webapp/manifest.json`

### Purpose

A **standalone SAP OVP (Overview Page) application** for executive-level monitoring. It uses the `sap.ovp` framework to render a resizable card layout, each card backed by a `DashboardService` view. This app is launched via `window.location.href` from `HomePage.onAppPress` when `managementOverview` is clicked.

### Architecture

- `rootView`: `sap.ovp.app.Main` — the OVP framework's built-in root view
- `globalFilterModel`: `dashboardService` — OVP's global filter bar is connected to the `DashboardService` model
- `containerLayout`: `resizable` — cards can be resized and repositioned by the user

### OVP Cards

| Card ID | Template | Entity Set | Content |
|---|---|---|---|
| `card01_budget` | `sap.ovp.cards.v4.table` | `ProjectSummary` | Budget vs Spent by project with utilization % |
| `card02_receipt_quality` | `sap.ovp.cards.v4.table` | `ReceiptQuality` | Accepted vs Rejected quantities by project |
| `card03_vendors` | `sap.ovp.cards.v4.table` | `VendorPerformanceSummary` | Vendor scores, OTD%, orders |
| `card04_procurement` | `sap.ovp.cards.v4.table` | `ProcurementKPI` | POs total/confirmed/delivered per project |
| `card05_invoices` | `sap.ovp.cards.v4.list` | `InvoiceMatchingSummary` | Invoice matching status by vendor |
| `card06_delivery` | `sap.ovp.cards.v4.table` | `DeliveryPerformance` | OTD vs delayed deliveries by vendor |
| `card07_threeway` | `sap.ovp.cards.v4.table` | `ThreeWayMatchSummary` | Match status counts and variance by project |

All 7 cards directly consume `DashboardService` read-only views — no application logic needed. The `sap.ovp` framework handles pagination, filtering, and sorting automatically.

**Design Note:** The OVP app uses `sap.ovp` and `sap.viz` libraries for charting. It connects to the same `/dashboard/` OData endpoint as the `ManagementDashboard` custom screen. The key difference: OVP provides a fully resizable card layout with built-in OData integration; the custom `ManagementDashboard` provides hand-crafted KPI tiles with precise state-color logic.

---

*End of Backend Documentation*
