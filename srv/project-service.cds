using solar.epc as epc from '../db/schema';

// ═══════════════════════════════════════════════════════════════
// PROJECT SERVICE  — CAP OData V4
// Covers: Projects, BOQ, Material Requests, Approval workflow
// Roles: Engineer, Project Manager, Management
// ═══════════════════════════════════════════════════════════════

@requires: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer','FinanceOfficer']
service ProjectService @(path: '/project') {

  // ── READ-ONLY REFERENCES ──────────────────────────────────────
  @readonly
  entity MaterialMaster as projection on epc.MaterialMaster
    where isActive = true;

  @readonly
  entity Users as projection on epc.Users
    where isActive = true;

  // ── PROJECTS ──────────────────────────────────────────────────
  // BDM owns the project lifecycle: create, activate, hold, cancel.
  // Engineers get read-only access so they can navigate to approved projects.
  @odata.draft.enabled
  @cds.redirection.target
  @restrict: [
    { grant: ['READ'],   to: ['BDM','Management','ProcurementOfficer'] },
    { grant: ['READ'],   to: ['Engineer','ProjectManager'], where: 'status = ''ACTIVE''' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BDM','Management'] },
    { grant: ['UPDATE'], to: ['Engineer'], where: 'status = ''ACTIVE''' },
    { grant: ['activateProject','completeProject','cancelProject'], to: ['BDM','Management'] },
    { grant: ['putOnHold'], to: ['Management'] }
  ]
  entity Projects as projection on epc.Projects {
    *,
    projectManager   : redirected to Users,
    boqItems         : redirected to BOQItems,
    materialRequests : redirected to MaterialRequests,
    virtual criticality : Integer
  } actions {
    action activateProject()   returns Projects;
    action putOnHold(reason: String(500)) returns Projects;
    action completeProject()   returns Projects;
    action cancelProject(reason: String(500)) returns Projects;
  };

  // ── ACTIVE PROJECTS — Engineer view ──────────────────────────
  @odata.draft.enabled
  @restrict: [
    { grant: ['READ'], to: ['Engineer','ProjectManager','Management','ProcurementOfficer','BDM'] },
    { grant: ['UPDATE'], to: ['Engineer'] }
  ]
  entity ActiveProjects as projection on epc.Projects {
    *,
    projectManager   : redirected to Users,
    boqItems         : redirected to ActiveProjects_BOQItems,
    materialRequests : redirected to ActiveProjects_MaterialRequests,
    virtual criticality : Integer
  } where status = 'ACTIVE';

  @restrict: [
    { grant: ['READ'],                    to: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['Engineer','Management'] }
  ]
  entity ActiveProjects_BOQItems as projection on epc.BOQItems {
    *,
    project : redirected to ActiveProjects,
    material : redirected to MaterialMaster
  };

  @restrict: [
    { grant: ['READ'],                                          to: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer'] },
    { grant: ['CREATE','UPDATE'],                               to: ['Engineer','Management'] },
    { grant: ['submitRequest'],                                 to: ['Engineer','Management'] },
    { grant: ['approveRequest','rejectRequest','closeRequest'],  to: ['ProjectManager','Management'] }
  ]
  entity ActiveProjects_MaterialRequests as projection on epc.MaterialRequests {
    *,
    project : redirected to ActiveProjects,
    requestedBy : redirected to Users,
    approvedBy  : redirected to Users,
    items       : redirected to ActiveProjects_MaterialRequestItems,
    quotations  : redirected to ActiveProjects_VendorQuotations,
    virtual criticality : Integer
  } actions {
    action submitRequest()             returns ActiveProjects_MaterialRequests;
    action approveRequest(approvalRemarks: String(500)) returns ActiveProjects_MaterialRequests;
    action rejectRequest(rejectionReason: String(500)) returns ActiveProjects_MaterialRequests;
    action closeRequest()              returns ActiveProjects_MaterialRequests;
  };

  @restrict: [
    { grant: ['READ'],                    to: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['Engineer','Management'] }
  ]
  entity ActiveProjects_MaterialRequestItems as projection on epc.MaterialRequestItems {
    *,
    request : redirected to ActiveProjects_MaterialRequests,
    material : redirected to MaterialMaster,
    boqItem : redirected to ActiveProjects_BOQItems
  };

  @readonly
  entity ActiveProjects_VendorQuotations as projection on epc.VendorQuotations {
    *,
    materialRequest: redirected to ActiveProjects_MaterialRequests,
    items: redirected to ActiveProjects_VendorQuotationItems
  };

  @readonly
  @cds.redirection.target
  entity ActiveProjects_VendorQuotationItems as projection on epc.VendorQuotationItems {
    *,
    quotation: redirected to ActiveProjects_VendorQuotations,
    requestItem: redirected to ActiveProjects_MaterialRequestItems,
    material: redirected to MaterialMaster
  };

  // ── SENIOR ACTIVE PROJECTS — Senior Engineer view ─────────────
  @odata.draft.enabled
  @restrict: [
    { grant: ['READ'], to: ['Engineer','ProjectManager','Management','ProcurementOfficer','BDM'] },
    { grant: ['UPDATE'], to: ['Engineer','ProjectManager'] }
  ]
  entity SeniorActiveProjects as projection on epc.Projects {
    *,
    projectManager   : redirected to Users,
    boqItems         : redirected to SeniorActiveProjects_BOQItems,
    materialRequests : redirected to SeniorActiveProjects_MaterialRequests,
    virtual criticality : Integer
  } where status = 'ACTIVE';

  @restrict: [
    { grant: ['READ'],                    to: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['Engineer','Management'] }
  ]
  entity SeniorActiveProjects_BOQItems as projection on epc.BOQItems {
    *,
    project : redirected to SeniorActiveProjects,
    material : redirected to MaterialMaster
  };

  @restrict: [
    { grant: ['READ'],                                          to: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer'] },
    { grant: ['CREATE','UPDATE'],                               to: ['Engineer','Management'] },
    { grant: ['submitRequest'],                                 to: ['Engineer','Management'] },
    { grant: ['approveRequest','rejectRequest','closeRequest'],  to: ['ProjectManager','Management'] }
  ]
  entity SeniorActiveProjects_MaterialRequests as projection on epc.MaterialRequests {
    *,
    project : redirected to SeniorActiveProjects,
    requestedBy : redirected to Users,
    approvedBy  : redirected to Users,
    items       : redirected to SeniorActiveProjects_MaterialRequestItems,
    quotations  : redirected to SeniorActiveProjects_VendorQuotations,
    virtual criticality : Integer
  } actions {
    action submitRequest()             returns SeniorActiveProjects_MaterialRequests;
    action approveRequest(approvalRemarks: String(500)) returns SeniorActiveProjects_MaterialRequests;
    action rejectRequest(rejectionReason: String(500)) returns SeniorActiveProjects_MaterialRequests;
    action closeRequest()              returns SeniorActiveProjects_MaterialRequests;
  };
  
  @restrict: [
    { grant: ['READ'],                    to: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['Engineer','Management'] }
  ]
  entity SeniorActiveProjects_MaterialRequestItems as projection on epc.MaterialRequestItems {
    *,
    request : redirected to SeniorActiveProjects_MaterialRequests,
    material : redirected to MaterialMaster,
    boqItem : redirected to SeniorActiveProjects_BOQItems
  };

  @readonly
  entity SeniorActiveProjects_VendorQuotations as projection on epc.VendorQuotations {
    *,
    materialRequest: redirected to SeniorActiveProjects_MaterialRequests,
    items: redirected to SeniorActiveProjects_VendorQuotationItems
  };

  @readonly
  @cds.redirection.target
  entity SeniorActiveProjects_VendorQuotationItems as projection on epc.VendorQuotationItems {
    *,
    quotation: redirected to SeniorActiveProjects_VendorQuotations,
    requestItem: redirected to SeniorActiveProjects_MaterialRequestItems,
    material: redirected to MaterialMaster
  };

  // ── BOQ ITEMS ─────────────────────────────────────────────────
  // Junior Engineers define BOQ. Senior Engineers and BDM are read-only here.
  @cds.redirection.target
  @restrict: [
    { grant: ['READ'],                    to: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['Engineer','Management'] }
  ]
  entity BOQItems as projection on epc.BOQItems {
    *,
    project  : redirected to Projects,
    material : redirected to MaterialMaster
  };

  // ── MATERIAL REQUESTS ─────────────────────────────────────────
  // Junior Engineers create, fill items, and submit.
  // Senior Engineers (ProjectManager) can only approve or reject — no creation.
  @cds.redirection.target
  @restrict: [
    { grant: ['READ'],                                          to: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer'] },
    { grant: ['CREATE','UPDATE'],                               to: ['Engineer','Management'] },
    { grant: ['submitRequest'],                                 to: ['Engineer','Management'] },
    { grant: ['approveRequest','rejectRequest','closeRequest'],  to: ['ProjectManager','Management'] }
  ]
  entity MaterialRequests as projection on epc.MaterialRequests {
    *,
    project             : redirected to Projects,
    requestedBy         : redirected to Users,
    approvedBy          : redirected to Users,
    items               : redirected to MaterialRequestItems,
    quotations          : redirected to VendorQuotations,
    virtual criticality : Integer
  } actions {
    action submitRequest()             returns MaterialRequests;
    action approveRequest(approvalRemarks: String(500)) returns MaterialRequests;
    action rejectRequest(rejectionReason: String(500)) returns MaterialRequests;
    action closeRequest()              returns MaterialRequests;
  };

  @cds.redirection.target
  entity MaterialRequestItems as projection on epc.MaterialRequestItems {
    *,
    request  : redirected to MaterialRequests,
    material : redirected to MaterialMaster,
    boqItem  : redirected to BOQItems
  };

  // ── APPROVED MRs — Procurement entry point ───────────────────
  // Read-only view of all APPROVED/ORDERED MRs so Procurement
  // Officers can see what engineering has approved and act on it.
  @readonly
  @restrict: [
    { grant: ['READ'], to: ['ProcurementOfficer','ProjectManager','Management','BDM'] }
  ]
  entity ApprovedMaterialRequests as projection on epc.MaterialRequests {
    *,
    project     : redirected to Projects,
    requestedBy : redirected to Users,
    approvedBy  : redirected to Users,
    items       : redirected to ApprovedMaterialRequestItems,
    virtual criticality : Integer
  } where status = 'APPROVED' or status = 'ORDERED';

  @readonly
  entity ApprovedMaterialRequestItems as projection on epc.MaterialRequestItems {
    *,
    request  : redirected to ApprovedMaterialRequests,
    material : redirected to MaterialMaster,
    boqItem  : redirected to BOQItems
  };

  // ── VENDOR QUOTATIONS (read-only from project context) ────────
  @readonly
  @cds.redirection.target
  entity VendorQuotations as projection on epc.VendorQuotations {
    *,
    materialRequest: redirected to MaterialRequests,
    vendor         : redirected to VendorMaster,
    items          : redirected to VendorQuotationItems
  };

  @readonly
  @cds.redirection.target
  entity VendorQuotationItems as projection on epc.VendorQuotationItems {
    *,
    quotation   : redirected to VendorQuotations,
    requestItem : redirected to MaterialRequestItems,
    material    : redirected to MaterialMaster
  };

  // ── VENDOR MASTER ─────────────────────────────────────────────
  @odata.draft.enabled
  @restrict: [
    { grant: ['READ'],                     to: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer','FinanceOfficer'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['ProcurementOfficer','Management'] },
    { grant: ['activateVendor','deactivateVendor'], to: ['ProcurementOfficer','Management'] }
  ]
  entity VendorMaster as projection on epc.VendorMaster
  actions {
    action deactivateVendor() returns VendorMaster;
    action activateVendor()   returns VendorMaster;
  };

  @readonly
  entity VendorPerformanceLog as projection on epc.VendorPerformanceLog {
    *,
    vendor : redirected to VendorMaster
  };

  // ── PURCHASE ORDERS ───────────────────────────────────────────
  @odata.draft.enabled
  @restrict: [
    { grant: ['READ'],                    to: ['BDM','Engineer','ProjectManager','Management','ProcurementOfficer','FinanceOfficer'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['ProcurementOfficer','Management'] },
    { grant: ['confirmPO','cancelPO','closePO'], to: ['ProcurementOfficer','Management'] }
  ]
  entity PurchaseOrders as projection on epc.PurchaseOrders {
    *,
    project         : redirected to Projects,
    vendor          : redirected to VendorMaster,
    materialRequest : redirected to MaterialRequests,
    items           : redirected to PurchaseOrderItems
    // deliveries excluded: epc.Deliveries cannot redirect to our flat SEGW proxy entity.
    // Deliveries have their own dedicated list page (DeliveryList) — no sub-table needed.
  } excluding { deliveries } actions {
    action confirmPO()                   returns PurchaseOrders;
    action cancelPO(reason: String(500)) returns PurchaseOrders;
    action closePO()                     returns PurchaseOrders;
  };


  entity PurchaseOrderItems as projection on epc.PurchaseOrderItems {
    *,
    purchaseOrder : redirected to PurchaseOrders,
    material      : redirected to MaterialMaster
  };

  // ── DELIVERIES — ABAP SEGW proxy ──────────────────────────────
  // Flat entity — NOT a projection. Handlers proxy to SEGW ZSolarDeliverySet.
  // @odata.draft.enabled required for FE v4 Create button; draftActivate POSTs to SEGW.
  // Field names are PascalCase to match SEGW OData V2 ZSolarDelivery property names.
  // No @restrict here — service-level @requires handles auth; @restrict causes Insertable:false.
  @odata.draft.enabled
  entity Deliveries {
    key DeliveryNumber : String(36) @mandatory;
        PoNumber       : String(20);
        VendorId       : String(36);
        ProjectCode    : String(20);
        Status         : String(20) default 'SCHEDULED';
        ScheduledDate  : Date;
        ActualDate     : Date;
        DelayDays      : Integer;
        DelayReason    : String(200);
        VehicleNumber  : String(20);
        DriverName     : String(100);
        DriverPhone    : String(20);
        EwayBill       : String(50);
        CreatedAt      : Timestamp @readonly @cds.on.insert: $now;
        virtual Criticality : Integer;
  } actions {
    action markInTransit()                                     returns Deliveries;
    action markDelivered(actualDate: Date)                     returns Deliveries;
    action markDelayed(reason: String(200), newDate: Date)     returns Deliveries;
  };


  // ── MATERIAL RECEIPTS (GRN) ───────────────────────────────────
  // Named GRNReceipts to avoid collision with CAP auto-exposed epc.MaterialReceipts.
  // Flat entity — NOT a projection. Handlers proxy to ABAP ZUI_MAT_RECEIPT_BIND.
  //
  // NOTE: No @restrict or entity-level @requires here — both cause CAP to derive
  //       Insertable:false in $metadata which hides the Create button in Fiori Elements.
  //       The service-level @requires (line 9) handles authentication.
  //       Capabilities are declared via full struct form in annotations.cds.
  //       Handler-level checks in project-service.js enforce role granularity.
  @odata.draft.enabled
  entity GRNReceipts {
    key ReceiptID : String(50)  @mandatory;
        Material  : String(40)  @mandatory;
        Quantity  : Integer     @mandatory;
        PONumber  : String(20);
        Supplier  : String(100);
        Unit      : String(3);
        Status    : String(20)  default 'OPEN';
        Remarks   : String(500);
        CreatedAt : Timestamp   @readonly @cds.on.insert: $now;
        virtual dummyInfo : String(500) default 'Ensure materials are physically verified against the PO before submitting. Once verified or rejected, this document becomes immutable. Upload all relevant quality inspection certificates if needed.';
        virtual Criticality: Integer default 2;
  } actions {
    action verifyReceipt(remarks : String(500)) returns GRNReceipts;
    action rejectReceipt(reason  : String(500)) returns GRNReceipts;
  };

  // ── INVOICES ──────────────────────────────────────────────────
  @odata.draft.enabled
  @restrict: [
    { grant: ['READ','CREATE','UPDATE','DELETE'], to: ['FinanceOfficer','Management'] },
    { grant: ['submitInvoice','performThreeWayMatch','approveInvoice','rejectInvoice','markPaid'], to: ['FinanceOfficer','Management'] }
  ]
  entity Invoices as projection on epc.Invoices {
    *,
    vendor         : redirected to VendorMaster,
    purchaseOrder  : redirected to PurchaseOrders,
    // receipt excluded: epc.Invoices.receipt → epc.MaterialReceipts → epc.MaterialReceipts.delivery
    // → epc.Deliveries (auto-exposed), which collides with our flat SEGW Deliveries proxy.
    // GRN data is served separately through GRNReceipts (flat ABAP proxy entity).
    submittedBy    : redirected to Users,
    reviewedBy     : redirected to Users,
    approvedBy     : redirected to Users,
    items          : redirected to InvoiceItems,
    threeWayMatches: redirected to ThreeWayMatchResults
  } excluding { receipt } actions {

    action submitInvoice()                                              returns Invoices;
    action performThreeWayMatch()                                       returns Invoices;
    action approveInvoice()                                             returns Invoices;
    action rejectInvoice(reason: String(500))                          returns Invoices;
    action markPaid(paymentReference: String(50), paymentDate: Date)   returns Invoices;
  };

  entity InvoiceItems as projection on epc.InvoiceItems {
    *,
    invoice  : redirected to Invoices,
    poItem   : redirected to PurchaseOrderItems,
    material : redirected to MaterialMaster
    // receiptItem excluded: → MaterialReceiptItems → DeliveryItems.delivery → epc.Deliveries (auto-expose collision)
  } excluding { receiptItem };

  @readonly
  entity ThreeWayMatchResults as projection on epc.ThreeWayMatchResults {
    *,
    invoice      : redirected to Invoices,
    purchaseOrder: redirected to PurchaseOrders,
    material     : redirected to MaterialMaster
    // receipt, receiptItem, invoiceItem excluded:
    // → MaterialReceipts.delivery → epc.Deliveries  (auto-expose collision)
    // → MaterialReceiptItems.deliveryItem → DeliveryItems.delivery → epc.Deliveries
  } excluding { receipt, receiptItem, invoiceItem, poItem };

  // ── GRN RECEIPT ANALYTICS — ALP virtual entity ───────────────
  // NOT a view of GRNReceipts (which is @odata.draft.enabled).
  // @cds.persistence.skip: true → no DB table, no draft columns.
  // FE ALP won't inject IsActiveEntity / DraftMessages.
  // Data is served by a READ handler that reads from ProjectService_GRNReceipts (SQLite).
  // The entity MUST be a real DB entity (no @cds.persistence.skip) so it appears in
  // OData $metadata — without it, sap.fe.templates.AnalyticalListPage can't find the
  // entity and the chart panel stays blank regardless of what data the handler returns.
  @readonly
  @restrict: [
    { grant: ['READ'], to: ['Management','ProjectManager','ProcurementOfficer','Engineer','BDM','FinanceOfficer'] }
  ]
  @Aggregation.ApplySupported: {
    $Type              : 'Aggregation.ApplySupportedType',
    Transformations    : ['aggregate', 'groupby', 'filter'],
    Rollup             : #None,
    GroupableProperties: [Supplier, Status, Unit, Material],
    AggregatableProperties: [
      { $Type: 'Aggregation.AggregatablePropertyType', Property: Quantity }
    ]
  }
  entity GRNReceiptAnalytics {
    key ReceiptID : String;
        Material  : String(40);
        Quantity  : Integer;
        PONumber  : String(20);
        Supplier  : String(100);
        Unit      : String(3);
        Status    : String(20);
        Remarks   : String(500);
        CreatedAt : Timestamp;
  }
}

// UI annotations are maintained in app/projectmanagement/annotations.cds
