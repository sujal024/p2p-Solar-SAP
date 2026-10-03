using solar.epc as epc from '../db/schema';

// ═══════════════════════════════════════════════════════════════
// VENDOR SERVICE  — CAP OData V4
// Covers: Vendor Master, RFQ, Quotations, Vendor Selection
// Roles: Procurement Officer, Management
// ═══════════════════════════════════════════════════════════════

@requires: ['ProcurementOfficer','Management','ProjectManager']
service VendorService @(path: '/vendor') {

  // ── READ-ONLY REFERENCES ──────────────────────────────────────
  @readonly
  entity MaterialMaster as projection on epc.MaterialMaster
    where isActive = true;

  @readonly
  entity Projects as projection on epc.Projects {
    ID, projectCode, projectName
  };

  @cds.redirection.target
  @readonly
  entity MaterialRequests as projection on epc.MaterialRequests;

  // Filtered view used by the QuotationComparison dropdown — only shows
  // MRs that are ready for vendor sourcing.
  @readonly
  entity ApprovedMaterialRequests as projection on epc.MaterialRequests {
    *,
    project : redirected to Projects
  } where status = 'APPROVED' or status = 'ORDERED';

  @readonly
  entity MaterialRequestItems as projection on epc.MaterialRequestItems;

  // ── VENDOR MASTER ─────────────────────────────────────────────
  @odata.draft.enabled
  entity VendorMaster as projection on epc.VendorMaster
  actions {
    action deactivateVendor()       returns VendorMaster;
    action activateVendor()         returns VendorMaster;
  };

  // ── VENDOR QUOTATIONS ─────────────────────────────────────────
  @odata.draft.enabled
  entity VendorQuotations as projection on epc.VendorQuotations {
    *,
    materialRequest : redirected to MaterialRequests,
    vendor          : redirected to VendorMaster,
    items           : redirected to VendorQuotationItems
  } actions {
    action submitQuotation()                    returns VendorQuotations;
    action selectVendor(selectionReason: String(500)) returns VendorQuotations;
    action rejectQuotation(reason: String(500)) returns VendorQuotations;
  };

  entity VendorQuotationItems as projection on epc.VendorQuotationItems {
    *,
    quotation   : redirected to VendorQuotations,
    requestItem : redirected to MaterialRequestItems,
    material    : redirected to MaterialMaster
  };

  // ── VENDOR PERFORMANCE LOG ────────────────────────────────────
  @readonly
  entity VendorPerformanceLog as projection on epc.VendorPerformanceLog {
    *,
    vendor : redirected to VendorMaster
  };

  // ── QUOTATION COMPARISON (custom function) ────────────────────
  function compareQuotations(materialRequestId: UUID) returns array of VendorQuotations;
}

// ─── ANNOTATIONS: VENDOR MASTER ───────────────────────────────

annotate VendorService.VendorMaster with @(
  UI.Identification: [
    {
      $Type  : 'UI.DataFieldForAction',
      Action : 'VendorService.deactivateVendor',
      Label  : 'Deactivate'
    },
    {
      $Type  : 'UI.DataFieldForAction',
      Action : 'VendorService.activateVendor',
      Label  : 'Activate'
    }
  ],
  UI.LineItem: [
    { Value: vendorCode,       Label: 'Vendor Code'     },
    { Value: vendorName,       Label: 'Vendor Name'     },
    { Value: gstin,            Label: 'GSTIN'           },
    { Value: city,             Label: 'City'            },
    { Value: state,            Label: 'State'           },
    { Value: contactPerson,    Label: 'Contact Person'  },
    { Value: phone,            Label: 'Phone'           },
    { Value: performanceScore, Label: 'Performance Score'},
    { Value: isActive,         Label: 'Active'          }
  ],
  UI.SelectionFields: [ isActive, state, city ],
  UI.HeaderInfo: {
    TypeName      : 'Vendor',
    TypeNamePlural: 'Vendors',
    Title         : { Value: vendorName },
    Description   : { Value: vendorCode }
  },
  UI.Facets: [
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'General Details',
      Target: '@UI.FieldGroup#General'
    },
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Bank & Payment',
      Target: '@UI.FieldGroup#Banking'
    },
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Performance Metrics',
      Target: '@UI.FieldGroup#Performance'
    }
  ],
  UI.FieldGroup#General: {
    Label: 'General Details',
    Data : [
      { Value: vendorCode    },
      { Value: vendorName    },
      { Value: gstin         },
      { Value: pan           },
      { Value: address       },
      { Value: city          },
      { Value: state         },
      { Value: pincode       },
      { Value: contactPerson },
      { Value: email         },
      { Value: phone         },
      { Value: paymentTerms  },
      { Value: isActive      }
    ]
  },
  UI.FieldGroup#Banking: {
    Label: 'Bank & Payment',
    Data : [
      { Value: bankAccount  },
      { Value: bankIFSC     },
      { Value: paymentTerms }
    ]
  },
  UI.FieldGroup#Performance: {
    Label: 'Performance',
    Data : [
      { Value: performanceScore },
      { Value: totalOrders      },
      { Value: onTimeDeliveries },
      { Value: qualityScore     }
    ]
  }
);

