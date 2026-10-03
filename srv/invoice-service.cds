using solar.epc as epc from '../db/schema';

// ═══════════════════════════════════════════════════════════════
// INVOICE SERVICE  — CAP OData V4  (simulates RAP pattern)
// Covers: Invoices, Three-Way Match Validation
// Roles: Finance Officer, Management
// ═══════════════════════════════════════════════════════════════

@requires: ['FinanceOfficer','Management']
service InvoiceService @(path: '/invoice') {

  // ── READ-ONLY REFERENCES ──────────────────────────────────────
  @readonly
  entity VendorMaster as projection on epc.VendorMaster;

  @readonly
  entity PurchaseOrders as projection on epc.PurchaseOrders;

  @readonly
  entity PurchaseOrderItems as projection on epc.PurchaseOrderItems;

  @readonly
  entity MaterialReceipts as projection on epc.MaterialReceipts;

  @readonly
  entity MaterialReceiptItems as projection on epc.MaterialReceiptItems;

  @readonly
  entity MaterialMaster as projection on epc.MaterialMaster;

  @readonly
  entity Users as projection on epc.Users;

  // ── INVOICES ──────────────────────────────────────────────────
  @odata.draft.enabled
  entity Invoices as projection on epc.Invoices {
    *,
    vendor        : redirected to VendorMaster,
    purchaseOrder : redirected to PurchaseOrders,
    receipt       : redirected to MaterialReceipts,
    submittedBy   : redirected to Users,
    reviewedBy    : redirected to Users,
    approvedBy    : redirected to Users,
    items         : redirected to InvoiceItems,
    threeWayMatches: redirected to ThreeWayMatchResults
  } actions {
    action submitInvoice()                          returns Invoices;
    action performThreeWayMatch()                   returns Invoices;
    action approveInvoice()                         returns Invoices;
    action rejectInvoice(reason: String(500))       returns Invoices;
    action markPaid(paymentReference: String(50), paymentDate: Date) returns Invoices;
  };

  entity InvoiceItems as projection on epc.InvoiceItems {
    *,
    invoice     : redirected to Invoices,
    poItem      : redirected to PurchaseOrderItems,
    receiptItem : redirected to MaterialReceiptItems,
    material    : redirected to MaterialMaster
  };

  // ── THREE-WAY MATCH RESULTS ───────────────────────────────────
  @readonly
  entity ThreeWayMatchResults as projection on epc.ThreeWayMatchResults {
    *,
    invoice      : redirected to Invoices,
    purchaseOrder: redirected to PurchaseOrders,
    receipt      : redirected to MaterialReceipts,
    material     : redirected to MaterialMaster
  };
}

// ─── ANNOTATIONS: INVOICES ────────────────────────────────────

annotate InvoiceService.Invoices with @(
  UI.LineItem: [
    { Value: invoiceNumber,   Label: 'Invoice No.'      },
    { Value: vendorInvoiceNo, Label: 'Vendor Invoice'   },
    { Value: vendor_ID,       Label: 'Vendor'           },
    { Value: purchaseOrder_ID,Label: 'PO Number'        },
    { Value: invoiceDate,     Label: 'Invoice Date'     },
    { Value: dueDate,         Label: 'Due Date'         },
    { Value: totalAmount,     Label: 'Total Amount'     },
    { Value: status,          Label: 'Status'           },
    { Value: paymentDate,     Label: 'Payment Date'     }
  ],
  UI.SelectionFields: [ status, vendor_ID, purchaseOrder_ID, invoiceDate ],
  UI.HeaderInfo: {
    TypeName      : 'Invoice',
    TypeNamePlural: 'Invoices',
    Title         : { Value: invoiceNumber },
    Description   : { Value: vendor_ID }
  },
  UI.Facets: [
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Invoice Header',
      Target: '@UI.FieldGroup#Header'
    },
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Financial Summary',
      Target: '@UI.FieldGroup#Financials'
    },
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Approval Details',
      Target: '@UI.FieldGroup#Approval'
    },
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Invoice Line Items',
      Target: 'items/@UI.LineItem'
    },
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Three-Way Match Results',
      Target: 'threeWayMatches/@UI.LineItem'
    }
  ],
  UI.FieldGroup#Header: {
    Label: 'Invoice Header',
    Data : [
      { Value: invoiceNumber    },
      { Value: vendorInvoiceNo  },
      { Value: vendor_ID        },
      { Value: purchaseOrder_ID },
      { Value: receipt_ID       },
      { Value: invoiceDate      },
      { Value: dueDate          },
      { Value: status           },
      { Value: remarks          },
      { Value: rejectionReason  }
    ]
  },
  UI.FieldGroup#Financials: {
    Label: 'Financial Summary',
    Data : [
      { Value: currency    },
      { Value: subtotal    },
      { Value: taxAmount   },
      { Value: totalAmount }
    ]
  },
  UI.FieldGroup#Approval: {
    Label: 'Approval Details',
    Data : [
      { Value: submittedBy_ID    },
      { Value: reviewedBy_ID     },
      { Value: approvedBy_ID     },
      { Value: approvalDate      },
      { Value: paymentDate       },
      { Value: paymentReference  }
    ]
  }
);

annotate InvoiceService.InvoiceItems with @(
  UI.LineItem: [
    { Value: lineNumber,  Label: 'Line'        },
    { Value: material_ID, Label: 'Material'    },
    { Value: description, Label: 'Description' },
    { Value: invoicedQty, Label: 'Qty'         },
    { Value: uom,         Label: 'UOM'         },
    { Value: unitPrice,   Label: 'Unit Price'  },
    { Value: taxPercent,  Label: 'Tax %'       },
    { Value: taxAmount,   Label: 'Tax Amount'  },
    { Value: totalAmount, Label: 'Line Total'  }
  ]
);

annotate InvoiceService.ThreeWayMatchResults with @(
  UI.LineItem: [
    { Value: material_ID,      Label: 'Material'         },
    { Value: poQty,            Label: 'PO Qty'           },
    { Value: receivedQty,      Label: 'Received Qty'     },
    { Value: invoicedQty,      Label: 'Invoiced Qty'     },
    { Value: poUnitPrice,      Label: 'PO Price'         },
    { Value: invoiceUnitPrice, Label: 'Invoice Price'    },
    { Value: quantityMatch,    Label: 'Qty Match'        },
    { Value: priceMatch,       Label: 'Price Match'      },
    { Value: overallStatus,    Label: 'Overall Status'   },
    { Value: qtyVariance,      Label: 'Qty Variance'     },
    { Value: valueVariance,    Label: 'Value Variance'   }
  ]
);
