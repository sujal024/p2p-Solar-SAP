using solar.epc as epc from '../db/schema';

// ═══════════════════════════════════════════════════════════════
// DASHBOARD SERVICE  — CAP OData V4
// Covers: Analytics, KPIs, Charts, Management Summary
// Roles: Management, Project Manager, Procurement Officer, Finance Officer
// ═══════════════════════════════════════════════════════════════

@requires: ['Management','ProjectManager','FinanceOfficer','ProcurementOfficer']
service DashboardService @(path: '/dashboard') {

  // ── PROJECT SUMMARY VIEW ──────────────────────────────────────
  @readonly
  view ProjectSummary as select from epc.Projects {
    key ID,
    projectCode,
    projectName,
    clientName,
    location,
    state,
    capacityKWp,
    budget,
    spentAmount,
    currency,
    status,
    startDate,
    endDate,
    (budget - spentAmount)       as remainingBudget : Decimal(18,2),
    case when budget > 0
      then round((spentAmount / budget) * 100, 2)
      else 0
    end                          as budgetUtilizationPct : Decimal(5,2)
  };

  // ── PROCUREMENT KPI VIEW ──────────────────────────────────────
  @readonly
  view ProcurementKPI as select from epc.PurchaseOrders {
    key project.ID             as projectId,
        project.projectCode    as projectCode,
        project.projectName    as projectName,
        count(ID)              as totalPOs       : Integer,
        sum(grandTotal)        as totalPOValue   : Decimal(18,2),
        count(case when status = 'CONFIRMED'         then 1 end) as confirmedPOs  : Integer,
        count(case when status = 'FULLY_DELIVERED'   then 1 end) as deliveredPOs  : Integer,
        count(case when status = 'CANCELLED'         then 1 end) as cancelledPOs  : Integer
  } group by project.ID, project.projectCode, project.projectName;

  // ── DELIVERY PERFORMANCE VIEW ─────────────────────────────────
  @readonly
  view DeliveryPerformance as select from epc.Deliveries {
    key purchaseOrder.vendor.ID       as vendorId,
        purchaseOrder.vendor.vendorName as vendorName,
        count(ID)                     as totalDeliveries  : Integer,
        count(case when status = 'DELIVERED' and delayDays = 0 then 1 end) as onTime : Integer,
        count(case when delayDays > 0 then 1 end)         as delayed   : Integer,
        avg(delayDays)                as avgDelayDays     : Decimal(5,2),
        max(delayDays)                as maxDelayDays     : Integer
  } group by purchaseOrder.vendor.ID, purchaseOrder.vendor.vendorName;

  // ── RECEIPT QUALITY VIEW ──────────────────────────────────────
  @readonly
  view ReceiptQuality as select from epc.MaterialReceiptItems {
    key receipt.purchaseOrder.project.ID   as projectId,
        receipt.purchaseOrder.project.projectCode as projectCode,
        sum(dispatchedQty)  as totalDispatched : Decimal(13,3),
        sum(acceptedQty)    as totalAccepted   : Decimal(13,3),
        sum(rejectedQty)    as totalRejected   : Decimal(13,3),
        case when sum(dispatchedQty) > 0
          then round((sum(rejectedQty) / sum(dispatchedQty)) * 100, 2)
          else 0
        end                 as rejectionRate  : Decimal(5,2)
  } group by receipt.purchaseOrder.project.ID, receipt.purchaseOrder.project.projectCode;

  // ── INVOICE MATCHING STATUS VIEW ─────────────────────────────
  @readonly
  view InvoiceMatchingSummary as select from epc.Invoices {
    key vendor.ID                       as vendorId,
        vendor.vendorName               as vendorName,
        count(ID)                       as totalInvoices : Integer,
        sum(totalAmount)                as totalValue    : Decimal(18,2),
        count(case when status = 'MATCHED'  then 1 end) as matched     : Integer,
        count(case when status = 'MISMATCH' then 1 end) as mismatched  : Integer,
        count(case when status = 'PAID'     then 1 end) as paid        : Integer,
        count(case when status = 'APPROVED' then 1 end) as approved    : Integer
  } group by vendor.ID, vendor.vendorName;

  // ── VENDOR PERFORMANCE SUMMARY VIEW ──────────────────────────
  @readonly
  view VendorPerformanceSummary as select from epc.VendorMaster {
    key ID,
    vendorCode,
    vendorName,
    performanceScore,
    totalOrders,
    onTimeDeliveries,
    qualityScore,
    isActive,
    case when totalOrders > 0
      then round((onTimeDeliveries / totalOrders) * 100, 2)
      else 0
    end as onTimeDeliveryPct : Decimal(5,2)
  } where isActive = true;

  // ── MATERIAL CONSUMPTION VIEW ─────────────────────────────────
  @readonly
  view MaterialConsumption as select from epc.BOQItems {
    key ID,
        project.projectCode as projectCode,
        material.materialCode as materialCode,
        material.description  as materialDescription,
        material.category     as category,
        uom,
        plannedQty,
        requestedQty,
        orderedQty,
        receivedQty,
        (plannedQty - receivedQty) as pendingQty       : Decimal(13,3),
        case when plannedQty > 0
          then round((receivedQty / plannedQty) * 100, 2)
          else 0
        end                        as completionPct    : Decimal(5,2)
  };

  // ── THREE-WAY MATCH SUMMARY ───────────────────────────────────
  @readonly
  view ThreeWayMatchSummary as select from epc.ThreeWayMatchResults {
    key invoice.purchaseOrder.project.ID       as projectId,
        invoice.purchaseOrder.project.projectCode as projectCode,
        count(ID)                              as totalLines    : Integer,
        count(case when overallStatus = 'MATCHED'           then 1 end) as matched       : Integer,
        count(case when overallStatus = 'QUANTITY_MISMATCH' then 1 end) as qtyMismatch   : Integer,
        count(case when overallStatus = 'PRICE_MISMATCH'    then 1 end) as priceMismatch : Integer,
        count(case when overallStatus = 'BOTH_MISMATCH'     then 1 end) as bothMismatch  : Integer,
        sum(abs(valueVariance))                as totalVariance : Decimal(18,2)
  } group by invoice.purchaseOrder.project.ID, invoice.purchaseOrder.project.projectCode;

  // ── GRN RECEIPT ANALYTICS — granular, ALP-ready ──────────────
  // Row-level view of MaterialReceiptItems joined up to project/vendor.
  // @Aggregation.ApplySupported enables the ALP to issue $apply
  // groupby/aggregate queries entirely within the CAP OData V4 runtime.
  @readonly
  @Aggregation.ApplySupported: {
    $Type              : 'Aggregation.ApplySupportedType',
    Transformations    : ['aggregate', 'groupby', 'filter'],
    Rollup             : #None,
    GroupableProperties: [projectCode, vendorName, materialCategory, receiptStatus, condition],
    AggregatableProperties: [
      { $Type: 'Aggregation.AggregatablePropertyType', Property: receivedQty },
      { $Type: 'Aggregation.AggregatablePropertyType', Property: acceptedQty },
      { $Type: 'Aggregation.AggregatablePropertyType', Property: rejectedQty }
    ]
  }
  view GRNReceiptAnalytics as select from epc.MaterialReceiptItems {
    key ID,
        receipt.purchaseOrder.project.projectCode  as projectCode         : String(20),
        receipt.purchaseOrder.vendor.vendorName    as vendorName          : String(200),
        material.category                          as materialCategory    : String(50),
        material.description                       as materialDescription : String(200),
        receipt.status                             as receiptStatus       : String(30),
        condition,
        uom,
        receivedQty,
        acceptedQty,
        rejectedQty
  };

  // ── KPI FUNCTION: OVERALL PROJECT HEALTH ─────────────────────
  function getProjectHealth(projectId: UUID) returns {
    projectCode       : String(20);
    budgetUtilization : Decimal(5,2);
    procurementStatus : String(50);
    deliveryStatus    : String(50);
    invoiceStatus     : String(50);
    overallHealth     : String(20);
  };
}

