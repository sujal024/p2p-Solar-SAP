# SolarSage EPC — UI Design Document

## Overview

This document covers the design specification for two analytical screens in the SolarSage EPC application:

1. **Management Overview** — Executive KPI dashboard (standalone OVP app)
2. **Quotation Comparison** — Side-by-side vendor quotation evaluation

---

## 1. Management Overview

### Purpose
An executive-level dashboard for users with the **MANAGEMENT** role. Displays real-time operational KPIs across all modules of the P2P solar EPC workflow — budget utilisation, procurement, GRN quality, vendor performance, invoice matching, and 3-way match analysis.

### Access
| Attribute | Value |
|---|---|
| URL | `/managementoverview/webapp/index.html` |
| Role | `MANAGEMENT` only |
| Entry point | HomePage → "Management Overview Dashboard" tile |
| Navigation | `window.location.href` (standalone app, not router-based) |

### Architecture
```
app/managementoverview/
├── webapp/
│   ├── index.html          ← Custom header + OVP shell
│   ├── manifest.json       ← sap.ovp card config + dashboardService model
│   ├── Component.js        ← Extends sap.ovp.app.Component; applies sessionStorage auth
│   ├── i18n/i18n.properties
│   └── changes/            ← Empty flex bundles (suppress 404s)
```

The app is served as a **standalone UI5 application** discovered by `cds-plugin-ui5`. It connects to the `DashboardService` OData V4 endpoint at `/dashboard/`.

### Header Bar

| Element | Detail |
|---|---|
| Height | 52 px |
| Background | `#0d1f35` (solid dark navy — no gradient) |
| Back button | `← Back to Home` → navigates to `/projectmanagement/webapp/index.html` |
| Icon | Green `#1a5c4e` 30px rounded square, dashboard SVG |
| Title | "Management Overview" — 13.5 px, weight 600, white |
| Subtitle | "SolarSage EPC · Budget · Procurement · GRN · Vendor · Invoice KPIs" — 11 px, 40% opacity white |
| Badge | "LIVE" — green pill with pulsing dot |

> [!NOTE]
> The OVP's built-in "Standard ▾" variant management toolbar is hidden via CSS targeting `.sapMVBox > .sapMIBar`. This prevents a duplicate toolbar from appearing below our custom header.

### OVP Cards

All cards use `sap.ovp.cards.v4.table` or `sap.ovp.cards.v4.list`. The `sap.ovp.cards.v4.analyticalChart` type is **not available** in the public SAPUI5 CDN and must not be used.

| Card | Template | Entity | Key Columns |
|---|---|---|---|
| Budget Utilization | `v4.table` | `ProjectSummary` | Project Code, Name, Status, Budget, Spent, Remaining, Utilised % |
| GRN Receipt Quality | `v4.table` | `ReceiptQuality` | Project, Dispatched, Accepted, Rejected Qty, Rejection Rate % |
| Vendor Performance | `v4.table` | `VendorPerformanceSummary` | Vendor Code/Name, Total Orders, On-Time, OTD %, Quality Score, Overall Score |
| Procurement KPIs | `v4.table` | `ProcurementKPI` | Project, Total POs, Confirmed, Delivered, Cancelled, PO Value |
| Invoice Matching | `v4.list` | `InvoiceMatchingSummary` | Vendor, Total Invoices, Matched, Mismatched, Approved, Paid, Total Value |
| Delivery Performance | `v4.table` | `DeliveryPerformance` | Vendor, Total Deliveries, On-Time, Delayed, Avg/Max Delay Days |
| 3-Way Match Summary | `v4.table` | `ThreeWayMatchSummary` | Project, Total Lines, Matched, Qty/Price/Both Mismatch, Variance |

### Data Source

```
DashboardService @ /dashboard/  (OData V4, CAP)
@requires: ['Management','ProjectManager','FinanceOfficer','ProcurementOfficer']
```

**Auth handling:** The `Component.js` reads `sessionStorage["solarEpcAuth"]` (set at login by the main app) and applies it via `changeHttpHeaders`. A global XHR interceptor in `index.html` ensures the header is applied even before UI5 initialises the model.

### Known Constraints

> [!WARNING]
> `listFlavor: "bar"` on `v4.list` cards issues a `$apply=aggregate(...)` query. On CAP `GROUP BY` views this returns HTTP 500, which corrupts the OData batch and causes ALL cards to fail. Always use `listFlavor: "condensed"` or omit it.