annotate VendorService.VendorMaster with {
  vendorCode    @title: 'Vendor Code'      @mandatory;
  vendorName    @title: 'Vendor Name'      @mandatory;
  gstin         @title: 'GSTIN';
  pan           @title: 'PAN';
  address       @title: 'Address';
  city          @title: 'City';
  state         @title: 'State';
  pincode       @title: 'Pincode';
  contactPerson @title: 'Contact Person';
  email         @title: 'Email';
  phone         @title: 'Phone';
  bankAccount   @title: 'Bank Account';
  bankIFSC      @title: 'Bank IFSC';
  paymentTerms  @title: 'Payment Terms';
  isActive      @title: 'Active';
}

// ─── ANNOTATIONS: VENDOR QUOTATIONS ───────────────────────────

annotate VendorService.VendorQuotations with @(
  UI.LineItem: [
    { Value: quotationNumber,  Label: 'Quotation No.'     },
    { Value: vendor_ID,        Label: 'Vendor'            },
    { Value: quotationDate,    Label: 'Quotation Date'    },
    { Value: validityDate,     Label: 'Valid Until'       },
    { Value: totalAmount,      Label: 'Total Amount'      },
    { Value: deliveryLeadDays, Label: 'Lead Days'         },
    { Value: status,           Label: 'Status'            },
    { Value: isSelected,       Label: 'Selected'          }
  ],
  UI.SelectionFields: [ status, vendor_ID, materialRequest_ID ],
  UI.HeaderInfo: {
    TypeName      : 'Vendor Quotation',
    TypeNamePlural: 'Vendor Quotations',
    Title         : { Value: quotationNumber },
    Description   : { Value: vendor_ID }
  },
  UI.Facets: [
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Quotation Header',
      Target: '@UI.FieldGroup#Header'
    },
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Quoted Items',
      Target: 'items/@UI.LineItem'
    }
  ],
  UI.FieldGroup#Header: {
    Label: 'Quotation Header',
    Data : [
      { Value: quotationNumber   },
      { Value: materialRequest_ID},
      { Value: vendor_ID         },
      { Value: quotationDate     },
      { Value: validityDate      },
      { Value: currency          },
      { Value: subtotal          },
      { Value: taxAmount         },
      { Value: totalAmount       },
      { Value: deliveryLeadDays  },
      { Value: paymentTerms      },
      { Value: status            },
      { Value: isSelected        },
      { Value: selectionReason   },
      { Value: technicalRemarks  },
      { Value: commercialRemarks }
    ]
  }
);

annotate VendorService.VendorQuotationItems with @(
  UI.LineItem: [
    { Value: lineNumber,  Label: 'Line'        },
    { Value: material_ID, Label: 'Material'    },
    { Value: description, Label: 'Description' },
    { Value: quotedQty,   Label: 'Qty'         },
    { Value: uom,         Label: 'UOM'         },
    { Value: unitPrice,   Label: 'Unit Price'  },
    { Value: taxPercent,  Label: 'Tax %'       },
    { Value: taxAmount,   Label: 'Tax Amt'     },
    { Value: totalAmount, Label: 'Total'       },
    { Value: brand,       Label: 'Brand'       },
    { Value: partNumber,  Label: 'Part No.'    }
  ]
);
