# System Design and Technical Specification
## Solar EPC Procure-to-Pay System

---

## 1. Introduction

### 1.1 Project Overview
The Solar EPC Procure-to-Pay (P2P) System is a comprehensive enterprise application designed specifically for the Engineering, Procurement, and Construction (EPC) sector, focusing on solar energy deployments. The system acts as the central digital backbone orchestrating the entire lifecycle of solar project procurement, from initial business approval to final financial settlement.

### 1.2 Business Context
Solar EPC projects require massive coordination of specialized materials (solar panels, inverters, mounting structures, cables). The traditional approach often suffers from disconnected silos between business development, engineering, procurement, site operations, and finance. This fragmentation leads to procurement delays, budget overruns, misplaced inventory, and compliance failures during the financial audit phase.

### 1.3 Problem Statement
Currently, the business lacks a unified system that enforces strict gating (e.g., engineering cannot order materials for unapproved projects) and provides end-to-end traceability. The absence of a centralized, role-based platform results in unauthorized procurement, manual vendor quotation comparisons, untracked site damages, and inefficient invoice validation.

### 1.4 Objectives of the System
*   Establish a rigid, role-based workflow mapping directly to organizational departments (BDM, Engineering, Procurement, Site, Finance, Management).
*   Enforce a Business Development Manager (BDM) approval gate prior to any engineering or procurement activity.
*   Automate vendor quotation comparison and selection based on financial and technical metrics.
*   Implement a robust Three-Way Matching mechanism (Purchase Order vs. Goods Receipt vs. Invoice).
*   Provide a hybrid backend architecture leveraging SAP Cloud Application Programming Model (CAP), SAP Gateway, and SAP RESTful ABAP Programming Model (RAP) to align with enterprise integration standards.

---

## 2. Current Development Status

The project is currently under active development. The architecture has been laid out, and foundational modules are operational, while integration with external backend systems remains in progress.

### 2.1 Completed Modules
*   **Role-Based Access Control (Frontend):** The `RoleService.js` mechanism is fully implemented, dictating UI component visibility, application tile access, and dynamic to-do list generation for six distinct roles.
*   **Central Launchpad (My Home):** The Freestyle SAPUI5 home page (`HomePage.view.xml`) is fully developed, featuring responsive CSS Grid layouts, insight cards, and functional routing.
*   **Vendor Service Logic (CAP Backend):** Core backend event handlers (`vendor-service.js`) are complete. This includes auto-numbering for quotations, dynamic item/header tax and total calculations, vendor activation/deactivation toggles, and advanced quotation comparison logic.
*   **Project Service Skeleton:** The CAP OData V4 service for Projects and the corresponding Fiori Elements List Report template (`projectmanagement`) have been initialized.

### 2.2 In-Progress Modules
*   **BDM Gating Mechanism:** The data model supports project statuses (Draft, Active, On Hold, Completed, Cancelled), but the strict backend validation preventing Engineering from modifying Draft projects is currently being written.
*   **Bill of Quantity (BOQ) & Material Requests:** UI annotations for the Fiori Elements Object Page are partially complete.
*   **Quotation UI:** The frontend screens to consume the completed `compareQuotations` backend action are currently under development.

### 2.3 Planned Modules
*   **Procurement SAP Gateway Integration:** OData V2 consumption for standard Purchase Order creation.
*   **Site Operations (RAP):** Backend ABAP development for Goods Receipt and Damage Reporting.
*   **Finance Integration (RAP):** Three-way invoice validation logic.
*   **Management Dashboard:** SAP Fiori Overview Page (OVP) containing analytical cards for KPIs and anomaly detection.

---

## 3. System Overview

### 3.1 High-Level Architecture
The solution utilizes a decoupled, microservices-oriented architecture:
*   **Frontend Layer:** Built using SAPUI5, combining Freestyle coding for bespoke dashboards (My Home) and SAP Fiori Elements (List Reports, Object Pages, Overview Pages) for standardized transactional screens.
*   **Middleware/Routing Layer:** SAP BTP Approuter and Destination Services orchestrate traffic between the frontend and various backends.
*   **Backend Layer 1 (CAP / Node.js):** Handles agile, domain-specific data such as Project Management, BOQ, Material Requests, and Vendor Quotations via OData V4.
*   **Backend Layer 2 (SAP Gateway):** Exposes stable, legacy ERP data such as Vendor Master and Purchase Orders via OData V2.
*   **Backend Layer 3 (SAP RAP / ABAP):** Handles robust, transactional processes requiring strict ACID compliance, such as Goods Receipts, Damage Reports, and Invoice Validation via OData V4.