> [!NOTE]
> `presentationAnnotationPath` pointing to a `PresentationVariant` that includes `@UI.Chart` visualisations will cause OVP table cards to silently fail (they attempt to load the analyticalChart component). Keep table card settings annotation-path-free and rely on `@UI.LineItem`.

---

## 2. Quotation Comparison

### Purpose
Allows **Procurement Officers** and **Project Managers** to compare vendor quotations side-by-side for a material request, evaluate pricing and lead times, and select the winning vendor — automatically rejecting the others via the `selectVendor` CAP action.

### Access
| Attribute | Value |
|---|---|
| Route | `CompareQuotations` → target `QuotationComparison` |
| Pattern | `CompareQuotations` (no parameters) |
| Roles | `PROJECT_MANAGER`, `PROCUREMENT_OFFICER` |
| Entry point | HomePage → "Compare Quotations" tile; VendorList page banner |

### File Structure
```
app/projectmanagement/webapp/vendor/
├── QuotationComparison.view.xml
├── QuotationComparison.controller.js
└── QuotationComparison.css
```

### Layout

```
┌─ ShellBar ──────────────────────────────────────────────┐
│  ← Back   [MR Select]  [Load]           [vendor filter] │
├─ Hero card: Summary ────────────────────────────────────┤
│  MR ID · Material · Required Qty · Project              │
├─ Comparison grid ───────────────────────────────────────┤
│  [Vendor A card]   [Vendor B card]   [Vendor C card]    │
│  Unit Price        Unit Price        Unit Price          │
│  Lead Time         Lead Time         Lead Time           │
│  Total Value       Total Value       Total Value         │
│  Status badge      Status badge      Status badge        │
│  [ Select ▸ ]      [ Select ▸ ]      [ Select ▸ ]       │
└─────────────────────────────────────────────────────────┘
```

### Key UI Controls

| Element | Control | Notes |
|---|---|---|
| MR selector | `sap.m.Select` | Bound to `VendorService.VendorQuotations` grouped by MR |
| Load button | `sap.m.Button` | Calls `/compareQuotations(...)` CAP function |
| Quotation cards | `sap.f.Card` (JSONModel) | Rendered from `view>/quotations` array |
| Select vendor | `sap.m.Button` (`Emphasized`) | Calls `selectVendor(...)` action; refreshes list |
| Status badge | `sap.m.ObjectStatus` | SUBMITTED / SELECTED / REJECTED semantic colours |

### Data Flow

```
1. User selects MR from dropdown
2. Controller calls VendorService.compareQuotations(mrId)
3. Response array mapped to view model /quotations
4. Cards rendered from JSONModel binding
5. User clicks "Select" on winning vendor
6. Controller calls selectVendor(quotationId) on VendorService
7. Other quotations auto-rejected by backend
8. View refreshed — selected card shows green SELECTED badge
```

### Styling (`QuotationComparison.css`)

| Class | Purpose |
|---|---|
| `.quotationComparisonPage` | Full-height scroll container |
| `.quotationTopBar` | Sticky filter/action bar |
| `.quotationHeroCard` | MR summary card at top |
| `.quotationBackBtn` | Custom back navigation button |

### Roles & Permissions

| Role | Can View | Can Select Vendor |
|---|---|---|
| `PROCUREMENT_OFFICER` | ✅ | ✅ |
| `PROJECT_MANAGER` | ✅ | ✅ |
| `BDM` | ❌ | ❌ |
| `ENGINEER` | ❌ | ❌ |
| `MANAGEMENT` | ❌ | ❌ |

---

## Design Tokens (Shared)

| Token | Value | Usage |
|---|---|---|
| `--primary-dark` | `#0d1f35` | App headers, top bars |
| `--primary-green` | `#1a5c4e` / `#27c88a` | Icons, badges, accents |
| `--text-muted` | `rgba(255,255,255,0.4)` | Subtitles on dark backgrounds |
| `--border-subtle` | `rgba(255,255,255,0.08)` | Header bottom borders |
| Theme | `sap_horizon` | Applied via `data-sap-ui-theme` |
| Font | `'72'` → Helvetica Neue → Arial | All UI text |

> [!TIP]
> Avoid gradients on structural chrome (headers, toolbars). Reserve gradients for data-driven elements like KPI cards or status indicators only. Solid `#0d1f35` is more professional and renders consistently across screen sizes.