// ═══════════════════════════════════════════════════════════════
// OVP ANNOTATIONS — ProjectSummary
// sap.ovp.cards.v4.analyticalChart  (card01 in manifest)
// ═══════════════════════════════════════════════════════════════
annotate DashboardService.ProjectSummary with @(

  UI.LineItem: [
    { Value: projectCode,          Label: 'Project Code'   },
    { Value: projectName,          Label: 'Project Name'   },
    { Value: status,               Label: 'Status'         },
    { Value: budget,               Label: 'Budget'         },
    { Value: spentAmount,          Label: 'Spent'          },
    { Value: remainingBudget,      Label: 'Remaining'      },
    { Value: budgetUtilizationPct, Label: 'Utilized %'     }
  ],

  UI.DataPoint#BudgetUtil: {
    Value       : budgetUtilizationPct,
    Title       : 'Budget Utilization %',
    MaximumValue: 100,
    Criticality : #Positive
  },

  UI.DataPoint#Spent: {
    Value : spentAmount,
    Title : 'Total Spent (INR)'
  },

  UI.Chart#BudgetChart: {
    $Type              : 'UI.ChartDefinitionType',
    Title              : 'Budget vs Spent by Project',
    ChartType          : #Bar,
    Dimensions         : [projectCode],
    DimensionAttributes: [{ $Type: 'UI.ChartDimensionAttributeType', Dimension: projectCode, Role: #Category }],
    Measures           : [spentAmount, remainingBudget],
    MeasureAttributes  : [
      { $Type: 'UI.ChartMeasureAttributeType', Measure: spentAmount,     Role: #Axis1 },
      { $Type: 'UI.ChartMeasureAttributeType', Measure: remainingBudget, Role: #Axis1 }
    ]
  },

  UI.SelectionVariant#AllProjects: { SelectOptions: [] },

  UI.PresentationVariant#BudgetPV: {
    Visualizations: ['@UI.Chart#BudgetChart', '@UI.LineItem']
  },

  UI.KPI#BudgetKPI: {
    $Type           : 'UI.KPIType',
    DataPoint       : ![@UI.DataPoint#BudgetUtil],
    SelectionVariant: ![@UI.SelectionVariant#AllProjects],
    ID              : 'BudgetKPI',
    Detail          : {
      $Type                      : 'UI.KPIDetailType',
      DefaultPresentationVariant : ![@UI.PresentationVariant#BudgetPV]
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// OVP ANNOTATIONS — ReceiptQuality  (GRN KPI card)
// sap.ovp.cards.v4.analyticalChart  (card02 in manifest)
// ═══════════════════════════════════════════════════════════════
annotate DashboardService.ReceiptQuality with @(

  UI.LineItem: [
    { Value: projectCode,    Label: 'Project'          },
    { Value: totalDispatched,Label: 'Dispatched Qty'   },
    { Value: totalAccepted,  Label: 'Accepted Qty'     },
    { Value: totalRejected,  Label: 'Rejected Qty'     },
    { Value: rejectionRate,  Label: 'Rejection Rate %' }
  ],

  UI.DataPoint#AcceptedDP: {
    Value       : totalAccepted,
    Title       : 'Total Accepted Qty',
    Criticality : #Positive
  },

  UI.DataPoint#RejectionRateDP: {
    Value       : rejectionRate,
    Title       : 'Rejection Rate %',
    MaximumValue: 100,
    Criticality : #Negative
  },

  UI.Chart#ReceiptQualityChart: {
    $Type              : 'UI.ChartDefinitionType',
    Title              : 'Accepted vs Rejected Qty by Project',
    ChartType          : #Bar,
    Dimensions         : [projectCode],
    DimensionAttributes: [{ $Type: 'UI.ChartDimensionAttributeType', Dimension: projectCode, Role: #Category }],
    Measures           : [totalAccepted, totalRejected],
    MeasureAttributes  : [
      { $Type: 'UI.ChartMeasureAttributeType', Measure: totalAccepted, Role: #Axis1 },
      { $Type: 'UI.ChartMeasureAttributeType', Measure: totalRejected, Role: #Axis1 }
    ]
  },

  UI.SelectionVariant#RQSV: { SelectOptions: [] },

  UI.PresentationVariant#RQPV: {
    Visualizations: ['@UI.Chart#ReceiptQualityChart', '@UI.LineItem']
  },

  UI.KPI#ReceiptKPI: {
    $Type           : 'UI.KPIType',
    DataPoint       : ![@UI.DataPoint#AcceptedDP],
    SelectionVariant: ![@UI.SelectionVariant#RQSV],
    ID              : 'ReceiptKPI',
    Detail          : {
      $Type                      : 'UI.KPIDetailType',
      DefaultPresentationVariant : ![@UI.PresentationVariant#RQPV]
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// OVP ANNOTATIONS — VendorPerformanceSummary
// sap.ovp.cards.v4.analyticalChart  (card03 in manifest)
// ═══════════════════════════════════════════════════════════════
annotate DashboardService.VendorPerformanceSummary with @(

  UI.LineItem: [
    { Value: vendorCode,        Label: 'Vendor Code'   },
    { Value: vendorName,        Label: 'Vendor Name'   },
    { Value: totalOrders,       Label: 'Total Orders'  },
    { Value: onTimeDeliveries,  Label: 'On-Time'       },
    { Value: onTimeDeliveryPct, Label: 'OTD %'         },
    { Value: qualityScore,      Label: 'Quality Score' },
    { Value: performanceScore,  Label: 'Overall Score' }
  ],

  UI.DataPoint#OTDDP: {
    Value       : onTimeDeliveryPct,
    Title       : 'On-Time Delivery %',
    MaximumValue: 100,
    Criticality : #Positive
  },

  UI.Chart#VendorChart: {
    $Type              : 'UI.ChartDefinitionType',
    Title              : 'Vendor Performance Score',
    ChartType          : #Donut,
    Dimensions         : [vendorName],
    DimensionAttributes: [{ $Type: 'UI.ChartDimensionAttributeType', Dimension: vendorName, Role: #Category }],
    Measures           : [performanceScore],
    MeasureAttributes  : [{ $Type: 'UI.ChartMeasureAttributeType', Measure: performanceScore, Role: #Axis1 }]
  },

  UI.SelectionVariant#VPSSV: { SelectOptions: [] },

  UI.PresentationVariant#VPSPV: {
    Visualizations: ['@UI.Chart#VendorChart', '@UI.LineItem']
  },

  UI.KPI#VendorKPI: {
    $Type           : 'UI.KPIType',
    DataPoint       : ![@UI.DataPoint#OTDDP],
    SelectionVariant: ![@UI.SelectionVariant#VPSSV],
    ID              : 'VendorKPI',
    Detail          : {
      $Type                      : 'UI.KPIDetailType',
      DefaultPresentationVariant : ![@UI.PresentationVariant#VPSPV]
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// OVP ANNOTATIONS — ProcurementKPI
// sap.ovp.cards.v4.table  (card04 in manifest)
// ═══════════════════════════════════════════════════════════════
annotate DashboardService.ProcurementKPI with @(

  UI.LineItem: [
    { Value: projectCode,  Label: 'Project'        },
    { Value: projectName,  Label: 'Project Name'   },
    { Value: totalPOs,     Label: 'Total POs'      },
    { Value: confirmedPOs, Label: 'Confirmed'      },
    { Value: deliveredPOs, Label: 'Delivered'      },
    { Value: cancelledPOs, Label: 'Cancelled'      },
    { Value: totalPOValue, Label: 'PO Value (INR)' }
  ],

  UI.DataPoint#TotalPOValue: {
    Value : totalPOValue,
    Title : 'Total PO Value (INR)'
  },

  UI.Chart#ProcChart: {
    $Type              : 'UI.ChartDefinitionType',
    Title              : 'PO Value by Project',
    ChartType          : #Bar,
    Dimensions         : [projectCode],
    DimensionAttributes: [{ $Type: 'UI.ChartDimensionAttributeType', Dimension: projectCode, Role: #Category }],
    Measures           : [totalPOValue],
    MeasureAttributes  : [{ $Type: 'UI.ChartMeasureAttributeType', Measure: totalPOValue, Role: #Axis1 }]
  },

  UI.SelectionVariant#ProcSV: { SelectOptions: [] },

  UI.PresentationVariant#ProcPV: {
    Visualizations: ['@UI.Chart#ProcChart', '@UI.LineItem']
  }
);

// ═══════════════════════════════════════════════════════════════
// OVP ANNOTATIONS — InvoiceMatchingSummary
// sap.ovp.cards.v4.list  (card05 in manifest)
// ═══════════════════════════════════════════════════════════════
annotate DashboardService.InvoiceMatchingSummary with @(

  UI.LineItem: [
    { Value: vendorName,    Label: 'Vendor'            },
    { Value: totalInvoices, Label: 'Total Invoices'    },
    { Value: matched,       Label: 'Matched'           },
    { Value: mismatched,    Label: 'Mismatched'        },
    { Value: approved,      Label: 'Approved'          },
    { Value: paid,          Label: 'Paid'              },
    { Value: totalValue,    Label: 'Total Value (INR)' }
  ],

  UI.DataPoint#InvoicePaid: {
    Value       : paid,
    Title       : 'Paid Invoices',
    Criticality : #Positive
  }
);

// ═══════════════════════════════════════════════════════════════
// OVP ANNOTATIONS — DeliveryPerformance  (card06 in manifest)
// ═══════════════════════════════════════════════════════════════
annotate DashboardService.DeliveryPerformance with @(

  UI.LineItem: [
    { Value: vendorName,       Label: 'Vendor'           },
    { Value: totalDeliveries,  Label: 'Total Deliveries' },
    { Value: onTime,           Label: 'On-Time'          },
    { Value: delayed,          Label: 'Delayed'          },
    { Value: avgDelayDays,     Label: 'Avg Delay (days)' },
    { Value: maxDelayDays,     Label: 'Max Delay (days)' }
  ],

  UI.DataPoint#OTDRate: {
    Value       : onTime,
    Title       : 'On-Time Deliveries',
    Criticality : #Positive
  }
);

// ═══════════════════════════════════════════════════════════════
// OVP ANNOTATIONS — ThreeWayMatchSummary  (card07 in manifest)
// ═══════════════════════════════════════════════════════════════
annotate DashboardService.ThreeWayMatchSummary with @(

  UI.LineItem: [
    { Value: projectCode,   Label: 'Project'         },
    { Value: totalLines,    Label: 'Total Lines'      },
    { Value: matched,       Label: 'Matched'          },
    { Value: qtyMismatch,   Label: 'Qty Mismatch'     },
    { Value: priceMismatch, Label: 'Price Mismatch'   },
    { Value: bothMismatch,  Label: 'Both Mismatch'    },
    { Value: totalVariance, Label: 'Variance (INR)'   }
  ],

  UI.DataPoint#MatchRate: {
    Value       : matched,
    Title       : 'Matched Lines',
    Criticality : #Positive
  }
);

// ═══════════════════════════════════════════════════════════════

// ALP ANNOTATIONS — GRNReceiptAnalytics
// Drives sap.fe.templates.AnalyticalListPage (GRNAnalytics target)
// ═══════════════════════════════════════════════════════════════
annotate DashboardService.GRNReceiptAnalytics with @(

  // Filter fields shown in the Smart Filter Bar
  UI.SelectionFields: [receiptStatus, projectCode, vendorName, materialCategory, condition],

  // Table columns (bottom panel of ALP)
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: projectCode,         Label: 'Project'           },
    { $Type: 'UI.DataField', Value: vendorName,          Label: 'Vendor'            },
    { $Type: 'UI.DataField', Value: materialCategory,    Label: 'Category'          },
    { $Type: 'UI.DataField', Value: materialDescription, Label: 'Material'          },
    { $Type: 'UI.DataField', Value: receiptStatus,       Label: 'Status'            },
    { $Type: 'UI.DataField', Value: condition,           Label: 'Condition'         },
    { $Type: 'UI.DataField', Value: uom,                 Label: 'UOM'               },
    { $Type: 'UI.DataField', Value: receivedQty,         Label: 'Received Qty'      },
    { $Type: 'UI.DataField', Value: acceptedQty,         Label: 'Accepted Qty'      },
    { $Type: 'UI.DataField', Value: rejectedQty,         Label: 'Rejected Qty'      }
  ],

  // Chart (top panel of ALP) — driven by $apply groupby
  UI.Chart: {
    $Type              : 'UI.ChartDefinitionType',
    Title              : 'GRN Quantity by Receipt Status',
    ChartType          : #Column,
    Dimensions         : [receiptStatus],
    DimensionAttributes: [
      { $Type: 'UI.ChartDimensionAttributeType', Dimension: receiptStatus, Role: #Category }
    ],
    Measures           : [receivedQty, acceptedQty, rejectedQty],
    MeasureAttributes  : [
      { $Type: 'UI.ChartMeasureAttributeType', Measure: receivedQty,  Role: #Axis1 },
      { $Type: 'UI.ChartMeasureAttributeType', Measure: acceptedQty,  Role: #Axis1 },
      { $Type: 'UI.ChartMeasureAttributeType', Measure: rejectedQty,  Role: #Axis1 }
    ]
  },

  // Default presentation: show chart + table together
  UI.PresentationVariant: {
    GroupBy       : [receiptStatus, projectCode],
    Visualizations: ['@UI.Chart', '@UI.LineItem']
  }
);

// ── Field titles + aggregation defaults ──────────────────────
annotate DashboardService.GRNReceiptAnalytics with {
  projectCode         @title: 'Project Code';
  vendorName          @title: 'Vendor';
  materialCategory    @title: 'Material Category';
  materialDescription @title: 'Material';
  receiptStatus       @title: 'Receipt Status';
  condition           @title: 'Condition';
  uom                 @title: 'UOM';
  receivedQty         @title: 'Received Qty'  @Aggregation.default: #SUM;
  acceptedQty         @title: 'Accepted Qty'  @Aggregation.default: #SUM;
  rejectedQty         @title: 'Rejected Qty'  @Aggregation.default: #SUM;
}