### 3.2 End-to-End Process Flow
Data flows sequentially through departmental gates. A project is initiated as a record in CAP. Once its status is updated to 'Active' by the BDM, it unlocks the BOQ entities. Material requests generated here flow into the Vendor Service for quotation. Selected quotations trigger an outbound call to the SAP Gateway for PO creation. Subsequent physical deliveries update RAP modules, culminating in Finance matching RAP invoice data against Gateway PO data and RAP GR data.

### 3.3 Role-Based System Design
The system explicitly separates duties. As defined in the centralized `RoleService.js`, features are compartmentalized:
*   **App Level:** Procurement cannot access BOQ creation; Engineering cannot view Finance Cockpits.
*   **Component Level:** Insight and analytical cards are restricted to Managers, Procurement Officers, and Finance.
*   **Data Level:** To-do lists are dynamically injected based on the user's active role.

---

## 4. Business Process Description

### 4.1 Phase 1: Business Development & Planning Gate
The process begins with the Business Development Team (BDM). BDM creates a prospective project and negotiates terms. During this phase, the project is in a `DRAFT` state. Engineering cannot interact with the system yet. Once approved, the BDM transitions the project to `ACTIVE`. This acts as the strict business gate.

### 4.2 Phase 2: Engineering & BOQ Definition
Upon activation, the Engineering Team accesses the project. Senior Engineers and Site Engineers define the Bill of Quantity (BOQ) based on technical designs (e.g., specifying wattage for solar panels, inverter capacities). When physical materials are required, Engineering raises a Material Request (MR). Senior Engineers must approve the MR before it reaches Procurement.

### 4.3 Phase 3: Procurement & Sourcing
The Procurement Team monitors approved MRs. They invite vendors to bid. The system captures Vendor Quotations, and the CAP backend automates the calculation of base amounts, taxes, and header totals. Procurement uses the 'Compare Quotations' application to evaluate bids and mark one as `SELECTED`, while automatically rejecting sibling bids. A Purchase Order (PO) is then generated in the SAP Gateway system.

### 4.4 Phase 4: Delivery & Site Operations
Vendors dispatch materials. The Site Team tracks incoming deliveries. Upon physical arrival, the Site Engineer uses the Fiori application to post a Goods Receipt (GR). If solar panels or fragile components are damaged, a Damage Report is raised, blocking payment for the affected quantity and initiating a vendor rebate/claim process.

### 4.5 Phase 5: Finance & Validation
The Finance Team receives the vendor's invoice. Using the Invoice Validation module, the system performs a Three-Way Match: ensuring the invoiced quantity and price match the Purchase Order (Gateway), and that the materials were actually received and not marked as damaged (RAP). Only validated invoices are approved for settlement.

### 4.6 Phase 6: Management & Analytics
Throughout the lifecycle, Management utilizes the Overview Page to monitor project health, budget consumption, vendor performance metrics, and procurement bottlenecks.

---

## 5. Codebase Structure

The repository is structured to separate concerns between UI, services, and configuration:

*   `/app/`: Contains frontend applications.
    *   `/app/home/`: Freestyle SAPUI5 application acting as the central Fiori Launchpad simulation. Contains `HomePage.view.xml` and custom CSS for tiles and grid layouts.
    *   `/app/projectmanagement/`: Fiori Elements V4 List Report application for Project and MR management. Contains localized strings (`i18n.properties`) and `RoleService.js`.
*   `/srv/`: Contains CAP Node.js backend services.
    *   `vendor-service.js`: Custom business logic for vendor quotation calculations, numbering, and state management.
*   `/db/`: (Pending/Conceptual) Contains CDS models defining the schema for SQLite/HANA.
*   `/documentation/`: Contains system design specifications.

