# Pending Screens Implementation Status

Based on the current codebase (`manifest.json`, `IMPLEMENTATION_STATUS.md`, and the webapp folder structure), the following screens are identified as pending for implementation or wiring into the application:

## 1. Purchase Order Management
**Status:** Backend complete (`procurement-service`), UI missing entirely.
* **PO List Report (`POList`)**: A Fiori Elements List Report screen to view all Purchase Orders.
* **PO Object Page (`POObjectPage`)**: A Fiori Elements Object Page to view PO details, line items, financials, and deliveries. Needs to expose `confirmPO` and `cancelPO` actions.
* **Next Steps**: Register routes and targets in `manifest.json` pointing to `/procurement/PurchaseOrders`, and configure Fiori annotations for the UI.

## 2. Delivery Tracking
**Status:** CAP stub present, UI missing entirely. Needs SEGW backend for production.
* **Delivery List Report (`DeliveryList`)**: A screen to track all deliveries against POs.
* **Delivery Object Page (`DeliveryObjectPage`)**: Detailed view of a specific delivery showing schedule dates, actual dates, and status (e.g., IN_TRANSIT, DELIVERED).
* **Next Steps**: Register routing in `manifest.json` and build UI annotations. Eventually requires creating `ZSOLAR_DELIVERY_SRV` in SAP Gateway (SEGW).

## 3. Material Receipt (GRN - Goods Receipt Note)
**Status:** CAP stub present, UI missing entirely. Needs RAP backend for production.
* **GRN List Report (`GRNList`)**: A screen for Site Engineers to view incoming material receipts.
* **GRN Object Page (`GRNObjectPage`)**: Detailed view to log accepted/rejected quantities and document damaged materials.
* **Next Steps**: Register routing in `manifest.json` and build UI annotations. Eventually requires creating the RAP BO `ZMaterialReceipt` in ADT.

## 4. Management Dashboard
**Status:** Backend complete (`dashboard-service`), UI files exist but are just stubs and not wired into the app.
* **Management Overview**: An Overview Page (OVP) or Analytical Dashboard intended to display KPIs (Ongoing Projects, Budget Utilization, Vendor Performance, Procurement Bottlenecks).
* **Next Steps**: 
  1. Register the route in `manifest.json` (e.g., `ManagementOverview` pointing to `ManagementDashboard.view.xml`).
  2. Implement the XML charts/lists in `ManagementDashboard.view.xml`.
  3. Bind the components to the `dashboard-service` OData queries in `ManagementDashboard.controller.js`.

## Additional UI Wiring & Partial Screens
While the full screens above are missing, the following existing screens require critical wiring to be considered complete:
* **Quotation Comparison (`QuotationComparison`)**: The view and controller exist, but the "Select Vendor" button needs to be wired to the `selectVendor` action to actually confirm a vendor and reject others.
* **Vendor Management**: The CAP-based UI (`VendorList`, `VendorObjectPage`) is fully functional in development, but it must be migrated to point to a production SAP Gateway (SEGW) service.