**Naming Conventions:**
*   OData entities follow PascalCase (e.g., `VendorQuotations`, `PurchaseOrders`).
*   UI5 Views and Controllers follow PascalCase, while XML IDs use camelCase prefixed with their element type (e.g., `btnSearch`, `appCreateMR`).
*   Backend functions are prefixed with underscores to denote internal methods (e.g., `_calculateItemAmounts`).

---

## 6. Screen-Level Implementation Status

### 6.1 Central Dashboard (My Home)
*   **Purpose:** Central entry point routing users to authorized applications.
*   **Role:** All Roles (Dynamically adapted).
*   **Status:** Completed.
*   **UI Components:** CSS Grid layouts, GenericTiles (`tileBlue`, `tileOrange`, etc.), Avatar, Select (for demo role switching), f:Card for dynamic To-Dos.
*   **Missing:** Real XSUAA authentication mapping (currently mocked via dropdown).

### 6.2 Project Management App
*   **Purpose:** Allow BDM to manage project states and Engineering to manage BOQ.
*   **Role:** BDM, Engineering, Senior Engineer.
*   **Status:** Partial.
*   **UI Components:** Fiori Elements List Report generated. Basic status mappings (`status_ACTIVE`, `status_DRAFT`) defined in i18n.
*   **Missing:** Object Page sections for BOQ and MR require UI annotations. Backend logic for the BDM approval gate needs to be enforced in CAP `before('UPDATE')` handlers.

### 6.3 Compare Quotations App
*   **Purpose:** Evaluate vendor bids side-by-side.
*   **Role:** Procurement, Management.
*   **Status:** Backend Completed, Frontend Not Started.
*   **Backend Integration:** The `_compareQuotations` logic in `vendor-service.js` successfully groups quotes by MR, transitions statuses to `UNDER_EVALUATION`, and sorts by `totalAmount`. Frontend needs to bind to this unbound/bound OData action.

### 6.4 Invoice Validation App
*   **Purpose:** Execute three-way matching.
*   **Role:** Finance Officer.
*   **Status:** Not Started.
*   **Backend Integration:** Planned for RAP OData V4 integration.

---

## 7. Data Model and Entities

The core domain model bridges CAP, Gateway, and RAP. Key entities include:

### 7.1 Core Entities (CAP)
*   **Project:** Contains `ID`, `projectName`, `budget`, `status` (Draft, Active, On Hold, Completed, Cancelled).
    *   *Constraint:* Status transitions tightly controlled.
*   **BillOfQuantity (BOQ):** Child of Project. Defines planned materials and quantities.
*   **MaterialRequest (MR):** Generated from BOQ. Represents actual demand. Includes `approvalStatus`.
*   **VendorMaster:** Contains `ID`, `vendorName`, `isActive`. Managed via `activateVendor` actions.
*   **VendorQuotations:** Header entity for bids. Includes `quotationNumber` (auto-generated QT-YYYY-XXXX format), `status` (DRAFT, SUBMITTED, UNDER_EVALUATION, SELECTED, REJECTED), `validityDate`, and calculated financial totals.
*   **VendorQuotationItems:** Line items mapping to MR components. Includes `unitPrice`, `quotedQty`, `taxPercent`. Modifying items triggers header recalculations.

### 7.2 External Entities (Gateway & RAP)
*   **PurchaseOrder (Gateway):** Created upon quotation selection. Links to `VendorMaster` and `VendorQuotations`.
*   **Delivery (Gateway):** Tracking mechanism for PO transit.
*   **MaterialReceipt (RAP):** Site operational data confirming physical quantities.
*   **Invoice (RAP):** Financial document mapped against PO and MaterialReceipt.

### 7.3 Relationships
*   Project (1) -> (N) BOQ
*   BOQ (1) -> (N) MaterialRequest
*   MaterialRequest (1) -> (N) VendorQuotations
*   VendorQuotations (1) -> (1) PurchaseOrder (If status = SELECTED)
*   PurchaseOrder (1) -> (N) MaterialReceipt
*   PurchaseOrder (1) + MaterialReceipt (1) -> (1) Invoice

---

## 8. Integration Architecture

The application operates in a hybrid backend environment to simulate a real-world SAP landscape:

*   **CAP (Node.js) ↔ Frontend (OData V4):** Standard synchronous communication for core agile modules. CAP leverages `@sap/cds` for event handling (e.g., auto-calculating taxes on quotation creation).
*   **CAP ↔ SAP Gateway (OData V2):** When a quotation is marked as `SELECTED` in CAP, a remote service call will be dispatched via SAP BTP Destination Service to the Gateway system to trigger the legacy `CreatePO` BAPI wrapper.
*   **Frontend ↔ SAP RAP (OData V4):** The Site and Finance Fiori applications will interact directly with the RAP endpoints hosted on SAP BTP ABAP Environment.
*   **Cross-System Data Consistency:** Data replication is minimized. Systems reference unique IDs (e.g., RAP Invoice references the Gateway PO Number and CAP Project ID). Final reporting blends these via OData associations or backend CDS custom entities in CAP.

---

## 9. UX and Design Implementation

### 9.1 SAP Fiori Guidelines
The frontend strictly adheres to SAP Fiori 3 / Horizon guidelines (`sap_horizon` theme).
*   **Launchpad Simulation:** Uses `sap.f.GridList` and `GenericTile` for a highly responsive, touch-friendly dashboard. Semantic colors are applied to tiles based on department (e.g., Blue for Home, Orange for Engineering, Green for Finance).
*   **Navigation:** Intended to use Flexible Column Layout (FCL) where the List Report opens an Object Page in the right column, allowing seamless Master-Detail navigation without losing context.

### 9.2 Validation and Messaging
Backend validations return standard HTTP error codes caught by the UI5 message manager. For example, `vendor-service.js` strictly rejects quotation submissions if `validityDate` is missing or if the status is not `DRAFT` (Returns HTTP 400).

### 9.3 Role-Based UI Adaptation
The `RoleService.js` dictates exactly what is rendered. 
*   If `currentRole === "SITE_ENGINEER"`, the `tile_engineeringProjects` Boolean is false, completely removing the Engineering tile from the DOM.
*   To-Do lists (`ROLE_TODOS`) dynamically inject action items specific to the user, decorated with semantic states (e.g., `state: "Error"` for high-priority approvals).

---

## 10. Key Metrics and Analytics

The Management Overview Page (planned) will consume the following metrics to monitor operational health:

*   **Project Health:** Budget vs. Actual Spend. Derived by aggregating PO totals and approved Invoices against the CAP Project budget limit.
*   **Procurement Bottlenecks:** Time elapsed between MR Creation and PO generation.
*   **Vendor Performance:** Historical tracking of quoted price versus final invoiced price, and delivery timeliness (Gateway PO date vs RAP GR date).
*   **Anomaly Detection:** Highlighting discrepancy rates between Goods Receipts and Invoices (Three-Way Match failures).

---

## 11. Known Gaps and Limitations

*   **Mocked Security:** Currently, user roles are toggled via a UI Dropdown (`roleSelect` in `HomePage.view.xml`). This must be replaced with `@sap/xssec` and BTP Role Collections parsing JWT tokens.
*   **Integration Stubbing:** External SAP Gateway and RAP endpoints are not yet physically provisioned; their behaviors are conceptually modeled and currently stubbed out.
*   **UI Annotations Pending:** While the `projectmanagement` app has been generated using SAP Fiori tools, the specific CDS UI Annotations required to render the BOQ and Material Request facets are missing.
*   **No Draft Choreography yet:** Fiori Elements Draft mode (`@odata.draft.enabled`) is planned but not currently implemented across all entities.

---

## 12. Future Enhancements

*   **Event Mesh Integration:** Implement SAP Event Mesh to broadcast asynchronous events (e.g., `ProjectActivated`) from CAP to external systems instead of synchronous API calls, ensuring high availability and fault tolerance.
*   **AI-Based Predictions:** Integrate SAP AI Core to predict vendor delivery delays based on historical data and weather patterns affecting solar sites.
*   **Automated Invoice OCR:** Connect the SAP Document Information Extraction service to automate the translation of physical PDF invoices into RAP Invoice records before the Three-Way match runs.
*   **Mobile Readiness:** Optimize the Site Operations app (Goods Receipt, Damage Reporting) for offline capabilities using SAP Mobile Services to accommodate remote solar sites with poor connectivity.