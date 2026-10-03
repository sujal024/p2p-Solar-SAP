using ProjectService as service from '../../srv/project-service';

// ═══════════════════════════════════════════════════════════════
// PROJECT LIST REPORT — UI Annotations
// ═══════════════════════════════════════════════════════════════

// ── LIST PAGE ─────────────────────────────────────────────────

annotate service.Projects with @(

  UI.SelectionFields: [
    status,
    state,
    projectManager_ID,
    startDate,
    endDate
  ],

  UI.LineItem: [
    {
      $Type      : 'UI.DataField',
      Value      : projectCode,
      Label      : 'Project Code',
      ![@UI.Importance]: #High
    },
    {
      $Type      : 'UI.DataField',
      Value      : projectName,
      Label      : 'Project Name',
      ![@UI.Importance]: #High
    },
    {
      $Type      : 'UI.DataField',
      Value      : clientName,
      Label      : 'Client',
      ![@UI.Importance]: #Medium
    },
    {
      $Type      : 'UI.DataField',
      Value      : location,
      Label      : 'Location',
      ![@UI.Importance]: #Medium
    },
    {
      $Type      : 'UI.DataField',
      Value      : state,
      Label      : 'State',
      ![@UI.Importance]: #Low
    },
    {
      $Type      : 'UI.DataField',
      Value      : capacityKWp,
      Label      : 'Capacity (kWp)',
      ![@UI.Importance]: #Medium
    },
    {
      $Type      : 'UI.DataField',
      Value      : budget,
      Label      : 'Budget (INR)',
      ![@UI.Importance]: #High
    },
    {
      $Type      : 'UI.DataField',
      Value      : startDate,
      Label      : 'Start Date',
      ![@UI.Importance]: #Medium
    },
    {
      $Type             : 'UI.DataFieldForAnnotation',
      Target            : '@UI.DataPoint#BudgetProgress',
      Label             : 'Budget Utilization',
      ![@UI.Importance] : #High
    },
    {
      $Type            : 'UI.DataField',
      Value            : status,
      Label            : 'Status',
      ![@UI.Importance]: #High
    }
  ],

  // ── KPI HEADER DATA POINTS ────────────────────────────────────
  UI.DataPoint#Budget: {
    Value        : budget,
    Title        : 'Total Budget',
    ValueFormat  : { NumberOfFractionalDigits: 0 }
  },

  UI.DataPoint#Spent: {
    Value        : spentAmount,
    Title        : 'Spent Amount',
    ValueFormat  : { NumberOfFractionalDigits: 0 }
  },

  UI.DataPoint#Capacity: {
    Value  : capacityKWp,
    Title  : 'Capacity (kWp)'
  },

  UI.DataPoint#BudgetProgress: {
    Value       : spentAmount,
    Title       : 'Budget Used',
    TargetValue : budget,
    Visualization: #Progress,
    Criticality  : criticality
  }
);

// ═══════════════════════════════════════════════════════════════
// PROJECT OBJECT PAGE — UI Annotations
// ═══════════════════════════════════════════════════════════════

annotate service.Projects with @(

  UI.HeaderInfo: {
    TypeName       : 'Project',
    TypeNamePlural : 'Projects',
    Title          : {
      $Type : 'UI.DataField',
      Value : projectName
    },
    Description: {
      $Type : 'UI.DataField',
      Value : projectCode
    },
    ImageUrl: ''
  },

  UI.HeaderFacets: [
    {
      $Type  : 'UI.ReferenceFacet',
      Target : '@UI.DataPoint#Budget',
      Label  : 'Budget'
    },
    {
      $Type  : 'UI.ReferenceFacet',
      Target : '@UI.DataPoint#Spent',
      Label  : 'Spent'
    },
    {
      $Type  : 'UI.ReferenceFacet',
      Target : '@UI.DataPoint#Capacity',
      Label  : 'Capacity'
    },
    {
      $Type  : 'UI.ReferenceFacet',
      Target : '@UI.DataPoint#BudgetProgress',
      Label  : 'Budget Utilization'
    }
  ],

  // ── OBJECT PAGE ACTIONS ──────────────────────────────────────
  UI.Identification: [
    {
      $Type  : 'UI.DataFieldForAction',
      Action : 'ProjectService.activateProject',
      Label  : 'Activate'
    },
    {
      $Type  : 'UI.DataFieldForAction',
      Action : 'ProjectService.putOnHold',
      Label  : 'Put On Hold'
    },
    {
      $Type  : 'UI.DataFieldForAction',
      Action : 'ProjectService.completeProject',
      Label  : 'Complete'
    },
    {
      $Type  : 'UI.DataFieldForAction',
      Action : 'ProjectService.cancelProject',
      Label  : 'Cancel'
    }
  ],

  // ── OBJECT PAGE SECTIONS ──────────────────────────────────────
  // Navigation-property tables (boqItems, materialRequests) must be top-level
  // ReferenceFacets — CollectionFacet wrappers block their rendering in FE v4.
  UI.Facets: [
    {
      $Type  : 'UI.CollectionFacet',
      ID     : 'GeneralInfo',
      Label  : 'General Information',
      Facets : [
        {
          $Type  : 'UI.ReferenceFacet',
          Target : '@UI.FieldGroup#ProjectDetails',
          Label  : 'Project Details'
        },
        {
          $Type  : 'UI.ReferenceFacet',
          Target : '@UI.FieldGroup#DatesAndBudget',
          Label  : 'Dates and Budget'
        }
      ]
    },
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'BOQSection',
      Target : 'boqItems/@UI.LineItem',
      Label  : 'Bill of Quantity'
    },
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'MRSection',
      Target : 'materialRequests/@UI.LineItem',
      Label  : 'Material Requests'
    }
  ],

  UI.FieldGroup#ProjectDetails: {
    Label : 'Project Details',
    Data  : [
      { $Type: 'UI.DataField', Value: projectCode,    Label: 'Project Code'     },
      { $Type: 'UI.DataField', Value: projectName,    Label: 'Project Name'     },
      { $Type: 'UI.DataField', Value: clientName,     Label: 'Client'           },
      { $Type: 'UI.DataField', Value: location,       Label: 'Location'         },
      { $Type: 'UI.DataField', Value: state,          Label: 'State'            },
      { $Type: 'UI.DataField', Value: capacityKWp,    Label: 'Capacity (kWp)'   },
      { $Type: 'UI.DataField', Value: projectManager_ID, Label: 'Project Manager'},
      { $Type: 'UI.DataField', Value: status,       Label: 'Status'           },
      { $Type: 'UI.DataField', Value: description, Label: 'Description'      }
    ]
  },

  UI.FieldGroup#DatesAndBudget: {
    Label : 'Dates and Budget',
    Data  : [
      { $Type: 'UI.DataField', Value: startDate,    Label: 'Start Date'    },
      { $Type: 'UI.DataField', Value: endDate,       Label: 'End Date'      },
      { $Type: 'UI.DataField', Value: currency,      Label: 'Currency'      },
      { $Type: 'UI.DataField', Value: budget,        Label: 'Total Budget'  },
      { $Type: 'UI.DataField', Value: spentAmount,   Label: 'Spent Amount'  }
    ]
  }
);

// ── FIELD-LEVEL ANNOTATIONS ────────────────────────────────────

annotate service.Projects with {
  projectCode  @title: 'Project Code'    @Common.FieldControl: #ReadOnly;
  projectName  @title: 'Project Name'    @mandatory;
  clientName   @title: 'Client Name'     @mandatory;
  location     @title: 'Site Location'   @mandatory;
  state        @title: 'State'           @mandatory;
  capacityKWp  @title: 'Capacity (kWp)'  @Measures.Unit: 'kWp';
  startDate    @title: 'Start Date'      @mandatory;
  endDate      @title: 'End Date';
  budget       @title: 'Budget'          @Measures.ISOCurrency: currency;
  spentAmount  @title: 'Spent Amount'    @Common.FieldControl: #ReadOnly  @Measures.ISOCurrency: currency;
  currency     @title: 'Currency';
  status       @title: 'Status'          @Common.FieldControl: #ReadOnly;
  description  @title: 'Description'     @UI.MultiLineText: true;
  projectManager @title: 'Project Manager'
    @Common.Text          : projectManager.userName
    @Common.TextArrangement: #TextOnly
    @Common.ValueList: {
      CollectionPath : 'Users',
      Parameters     : [
        { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: projectManager_ID, ValueListProperty: 'ID'       },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'userName'                                        },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'role'                                            }
      ]
    };
}

// ── ACTIVE PROJECTS — list + object page annotations ─────────
// Used by EngineeringProjectsList and SeniorProjectsList targets.
// Same columns as Projects but bound to the ActiveProjects entity.
annotate service.ActiveProjects with @(

  Capabilities: {
    UpdateRestrictions: { Updatable: true }
  },

  UI.SelectionFields: [ state, projectManager_ID, startDate, endDate ],

  UI.LineItem: [
    { $Type: 'UI.DataField', Value: projectCode,  Label: 'Project Code',    ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: projectName,  Label: 'Project Name',    ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: clientName,   Label: 'Client',          ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: location,     Label: 'Location',        ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: capacityKWp,  Label: 'Capacity (kWp)',  ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: budget,       Label: 'Budget (INR)',    ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: startDate,    Label: 'Start Date',      ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: status,       Label: 'Status',          ![@UI.Importance]: #High   }
  ],

  UI.HeaderInfo: {
    TypeName      : 'Project',
    TypeNamePlural: 'Projects',
    Title         : { $Type: 'UI.DataField', Value: projectName },
    Description   : { $Type: 'UI.DataField', Value: projectCode }
  },

  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#APBudget',   Label: 'Budget'            },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#APCapacity', Label: 'Capacity'          }
  ],

  UI.DataPoint#APBudget: {
    Value: budget,
    Title: 'Total Budget',
    ValueFormat: { NumberOfFractionalDigits: 0 }
  },

  UI.DataPoint#APCapacity: {
    Value: capacityKWp,
    Title: 'Capacity (kWp)'
  },

  UI.Facets: [
    {
      $Type : 'UI.CollectionFacet',
      ID    : 'GeneralInfo',
      Label : 'General Information',
      Facets: [
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#APProjectDetails', Label: 'Project Details'  },
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#APDatesAndBudget', Label: 'Dates and Budget' }
      ]
    },
    { $Type: 'UI.ReferenceFacet', ID: 'BOQSection', Target: 'boqItems/@UI.LineItem',         Label: 'Bill of Quantity'  },
    { $Type: 'UI.ReferenceFacet', ID: 'MRSection',  Target: 'materialRequests/@UI.LineItem', Label: 'Material Requests' }
  ],

  UI.FieldGroup#APProjectDetails: {
    Label: 'Project Details',
    Data : [
      { $Type: 'UI.DataField', Value: projectCode,        Label: 'Project Code'    },
      { $Type: 'UI.DataField', Value: projectName,        Label: 'Project Name'    },
      { $Type: 'UI.DataField', Value: clientName,         Label: 'Client'          },
      { $Type: 'UI.DataField', Value: location,           Label: 'Location'        },
      { $Type: 'UI.DataField', Value: state,              Label: 'State'           },
      { $Type: 'UI.DataField', Value: capacityKWp,        Label: 'Capacity (kWp)' },
      { $Type: 'UI.DataField', Value: projectManager_ID,  Label: 'Project Manager' },
      { $Type: 'UI.DataField', Value: status,             Label: 'Status'          },
      { $Type: 'UI.DataField', Value: description,        Label: 'Description'     }
    ]
  },

  UI.FieldGroup#APDatesAndBudget: {
    Label: 'Dates and Budget',
    Data : [
      { $Type: 'UI.DataField', Value: startDate,   Label: 'Start Date'   },
      { $Type: 'UI.DataField', Value: endDate,     Label: 'End Date'     },
      { $Type: 'UI.DataField', Value: currency,    Label: 'Currency'     },
      { $Type: 'UI.DataField', Value: budget,      Label: 'Total Budget' },
      { $Type: 'UI.DataField', Value: spentAmount, Label: 'Spent Amount' }
    ]
  }
);

// ── SENIOR ACTIVE PROJECTS — identical annotations ────────────
// Separate entity alias so SeniorProjectsList route pattern resolves.
annotate service.SeniorActiveProjects with @(

  UI.SelectionFields: [ state, projectManager_ID, startDate, endDate ],

  UI.LineItem: [
    { $Type: 'UI.DataField', Value: projectCode,  Label: 'Project Code',    ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: projectName,  Label: 'Project Name',    ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: clientName,   Label: 'Client',          ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: location,     Label: 'Location',        ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: capacityKWp,  Label: 'Capacity (kWp)',  ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: budget,       Label: 'Budget (INR)',    ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: startDate,    Label: 'Start Date',      ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: status,       Label: 'Status',          ![@UI.Importance]: #High   }
  ],

  UI.HeaderInfo: {
    TypeName      : 'Project',
    TypeNamePlural: 'Projects',
    Title         : { $Type: 'UI.DataField', Value: projectName },
    Description   : { $Type: 'UI.DataField', Value: projectCode }
  },

  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#SAPBudget',   Label: 'Budget'   },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#SAPCapacity', Label: 'Capacity' }
  ],

  UI.DataPoint#SAPBudget: {
    Value: budget,
    Title: 'Total Budget',
    ValueFormat: { NumberOfFractionalDigits: 0 }
  },

  UI.DataPoint#SAPCapacity: {
    Value: capacityKWp,
    Title: 'Capacity (kWp)'
  },

  UI.Facets: [
    {
      $Type : 'UI.CollectionFacet',
      ID    : 'GeneralInfo',
      Label : 'General Information',
      Facets: [
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#SAPProjectDetails', Label: 'Project Details'  },
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#SAPDatesAndBudget', Label: 'Dates and Budget' }
      ]
    },
    { $Type: 'UI.ReferenceFacet', ID: 'BOQSection', Target: 'boqItems/@UI.LineItem',         Label: 'Bill of Quantity'  },
    { $Type: 'UI.ReferenceFacet', ID: 'MRSection',  Target: 'materialRequests/@UI.LineItem', Label: 'Material Requests' }
  ],

  UI.FieldGroup#SAPProjectDetails: {
    Label: 'Project Details',
    Data : [
      { $Type: 'UI.DataField', Value: projectCode,       Label: 'Project Code'    },
      { $Type: 'UI.DataField', Value: projectName,       Label: 'Project Name'    },
      { $Type: 'UI.DataField', Value: clientName,        Label: 'Client'          },
      { $Type: 'UI.DataField', Value: location,          Label: 'Location'        },
      { $Type: 'UI.DataField', Value: state,             Label: 'State'           },
      { $Type: 'UI.DataField', Value: capacityKWp,       Label: 'Capacity (kWp)' },
      { $Type: 'UI.DataField', Value: projectManager_ID, Label: 'Project Manager' },
      { $Type: 'UI.DataField', Value: status,            Label: 'Status'          },
      { $Type: 'UI.DataField', Value: description,       Label: 'Description'     }
    ]
  },

  UI.FieldGroup#SAPDatesAndBudget: {
    Label: 'Dates and Budget',
    Data : [
      { $Type: 'UI.DataField', Value: startDate,   Label: 'Start Date'   },
      { $Type: 'UI.DataField', Value: endDate,     Label: 'End Date'     },
      { $Type: 'UI.DataField', Value: currency,    Label: 'Currency'     },
      { $Type: 'UI.DataField', Value: budget,      Label: 'Total Budget' },
      { $Type: 'UI.DataField', Value: spentAmount, Label: 'Spent Amount' }
    ]
  }
);

// ── ACTIVE PROJECTS — field-level read-only (header locked for engineers) ──
annotate service.ActiveProjects with {
  projectCode    @Common.FieldControl: #ReadOnly;
  projectName    @Common.FieldControl: #ReadOnly;
  clientName     @Common.FieldControl: #ReadOnly;
  location       @Common.FieldControl: #ReadOnly;
  state          @Common.FieldControl: #ReadOnly;
  capacityKWp    @Common.FieldControl: #ReadOnly;
  projectManager @Common.FieldControl: #ReadOnly;
  status         @Common.FieldControl: #ReadOnly;
  description    @Common.FieldControl: #ReadOnly;
  startDate      @Common.FieldControl: #ReadOnly;
  endDate        @Common.FieldControl: #ReadOnly;
  currency       @Common.FieldControl: #ReadOnly;
  
  boqItems @(
    Capabilities.InsertRestrictions: { Insertable: true },
    Capabilities.DeleteRestrictions: { Deletable: false },
    Capabilities.UpdateRestrictions: { Updatable: true }
  );
  materialRequests @(
    Capabilities.InsertRestrictions: { Insertable: true },
    Capabilities.DeleteRestrictions: { Deletable: false },
    Capabilities.UpdateRestrictions: { Updatable: true }
  );
  budget         @Common.FieldControl: #ReadOnly;
  spentAmount    @Common.FieldControl: #ReadOnly;
}

annotate service.SeniorActiveProjects with {
  projectCode    @Common.FieldControl: #ReadOnly;
  projectName    @Common.FieldControl: #ReadOnly;
  clientName     @Common.FieldControl: #ReadOnly;
  location       @Common.FieldControl: #ReadOnly;
  state          @Common.FieldControl: #ReadOnly;
  capacityKWp    @Common.FieldControl: #ReadOnly;
  projectManager @Common.FieldControl: #ReadOnly;
  status         @Common.FieldControl: #ReadOnly;
  description    @Common.FieldControl: #ReadOnly;
  startDate      @Common.FieldControl: #ReadOnly;
  endDate        @Common.FieldControl: #ReadOnly;
  currency       @Common.FieldControl: #ReadOnly;
  budget         @Common.FieldControl: #ReadOnly;
  spentAmount    @Common.FieldControl: #ReadOnly;
}

// ═══════════════════════════════════════════════════════════════
// APPROVED MATERIAL REQUESTS — Procurement View
// ═══════════════════════════════════════════════════════════════

annotate service.ApprovedMaterialRequests with @(

  UI.SelectionFields: [ status, project_ID, requiredDate ],

  UI.LineItem: [
    { $Type: 'UI.DataField', Value: requestNumber,   Label: 'MR Number'    },
    { $Type: 'UI.DataField', Value: project_ID,      Label: 'Project'      },
    { $Type: 'UI.DataField', Value: requestDate,     Label: 'Request Date' },
    { $Type: 'UI.DataField', Value: requiredDate,    Label: 'Required By'  },
    { $Type: 'UI.DataField', Value: status,          Label: 'Status'       },
    { $Type: 'UI.DataField', Value: approvedBy_ID,   Label: 'Approved By'  },
    { $Type: 'UI.DataField', Value: remarks,         Label: 'Remarks'      }
  ],

  UI.HeaderInfo: {
    TypeName      : 'Approved Material Request',
    TypeNamePlural: 'Approved Material Requests',
    Title         : { Value: requestNumber },
    Description   : { Value: project_ID }
  },

  UI.Facets: [
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Request Details',
      Target: '@UI.FieldGroup#MRHeader'
    },
    {
      $Type : 'UI.ReferenceFacet',
      Label : 'Requested Items',
      Target: 'items/@UI.LineItem'
    }
  ],

  UI.FieldGroup#MRHeader: {
    Label: 'Request Details',
    Data : [
      { Value: requestNumber   },
      { Value: project_ID      },
      { Value: requestDate     },
      { Value: requiredDate    },
      { Value: status          },
      { Value: approvedBy_ID   },
      { Value: approvalDate    },
      { Value: remarks         }
    ]
  }
);

annotate service.ApprovedMaterialRequestItems with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: material_ID,  Label: 'Material'      },
    { $Type: 'UI.DataField', Value: description,  Label: 'Description'   },
    { $Type: 'UI.DataField', Value: requestedQty, Label: 'Requested Qty' },
    { $Type: 'UI.DataField', Value: uom,          Label: 'UOM'           },
    { $Type: 'UI.DataField', Value: remarks,       Label: 'Remarks'      }
  ]
);

// ── STATUS DROPDOWN VALUE LIST ────────────────────────────────

annotate service.Projects with {
  status @Common.ValueListWithFixedValues: true
         @Common.ValueList: {
           CollectionPath: 'Projects',
           Parameters: [
             { $Type: 'Common.ValueListParameterOut', LocalDataProperty: status, ValueListProperty: 'status' }
           ]
         };
}

// ═══════════════════════════════════════════════════════════════
// BOQ ITEMS — List annotations (shown in object page section)
// ═══════════════════════════════════════════════════════════════

annotate service.BOQItems with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: lineNumber,    Label: '#'                },
    {
      $Type : 'UI.DataField',
      Value : material_ID,
      Label : 'Material',
      ![@UI.Importance]: #High
    },
    { $Type: 'UI.DataField', Value: description,   Label: 'Description'      },
    { $Type: 'UI.DataField', Value: uom,           Label: 'UOM'              },
    { $Type: 'UI.DataField', Value: plannedQty,    Label: 'Planned Qty'      },
    { $Type: 'UI.DataField', Value: estimatedRate, Label: 'Est. Rate (INR)'  },
    { $Type: 'UI.DataField', Value: estimatedValue,Label: 'Est. Value (INR)' },
    { $Type: 'UI.DataField', Value: requestedQty,  Label: 'Requested'        },
    { $Type: 'UI.DataField', Value: orderedQty,    Label: 'Ordered'          },
    { $Type: 'UI.DataField', Value: receivedQty,   Label: 'Received'         }
  ]
);

annotate service.ActiveProjects_BOQItems with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: lineNumber,    Label: '#'                },
    {
      $Type : 'UI.DataField',
      Value : material_ID,
      Label : 'Material',
      ![@UI.Importance]: #High
    },
    { $Type: 'UI.DataField', Value: description,   Label: 'Description'      },
    { $Type: 'UI.DataField', Value: uom,           Label: 'UOM'              },
    { $Type: 'UI.DataField', Value: plannedQty,    Label: 'Planned Qty'      },
    { $Type: 'UI.DataField', Value: estimatedRate, Label: 'Est. Rate (INR)'  },
    { $Type: 'UI.DataField', Value: estimatedValue,Label: 'Est. Value (INR)' },
    { $Type: 'UI.DataField', Value: requestedQty,  Label: 'Requested'        },
    { $Type: 'UI.DataField', Value: orderedQty,    Label: 'Ordered'          },
    { $Type: 'UI.DataField', Value: receivedQty,   Label: 'Received'         }
  ]
);

annotate service.SeniorActiveProjects_BOQItems with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: lineNumber,    Label: '#'                },
    {
      $Type : 'UI.DataField',
      Value : material_ID,
      Label : 'Material',
      ![@UI.Importance]: #High
    },
    { $Type: 'UI.DataField', Value: description,   Label: 'Description'      },
    { $Type: 'UI.DataField', Value: uom,           Label: 'UOM'              },
    { $Type: 'UI.DataField', Value: plannedQty,    Label: 'Planned Qty'      },
    { $Type: 'UI.DataField', Value: estimatedRate, Label: 'Est. Rate (INR)'  },
    { $Type: 'UI.DataField', Value: estimatedValue,Label: 'Est. Value (INR)' },
    { $Type: 'UI.DataField', Value: requestedQty,  Label: 'Requested'        },
    { $Type: 'UI.DataField', Value: orderedQty,    Label: 'Ordered'          },
    { $Type: 'UI.DataField', Value: receivedQty,   Label: 'Received'         }
  ]
);

annotate service.BOQItems with {
  material @title: 'Material'
    @Common.Text           : material.description
    @Common.TextArrangement: #TextFirst
    @Common.ValueList: {
      CollectionPath: 'MaterialMaster',
      Parameters: [
        { $Type: 'Common.ValueListParameterInOut',       LocalDataProperty: material_ID,  ValueListProperty: 'ID'          },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'materialCode'                                  },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                                   },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'uom'                                           }
      ]
    };
  plannedQty    @title: 'Planned Qty';
  estimatedRate @title: 'Estimated Rate';
  estimatedValue @title: 'Estimated Value' @Common.FieldControl: #ReadOnly;
  requestedQty  @title: 'Requested Qty'   @Common.FieldControl: #ReadOnly;
  orderedQty    @title: 'Ordered Qty'     @Common.FieldControl: #ReadOnly;
  receivedQty   @title: 'Received Qty'    @Common.FieldControl: #ReadOnly;
}

annotate service.ActiveProjects_BOQItems with {
  material @title: 'Material'
    @Common.Text           : material.description
    @Common.TextArrangement: #TextFirst
    @Common.ValueList: {
      CollectionPath: 'MaterialMaster',
      Parameters: [
        { $Type: 'Common.ValueListParameterInOut',       LocalDataProperty: material_ID,  ValueListProperty: 'ID'          },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'materialCode'                                  },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                                   },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'uom'                                           }
      ]
    };
  plannedQty    @title: 'Planned Qty';
  estimatedRate @title: 'Estimated Rate';
  estimatedValue @title: 'Estimated Value' @Common.FieldControl: #ReadOnly;
  requestedQty  @title: 'Requested Qty'   @Common.FieldControl: #ReadOnly;
  orderedQty    @title: 'Ordered Qty'     @Common.FieldControl: #ReadOnly;
  receivedQty   @title: 'Received Qty'    @Common.FieldControl: #ReadOnly;
}

annotate service.SeniorActiveProjects_BOQItems with {
  material @title: 'Material'
    @Common.Text           : material.description
    @Common.TextArrangement: #TextFirst
    @Common.ValueList: {
      CollectionPath: 'MaterialMaster',
      Parameters: [
        { $Type: 'Common.ValueListParameterInOut',       LocalDataProperty: material_ID,  ValueListProperty: 'ID'          },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'materialCode'                                  },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                                   },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'uom'                                           }
      ]
    };
  plannedQty    @title: 'Planned Qty';
  estimatedRate @title: 'Estimated Rate';
  estimatedValue @title: 'Estimated Value' @Common.FieldControl: #ReadOnly;
  requestedQty  @title: 'Requested Qty'   @Common.FieldControl: #ReadOnly;
  orderedQty    @title: 'Ordered Qty'     @Common.FieldControl: #ReadOnly;
  receivedQty   @title: 'Received Qty'    @Common.FieldControl: #ReadOnly;
}

// ═══════════════════════════════════════════════════════════════
// MATERIAL REQUESTS — List annotations (shown in object page)
// ═══════════════════════════════════════════════════════════════

annotate service.MaterialRequests with @(
  UI.SelectionFields: [
    status,
    requestDate,
    requiredDate,
    requestedBy_ID
  ],

  UI.SelectionVariant#PendingApproval: {
    SelectOptions: [
      {
        $Type: 'UI.SelectOptionType',
        PropertyName: status,
        Ranges: [
          {
            $Type: 'UI.SelectionRangeType',
            Sign: #I,
            Option: #EQ,
            Low: 'SUBMITTED'
          }
        ]
      }
    ]
  },

  UI.HeaderInfo: {
    TypeName: 'Material Request',
    TypeNamePlural: 'Material Requests',
    Title: {
      $Type: 'UI.DataField',
      Value: requestNumber
    },
    Description: {
      $Type: 'UI.DataField',
      Value: status
    }
  },

  UI.LineItem: [
    { $Type: 'UI.DataField', Value: requestNumber, Label: 'Request No.',  ![@UI.Importance]: #High  },
    { $Type: 'UI.DataField', Value: requestDate,   Label: 'Raised On',   ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: requiredDate,  Label: 'Required By', ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: requestedBy_ID,Label: 'Raised By',   ![@UI.Importance]: #Medium },
    {
      $Type            : 'UI.DataField',
      Value            : status,
      Label            : 'Status',
      ![@UI.Importance]: #High
    },
    { $Type: 'UI.DataField', Value: remarks,        Label: 'Remarks',    ![@UI.Importance]: #Low    }
  ],

  UI.Identification: [
    {
      $Type  : 'UI.DataFieldForAction',
      Action : 'ProjectService.submitRequest',
      Label  : 'Submit'
    },
    {
      $Type  : 'UI.DataFieldForAction',
      Action : 'ProjectService.approveRequest',
      Label  : 'Approve'
    },
    {
      $Type  : 'UI.DataFieldForAction',
      Action : 'ProjectService.rejectRequest',
      Label  : 'Reject'
    }
  ],

  UI.Facets: [
    {
      $Type: 'UI.ReferenceFacet',
      ID: 'MRGeneralInfo',
      Target: '@UI.FieldGroup#MRGeneralInfo',
      Label: 'General Information'
    },
    {
      $Type: 'UI.ReferenceFacet',
      ID: 'MRItems',
      Target: 'items/@UI.LineItem',
      Label: 'Items'
    }
  ],

  UI.FieldGroup#MRGeneralInfo: {
    Label: 'General Information',
    Data: [
      { $Type: 'UI.DataField', Value: requestNumber, Label: 'Request Number' },
      { $Type: 'UI.DataField', Value: requestDate, Label: 'Request Date' },
      { $Type: 'UI.DataField', Value: requiredDate, Label: 'Required By' },
      { $Type: 'UI.DataField', Value: status, Label: 'Status' },
      { $Type: 'UI.DataField', Value: requestedBy_ID, Label: 'Requested By' },
      { $Type: 'UI.DataField', Value: approvedBy_ID, Label: 'Approved By' },
      { $Type: 'UI.DataField', Value: remarks, Label: 'Remarks' },
      { $Type: 'UI.DataField', Value: rejectionReason, Label: 'Rejection Reason' }
    ]
  }
);

annotate service.ActiveProjects_MaterialRequests with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: requestNumber, Label: 'Request No.',  ![@UI.Importance]: #High  },
    { $Type: 'UI.DataField', Value: requestDate,   Label: 'Raised On',   ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: requiredDate,  Label: 'Required By', ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: requestedBy_ID,Label: 'Raised By',   ![@UI.Importance]: #Medium },
    {
      $Type            : 'UI.DataField',
      Value            : status,
      Label            : 'Status',
      ![@UI.Importance]: #High
    },
    { $Type: 'UI.DataField', Value: remarks, Label: 'Remarks', ![@UI.Importance]: #Low }
  ],

  // Object-page annotations for EngineerMRObjectPage
  UI.HeaderInfo: {
    TypeName       : 'Material Request',
    TypeNamePlural : 'Material Requests',
    Title          : { $Type: 'UI.DataField', Value: requestNumber },
    Description    : { $Type: 'UI.DataField', Value: status }
  },

  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.submitRequest', Label: 'Submit' }
  ],

  UI.Facets: [
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'APMRGeneralInfo',
      Target : '@UI.FieldGroup#APMRGeneralInfo',
      Label  : 'General Information'
    },
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'APMRItems',
      Target : 'items/@UI.LineItem',
      Label  : 'Items'
    }
  ],

  UI.FieldGroup#APMRGeneralInfo: {
    Label: 'General Information',
    Data: [
      { $Type: 'UI.DataField', Value: requestNumber,  Label: 'Request Number' },
      { $Type: 'UI.DataField', Value: requestDate,    Label: 'Request Date'   },
      { $Type: 'UI.DataField', Value: requiredDate,   Label: 'Required By'   },
      { $Type: 'UI.DataField', Value: status,         Label: 'Status'        },
      { $Type: 'UI.DataField', Value: requestedBy_ID, Label: 'Requested By'  },
      { $Type: 'UI.DataField', Value: approvedBy_ID,  Label: 'Approved By'   },
      { $Type: 'UI.DataField', Value: remarks,        Label: 'Remarks'       }
    ]
  }
);

annotate service.SeniorActiveProjects_MaterialRequests with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: requestNumber, Label: 'Request No.',  ![@UI.Importance]: #High  },
    { $Type: 'UI.DataField', Value: requestDate,   Label: 'Raised On',   ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: requiredDate,  Label: 'Required By', ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: requestedBy_ID,Label: 'Raised By',   ![@UI.Importance]: #Medium },
    {
      $Type            : 'UI.DataField',
      Value            : status,
      Label            : 'Status',
      ![@UI.Importance]: #High
    },
    { $Type: 'UI.DataField', Value: remarks, Label: 'Remarks', ![@UI.Importance]: #Low }
  ],

  // Object-page annotations for SeniorMRObjectPage
  UI.HeaderInfo: {
    TypeName       : 'Material Request',
    TypeNamePlural : 'Material Requests',
    Title          : { $Type: 'UI.DataField', Value: requestNumber },
    Description    : { $Type: 'UI.DataField', Value: status }
  },

  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.approveRequest', Label: 'Approve' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.rejectRequest',  Label: 'Reject'  }
  ],

  UI.Facets: [
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'SAPMRGeneralInfo',
      Target : '@UI.FieldGroup#SAPMRGeneralInfo',
      Label  : 'General Information'
    },
    {
      $Type  : 'UI.ReferenceFacet',
      ID     : 'SAPMRItems',
      Target : 'items/@UI.LineItem',
      Label  : 'Items'
    }
  ],

  UI.FieldGroup#SAPMRGeneralInfo: {
    Label: 'General Information',
    Data: [
      { $Type: 'UI.DataField', Value: requestNumber,  Label: 'Request Number' },
      { $Type: 'UI.DataField', Value: requestDate,    Label: 'Request Date'   },
      { $Type: 'UI.DataField', Value: requiredDate,   Label: 'Required By'   },
      { $Type: 'UI.DataField', Value: status,         Label: 'Status'        },
      { $Type: 'UI.DataField', Value: requestedBy_ID, Label: 'Requested By'  },
      { $Type: 'UI.DataField', Value: approvedBy_ID,  Label: 'Approved By'   },
      { $Type: 'UI.DataField', Value: approvalDate,   Label: 'Approval Date' },
      { $Type: 'UI.DataField', Value: remarks,        Label: 'Remarks'       }
    ]
  }
);

annotate service.MaterialRequests with {
  requestNumber  @title: 'Request Number'   @Common.FieldControl: #ReadOnly;
  requestDate    @title: 'Request Date';
  requiredDate   @title: 'Required By'      @mandatory;
  status         @title: 'Status'           @Common.FieldControl: #ReadOnly;
  remarks        @title: 'Remarks'          @UI.MultiLineText: true;
  requestedBy    @title: 'Requested By'
    @Common.Text           : requestedBy.userName
    @Common.TextArrangement: #TextOnly;
  approvedBy     @title: 'Approved By'
    @Common.Text           : approvedBy.userName
    @Common.TextArrangement: #TextOnly;
}

annotate service.ActiveProjects_MaterialRequests with {
  requestNumber  @title: 'Request Number'   @Common.FieldControl: #ReadOnly;
  requestDate    @title: 'Request Date';
  requiredDate   @title: 'Required By';
  status         @title: 'Status'           @Common.FieldControl: #ReadOnly;
  remarks        @title: 'Remarks'          @UI.MultiLineText: true;
  requestedBy    @title: 'Requested By'
    @Common.Text           : requestedBy.userName
    @Common.TextArrangement: #TextOnly;
  approvedBy     @title: 'Approved By'
    @Common.Text           : approvedBy.userName
    @Common.TextArrangement: #TextOnly;
}

annotate service.SeniorActiveProjects_MaterialRequests with {
  requestNumber  @title: 'Request Number'   @Common.FieldControl: #ReadOnly;
  requestDate    @title: 'Request Date';
  requiredDate   @title: 'Required By';
  status         @title: 'Status'           @Common.FieldControl: #ReadOnly;
  remarks        @title: 'Remarks'          @UI.MultiLineText: true;
  requestedBy    @title: 'Requested By'
    @Common.Text           : requestedBy.userName
    @Common.TextArrangement: #TextOnly;
  approvedBy     @title: 'Approved By'
    @Common.Text           : approvedBy.userName
    @Common.TextArrangement: #TextOnly;
}

// ═══════════════════════════════════════════════════════════════
// MATERIAL REQUEST ITEMS — inline table in MR detail
// ═══════════════════════════════════════════════════════════════

annotate service.MaterialRequestItems with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: lineNumber,   Label: '#'           },
    { $Type: 'UI.DataField', Value: material_ID,  Label: 'Material'    },
    { $Type: 'UI.DataField', Value: description,  Label: 'Description' },
    { $Type: 'UI.DataField', Value: requestedQty, Label: 'Qty'         },
    { $Type: 'UI.DataField', Value: uom,          Label: 'UOM'         },
    { $Type: 'UI.DataField', Value: remarks,      Label: 'Remarks'     }
  ]
);

annotate service.ActiveProjects_MaterialRequestItems with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: lineNumber,   Label: '#'           },
    { $Type: 'UI.DataField', Value: material_ID,  Label: 'Material'    },
    { $Type: 'UI.DataField', Value: description,  Label: 'Description' },
    { $Type: 'UI.DataField', Value: requestedQty, Label: 'Qty'         },
    { $Type: 'UI.DataField', Value: uom,          Label: 'UOM'         },
    { $Type: 'UI.DataField', Value: remarks,      Label: 'Remarks'     }
  ]
);

annotate service.SeniorActiveProjects_MaterialRequestItems with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: lineNumber,   Label: '#'           },
    { $Type: 'UI.DataField', Value: material_ID,  Label: 'Material'    },
    { $Type: 'UI.DataField', Value: description,  Label: 'Description' },
    { $Type: 'UI.DataField', Value: requestedQty, Label: 'Qty'         },
    { $Type: 'UI.DataField', Value: uom,          Label: 'UOM'         },
    { $Type: 'UI.DataField', Value: remarks,      Label: 'Remarks'     }
  ]
);

annotate service.MaterialRequestItems with {
  material @title: 'Material'
    @Common.Text           : material.description
    @Common.TextArrangement: #TextFirst
    @Common.ValueList: {
      CollectionPath: 'MaterialMaster',
      Parameters: [
        { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: material_ID,  ValueListProperty: 'ID'          },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'materialCode'                                  },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                                   },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'uom'                                           }
      ]
    };
  requestedQty @title: 'Requested Qty' @mandatory;
  uom          @title: 'UOM'           @mandatory;
}

annotate service.ActiveProjects_MaterialRequestItems with {
  material @title: 'Material'
    @Common.Text           : material.description
    @Common.TextArrangement: #TextFirst
    @Common.ValueList: {
      CollectionPath: 'MaterialMaster',
      Parameters: [
        { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: material_ID,  ValueListProperty: 'ID'          },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'materialCode'                                  },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                                   },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'uom'                                           }
      ]
    };
  requestedQty @title: 'Requested Qty' @mandatory;
  uom          @title: 'UOM'           @mandatory;
}

annotate service.SeniorActiveProjects_MaterialRequestItems with {
  material @title: 'Material'
    @Common.Text           : material.description
    @Common.TextArrangement: #TextFirst
    @Common.ValueList: {
      CollectionPath: 'MaterialMaster',
      Parameters: [
        { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: material_ID,  ValueListProperty: 'ID'          },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'materialCode'                                  },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'description'                                   },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'uom'                                           }
      ]
    };
  requestedQty @title: 'Requested Qty' @mandatory;
  uom          @title: 'UOM'           @mandatory;
}

// ═══════════════════════════════════════════════════════════════
// VENDOR MASTER — List + Object Page annotations
// ═══════════════════════════════════════════════════════════════

using VendorService from '../../srv/vendor-service';

annotate VendorService.VendorMaster with @(
  UI.LineItem: [
    { Value: vendorCode,       Label: 'Vendor Code',       ![@UI.Importance]: #High   },
    { Value: vendorName,       Label: 'Vendor Name',       ![@UI.Importance]: #High   },
    { Value: city,             Label: 'City',              ![@UI.Importance]: #High   },
    { Value: state,            Label: 'State',             ![@UI.Importance]: #High   },
    { Value: contactPerson,    Label: 'Contact Person',    ![@UI.Importance]: #Medium },
    { Value: phone,            Label: 'Phone',             ![@UI.Importance]: #Medium },
    { Value: email,            Label: 'Email',             ![@UI.Importance]: #Medium },
    { Value: performanceScore, Label: 'Performance Score', ![@UI.Importance]: #High   },
    { Value: totalOrders,      Label: 'Total Orders',      ![@UI.Importance]: #Medium },
    { Value: isActive,         Label: 'Active',            ![@UI.Importance]: #High   }
  ],
  UI.SelectionFields: [ isActive, state, city ],
  UI.HeaderInfo: {
    TypeName      : 'Vendor Profile',
    TypeNamePlural: 'Vendor Directory',
    Title         : { Value: vendorName },
    Description   : { Value: vendorCode }
  },
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'VendorService.deactivateVendor', Label: 'Deactivate' },
    { $Type: 'UI.DataFieldForAction', Action: 'VendorService.activateVendor',   Label: 'Activate'   }
  ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'General Details',     Target: '@UI.FieldGroup#VendorGeneral' },
    { $Type: 'UI.ReferenceFacet', Label: 'Bank & Payment',      Target: '@UI.FieldGroup#VendorBanking' },
    { $Type: 'UI.ReferenceFacet', Label: 'Performance Metrics', Target: '@UI.FieldGroup#VendorPerf'    }
  ],
  UI.FieldGroup#VendorGeneral: {
    Label: 'General Details',
    Data : [
      { Value: vendorCode }, { Value: vendorName }, { Value: gstin },
      { Value: pan        }, { Value: address    }, { Value: city  },
      { Value: state      }, { Value: pincode    }, { Value: contactPerson },
      { Value: email      }, { Value: phone      }, { Value: paymentTerms  },
      { Value: isActive   }
    ]
  },
  UI.FieldGroup#VendorBanking: {
    Label: 'Bank & Payment',
    Data : [ { Value: bankAccount }, { Value: bankIFSC }, { Value: paymentTerms } ]
  },
  UI.FieldGroup#VendorPerf: {
    Label: 'Performance',
    Data : [
      { Value: performanceScore }, { Value: totalOrders },
      { Value: onTimeDeliveries }, { Value: qualityScore }
    ]
  }
);

annotate VendorService.VendorMaster with {
  vendorCode       @title: 'Vendor Code'        @mandatory;
  vendorName       @title: 'Vendor Name'        @mandatory;
  gstin            @title: 'GSTIN';
  pan              @title: 'PAN';
  address          @title: 'Address';
  city             @title: 'City';
  state            @title: 'State';
  pincode          @title: 'Pincode';
  contactPerson    @title: 'Contact Person';
  email            @title: 'Email';
  phone            @title: 'Phone';
  bankAccount      @title: 'Bank Account';
  bankIFSC         @title: 'Bank IFSC';
  paymentTerms     @title: 'Payment Terms';
  isActive         @title: 'Active';
  performanceScore @title: 'Performance Score' @Common.FieldControl: #ReadOnly;
  totalOrders      @title: 'Total Orders'      @Common.FieldControl: #ReadOnly;
  onTimeDeliveries @title: 'On-Time Deliveries'@Common.FieldControl: #ReadOnly;
  qualityScore     @title: 'Quality Score'     @Common.FieldControl: #ReadOnly;
}

// ═══════════════════════════════════════════════════════════════
// INVOICES — List + Object Page annotations
// ═══════════════════════════════════════════════════════════════

annotate service.Invoices with @(
  UI.LineItem: [
    { Value: invoiceNumber,    Label: 'Invoice No.'    },
    { Value: vendorInvoiceNo,  Label: 'Vendor Invoice' },
    { Value: vendor_ID,        Label: 'Vendor'         },
    { Value: purchaseOrder_ID, Label: 'PO Number'      },
    { Value: invoiceDate,      Label: 'Invoice Date'   },
    { Value: dueDate,          Label: 'Due Date'       },
    { Value: totalAmount,      Label: 'Total Amount'   },
    { Value: status,           Label: 'Status'         },
    { Value: paymentDate,      Label: 'Payment Date'   }
  ],
  UI.SelectionFields: [ status, vendor_ID, purchaseOrder_ID, invoiceDate ],
  UI.HeaderInfo: {
    TypeName      : 'Invoice',
    TypeNamePlural: 'Invoices',
    Title         : { Value: invoiceNumber },
    Description   : { Value: vendor_ID }
  },
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.submitInvoice',        Label: 'Submit'       },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.performThreeWayMatch', Label: '3-Way Match'  },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.approveInvoice',       Label: 'Approve'      },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.rejectInvoice',        Label: 'Reject'       },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.markPaid',             Label: 'Mark as Paid' }
  ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Invoice Header',          Target: '@UI.FieldGroup#InvHeader'     },
    { $Type: 'UI.ReferenceFacet', Label: 'Financial Summary',       Target: '@UI.FieldGroup#InvFinancials' },
    { $Type: 'UI.ReferenceFacet', Label: 'Approval Details',        Target: '@UI.FieldGroup#InvApproval'   },
    { $Type: 'UI.ReferenceFacet', Label: 'Invoice Line Items',      Target: 'items/@UI.LineItem'           },
    { $Type: 'UI.ReferenceFacet', Label: 'Three-Way Match Results', Target: 'threeWayMatches/@UI.LineItem' }
  ],
  UI.FieldGroup#InvHeader: {
    Label: 'Invoice Header',
    Data : [
      { Value: invoiceNumber    }, { Value: vendorInvoiceNo  }, { Value: vendor_ID        },
      { Value: purchaseOrder_ID }, { Value: receipt_ID       }, { Value: invoiceDate      },
      { Value: dueDate          }, { Value: status           }, { Value: remarks          },
      { Value: rejectionReason  }
    ]
  },
  UI.FieldGroup#InvFinancials: {
    Label: 'Financial Summary',
    Data : [ { Value: currency }, { Value: subtotal }, { Value: taxAmount }, { Value: totalAmount } ]
  },
  UI.FieldGroup#InvApproval: {
    Label: 'Approval Details',
    Data : [
      { Value: submittedBy_ID }, { Value: reviewedBy_ID  }, { Value: approvedBy_ID   },
      { Value: approvalDate   }, { Value: paymentDate    }, { Value: paymentReference }
    ]
  }
);

annotate service.InvoiceItems with @(
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

annotate service.ThreeWayMatchResults with @(
  UI.LineItem: [
    { Value: material_ID,      Label: 'Material'       },
    { Value: poQty,            Label: 'PO Qty'         },
    { Value: receivedQty,      Label: 'Received Qty'   },
    { Value: invoicedQty,      Label: 'Invoiced Qty'   },
    { Value: poUnitPrice,      Label: 'PO Price'       },
    { Value: invoiceUnitPrice, Label: 'Invoice Price'  },
    { Value: quantityMatch,    Label: 'Qty Match'      },
    { Value: priceMatch,       Label: 'Price Match'    },
    { Value: overallStatus,    Label: 'Overall Status' },
    { Value: qtyVariance,      Label: 'Qty Variance'   },
    { Value: valueVariance,    Label: 'Value Variance' }
  ]
);

// ═══════════════════════════════════════════════════════════════
// DELIVERIES — ABAP SEGW Proxy (ZSolarDeliverySet)
// Fields: DeliveryNumber(key), PoNumber, VendorId, ProjectCode,
//         Status, ScheduledDate, ActualDate, DelayDays, DelayReason,
//         VehicleNumber, DriverName, DriverPhone, EwayBill, CreatedAt
// ═══════════════════════════════════════════════════════════════

annotate service.Deliveries with @(

  Capabilities: {
    InsertRestrictions: { Insertable: true },
    UpdateRestrictions: { Updatable: true },
    DeleteRestrictions: { Deletable: true }
  },

  UI.SelectionFields: [ Status, PoNumber, VendorId ],

  UI.LineItem: [
    { $Type: 'UI.DataField', Value: DeliveryNumber, Label: 'Delivery No.',     ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: PoNumber,       Label: 'PO Number',        ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: VendorId,       Label: 'Vendor',           ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: ProjectCode,    Label: 'Project',          ![@UI.Importance]: #Low    },
    { $Type: 'UI.DataField', Value: ScheduledDate,  Label: 'Scheduled Date',   ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: ActualDate,     Label: 'Actual Date',      ![@UI.Importance]: #Low    },
    { $Type: 'UI.DataField', Value: Status,         Label: 'Status',           Criticality: Criticality, ![@UI.Importance]: #High },
    { $Type: 'UI.DataField', Value: DelayDays,      Label: 'Delay (Days)',     ![@UI.Importance]: #Low    },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.markInTransit', Label: 'Mark In Transit', Inline: false, ![@UI.Importance]: #High },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.markDelivered', Label: 'Mark Delivered',  Inline: false, ![@UI.Importance]: #High },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.markDelayed',   Label: 'Mark Delayed',   Inline: false, ![@UI.Importance]: #High }
  ],

  UI.HeaderInfo: {
    TypeName      : 'Delivery',
    TypeNamePlural: 'Deliveries',
    Title         : { $Type: 'UI.DataField', Value: DeliveryNumber },
    Description   : { $Type: 'UI.DataField', Value: VendorId }
  },

  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Status',   ID: 'HdrStatus'   },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#DelayDays', ID: 'HdrDelay'  }
  ],

  UI.DataPoint#Status: {
    Title      : 'Status',
    Value      : Status,
    Criticality: Criticality
  },

  UI.DataPoint#DelayDays: {
    Title: 'Delay (Days)',
    Value: DelayDays
  },

  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.markInTransit', Label: 'Mark In Transit' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.markDelivered', Label: 'Mark Delivered'  },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.markDelayed',   Label: 'Mark Delayed'    }
  ],

  UI.Facets: [
    {
      $Type : 'UI.CollectionFacet',
      ID    : 'DeliveryMain',
      Label : 'Delivery Details',
      Facets: [
        { $Type: 'UI.ReferenceFacet', ID: 'DeliveryInfo', Label: 'Shipment Info',  Target: '@UI.FieldGroup#DeliveryInfo' },
        { $Type: 'UI.ReferenceFacet', ID: 'LogisticsInfo',Label: 'Logistics',      Target: '@UI.FieldGroup#LogisticsInfo' }
      ]
    }
  ],

  UI.FieldGroup#DeliveryInfo: {
    Label: 'Shipment Information',
    Data : [
      { $Type: 'UI.DataField', Value: DeliveryNumber },
      { $Type: 'UI.DataField', Value: PoNumber       },
      { $Type: 'UI.DataField', Value: VendorId       },
      { $Type: 'UI.DataField', Value: ProjectCode    },
      { $Type: 'UI.DataField', Value: Status         },
      { $Type: 'UI.DataField', Value: ScheduledDate  },
      { $Type: 'UI.DataField', Value: ActualDate     },
      { $Type: 'UI.DataField', Value: DelayDays      },
      { $Type: 'UI.DataField', Value: DelayReason    }
    ]
  },

  UI.FieldGroup#LogisticsInfo: {
    Label: 'Logistics & Tracking',
    Data : [
      { $Type: 'UI.DataField', Value: VehicleNumber },
      { $Type: 'UI.DataField', Value: DriverName    },
      { $Type: 'UI.DataField', Value: DriverPhone   },
      { $Type: 'UI.DataField', Value: EwayBill      },
      { $Type: 'UI.DataField', Value: CreatedAt     }
    ]
  }

);

annotate service.Deliveries with {
  DeliveryNumber @title: 'Delivery Number'  @Core.Immutable: true;
  PoNumber       @title: 'PO Number';
  VendorId       @title: 'Vendor ID';
  ProjectCode    @title: 'Project Code';
  Status         @title: 'Status';
  ScheduledDate  @title: 'Scheduled Date';
  ActualDate     @title: 'Actual Date';
  DelayDays      @title: 'Delay (Days)';
  DelayReason    @title: 'Delay Reason';
  VehicleNumber  @title: 'Vehicle Number';
  DriverName     @title: 'Driver Name';
  DriverPhone    @title: 'Driver Phone';
  EwayBill       @title: 'E-Way Bill';
  CreatedAt      @title: 'Created On'     @Core.Computed: true;
};


// NOTE: ProcurementService.PurchaseOrders and PurchaseOrderItems annotations
// are maintained in srv/procurement-service.cds — do NOT duplicate here.
// The 'Delivery Schedule' facet on PO Object Page was removed because
// PurchaseOrders.deliveries navigation is excluded (Deliveries is now a flat SEGW proxy).


// ═══════════════════════════════════════════════════════════════
// ProjectService — VendorMaster & PurchaseOrders annotations
// FE v4 ListReport/ObjectPage always bind to the default model
// (ProjectService). These mirror the VendorService/Procurement
// annotations so the same UI metadata is available via /project/.
// ═══════════════════════════════════════════════════════════════

annotate service.VendorMaster with @(
  UI.LineItem: [
    { Value: vendorCode,       Label: 'Vendor Code'       },
    { Value: vendorName,       Label: 'Vendor Name'       },
    { Value: gstin,            Label: 'GSTIN'             },
    { Value: city,             Label: 'City'              },
    { Value: state,            Label: 'State'             },
    { Value: contactPerson,    Label: 'Contact Person'    },
    { Value: phone,            Label: 'Phone'             },
    { Value: performanceScore, Label: 'Performance Score' },
    { Value: isActive,         Label: 'Active'            }
  ],
  UI.SelectionFields: [ isActive, state, city ],
  UI.HeaderInfo: {
    TypeName      : 'Vendor',
    TypeNamePlural: 'Vendors',
    Title         : { Value: vendorName },
    Description   : { Value: vendorCode }
  },
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.deactivateVendor', Label: 'Deactivate' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.activateVendor',   Label: 'Activate'   }
  ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'General Details',     Target: '@UI.FieldGroup#VMGeneral' },
    { $Type: 'UI.ReferenceFacet', Label: 'Bank & Payment',      Target: '@UI.FieldGroup#VMBanking' },
    { $Type: 'UI.ReferenceFacet', Label: 'Performance Metrics', Target: '@UI.FieldGroup#VMPerf'    }
  ],
  UI.FieldGroup#VMGeneral: {
    Label: 'General Details',
    Data : [
      { Value: vendorCode }, { Value: vendorName }, { Value: gstin },
      { Value: pan        }, { Value: address    }, { Value: city  },
      { Value: state      }, { Value: pincode    }, { Value: contactPerson },
      { Value: email      }, { Value: phone      }, { Value: paymentTerms  },
      { Value: isActive   }
    ]
  },
  UI.FieldGroup#VMBanking: {
    Label: 'Bank & Payment',
    Data : [ { Value: bankAccount }, { Value: bankIFSC }, { Value: paymentTerms } ]
  },
  UI.FieldGroup#VMPerf: {
    Label: 'Performance',
    Data : [
      { Value: performanceScore }, { Value: totalOrders },
      { Value: onTimeDeliveries }, { Value: qualityScore }
    ]
  }
);

annotate service.VendorMaster with {
  vendorCode       @title: 'Vendor Code'     @mandatory;
  vendorName       @title: 'Vendor Name'     @mandatory;
  gstin            @title: 'GSTIN';
  pan              @title: 'PAN';
  address          @title: 'Address';
  city             @title: 'City';
  state            @title: 'State';
  pincode          @title: 'Pincode';
  contactPerson    @title: 'Contact Person';
  email            @title: 'Email';
  phone            @title: 'Phone';
  bankAccount      @title: 'Bank Account';
  bankIFSC         @title: 'Bank IFSC';
  paymentTerms     @title: 'Payment Terms';
  performanceScore @title: 'Performance Score';
  totalOrders      @title: 'Total Orders';
  onTimeDeliveries @title: 'On-Time Deliveries';
  qualityScore     @title: 'Quality Score';
  isActive         @title: 'Active';
};

annotate service.PurchaseOrders with @(
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.confirmPO', Label: 'Confirm PO' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.cancelPO',  Label: 'Cancel PO'  },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.closePO',   Label: 'Close PO'   }
  ],
  UI.HeaderInfo: {
    TypeName      : 'Purchase Order',
    TypeNamePlural: 'Purchase Orders',
    Title         : { $Type: 'UI.DataField', Value: poNumber },
    Description   : { $Type: 'UI.DataField', Value: status  }
  },
  UI.SelectionFields: [ status, vendor_ID, poDate ],
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: poNumber,     Label: 'PO Number'     },
    { $Type: 'UI.DataField', Value: vendor_ID,    Label: 'Vendor'        },
    { $Type: 'UI.DataField', Value: poDate,       Label: 'PO Date'       },
    { $Type: 'UI.DataField', Value: deliveryDate, Label: 'Delivery Date' },
    { $Type: 'UI.DataField', Value: grandTotal,   Label: 'Total Amount'  },
    { $Type: 'UI.DataField', Value: status,       Label: 'Status'        }
  ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'PO Details',        Target: '@UI.FieldGroup#PODets'   },
    { $Type: 'UI.ReferenceFacet', Label: 'Line Items',         Target: 'items/@UI.LineItem'      },
    { $Type: 'UI.ReferenceFacet', Label: 'Delivery Schedule',  Target: 'deliveries/@UI.LineItem' }
  ],
  UI.FieldGroup#PODets: {
    Data: [
      { $Type: 'UI.DataField', Value: poNumber     },
      { $Type: 'UI.DataField', Value: vendor_ID    },
      { $Type: 'UI.DataField', Value: project_ID   },
      { $Type: 'UI.DataField', Value: poDate       },
      { $Type: 'UI.DataField', Value: deliveryDate },
      { $Type: 'UI.DataField', Value: grandTotal   },
      { $Type: 'UI.DataField', Value: status       }
    ]
  }
);

annotate service.PurchaseOrderItems with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: material_ID,  Label: 'Material'      },
    { $Type: 'UI.DataField', Value: orderedQty,   Label: 'Ordered Qty'   },
    { $Type: 'UI.DataField', Value: unitPrice,    Label: 'Unit Price'    },
    { $Type: 'UI.DataField', Value: taxPercent,   Label: 'Tax %'         },
    { $Type: 'UI.DataField', Value: totalAmount,  Label: 'Line Total'    },
    { $Type: 'UI.DataField', Value: deliveredQty, Label: 'Delivered Qty' }
  ]
);

// ═══════════════════════════════════════════════════════════════
// MATERIAL RECEIPTS (GRN) — UI Annotations
// Entity: ProjectService.MaterialReceipts (flat, no draft, ABAP proxy)
// Fields: ReceiptID, Material, Quantity, PONumber, Supplier,
//         Unit, Status, Remarks, CreatedAt (readonly)
// ═══════════════════════════════════════════════════════════════

annotate service.GRNReceipts with @(

  Capabilities: {
    InsertRestrictions: { Insertable: true },
    DeleteRestrictions: { Deletable: true },
    UpdateRestrictions: { Updatable: true }
  },

  UI.SelectionFields: [ Status, PONumber, Supplier ],

  UI.LineItem: [
    { $Type: 'UI.DataField', Value: ReceiptID,  Label: 'Receipt ID',  ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: Material,   Label: 'Material',    ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: Quantity,   Label: 'Qty',         ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: Unit,       Label: 'Unit',        ![@UI.Importance]: #Low    },
    { $Type: 'UI.DataField', Value: PONumber,   Label: 'PO Number',   ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: Supplier,   Label: 'Supplier',    ![@UI.Importance]: #Medium },
    { $Type: 'UI.DataField', Value: Status,     Label: 'Status',      Criticality: Criticality, ![@UI.Importance]: #High   },
    { $Type: 'UI.DataField', Value: CreatedAt,  Label: 'Created On',  ![@UI.Importance]: #Low    },
    // Actions appear in table toolbar when a row is selected
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.verifyReceipt', Label: 'Verify', Inline: false, ![@UI.Importance]: #High },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.rejectReceipt', Label: 'Reject',  Inline: false, ![@UI.Importance]: #High }
  ],

  UI.HeaderInfo: {
    TypeName      : 'Material Receipt (GRN)',
    TypeNamePlural: 'Material Receipts',
    Title         : { $Type: 'UI.DataField', Value: ReceiptID },
    Description   : { $Type: 'UI.DataField', Value: Supplier }
  },

  UI.HeaderFacets: [
    {
      $Type : 'UI.ReferenceFacet',
      Target: '@UI.DataPoint#Status',
      ID    : 'HeaderStatus'
    },
    {
      $Type : 'UI.ReferenceFacet',
      Target: '@UI.DataPoint#Quantity',
      ID    : 'HeaderQuantity'
    }
  ],

  UI.DataPoint#Status: {
    Title: 'Document Status',
    Value: Status,
    Criticality: Criticality
  },

  UI.DataPoint#Quantity: {
    Title: 'Received Quantity',
    Value: Quantity,
    TargetValue: 0
  },

  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.verifyReceipt', Label: 'Verify Receipt' },
    { $Type: 'UI.DataFieldForAction', Action: 'ProjectService.rejectReceipt', Label: 'Reject Receipt'  }
  ],

  UI.Facets: [
    {
      $Type : 'UI.CollectionFacet',
      ID    : 'GeneralInfo',
      Label : 'General Information',
      Facets: [
        { $Type: 'UI.ReferenceFacet', ID: 'GRNDetails', Label: 'Receipt Details', Target: '@UI.FieldGroup#GRNDetails' },
        { $Type: 'UI.ReferenceFacet', ID: 'GRNAdmin', Label: 'Supplier & PO', Target: '@UI.FieldGroup#GRNAdmin' }
      ]
    },
    {
      $Type : 'UI.CollectionFacet',
      ID    : 'Instructions',
      Label : 'Guidelines',
      Facets: [
        { $Type: 'UI.ReferenceFacet', ID: 'HelpText', Label: 'Important Notes', Target: '@UI.FieldGroup#HelpText' }
      ]
    }
  ],

  UI.FieldGroup#GRNDetails: {
    Label: 'Material Details',
    Data : [
      { $Type: 'UI.DataField', Value: ReceiptID  },
      { $Type: 'UI.DataField', Value: Material   },
      { $Type: 'UI.DataField', Value: Quantity   },
      { $Type: 'UI.DataField', Value: Unit       },
      { $Type: 'UI.DataField', Value: Status     },
      { $Type: 'UI.DataField', Value: Remarks    }
    ]
  },

  UI.FieldGroup#GRNAdmin: {
    Label: 'Supplier Details',
    Data : [
      { $Type: 'UI.DataField', Value: PONumber   },
      { $Type: 'UI.DataField', Value: Supplier   },
      { $Type: 'UI.DataField', Value: CreatedAt  }
    ]
  },

  UI.FieldGroup#HelpText: {
    Label: 'Instructions for Site Engineer',
    Data : [
      { $Type: 'UI.DataField', Value: dummyInfo, Label: 'Process Guideline' }
    ]
  },

);

annotate service.GRNReceipts with {
  ReceiptID  @title: 'Receipt ID'   @Core.Immutable: true;  // editable on Create, locked on Update
  Material   @title: 'Material'     @mandatory;
  Quantity   @title: 'Quantity'     @mandatory;
  Unit       @title: 'Unit';
  PONumber   @title: 'PO Number';
  Supplier   @title: 'Supplier';
  Status     @title: 'Status'       @Core.Computed: true;   // always system-controlled
  Remarks    @title: 'Remarks'      @UI.MultiLineText: true;
  CreatedAt  @title: 'Created On'   @Core.Computed: true;   // always system-managed
}

// ═══════════════════════════════════════════════════════════════
// GRN RECEIPT ANALYTICS — Analytical List Page (ALP)
// Entity: ProjectService.GRNReceiptAnalytics  (/project/)
// Template: sap.fe.templates.AnalyticalListPage
// 3 Charts: By Status (Column) | By Supplier (Bar) | By Unit (Donut)
// ═══════════════════════════════════════════════════════════════

annotate service.GRNReceiptAnalytics with @(

  // ── Smart Filter Bar fields ────────────────────────────────────
  UI.SelectionFields: [Status, Supplier, Unit, Material],

  // ── Table (shared across all chart tabs) ──────────────────────
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: ReceiptID,  Label: 'Receipt ID'  },
    { $Type: 'UI.DataField', Value: Material,   Label: 'Material'    },
    { $Type: 'UI.DataField', Value: Supplier,   Label: 'Supplier'    },
    { $Type: 'UI.DataField', Value: PONumber,   Label: 'PO Number'   },
    { $Type: 'UI.DataField', Value: Status,     Label: 'Status'      },
    { $Type: 'UI.DataField', Value: Unit,       Label: 'Unit'        },
    { $Type: 'UI.DataField', Value: Quantity,   Label: 'Quantity'    },
    { $Type: 'UI.DataField', Value: Remarks,    Label: 'Remarks'     },
    { $Type: 'UI.DataField', Value: CreatedAt,  Label: 'Created On'  }
  ],

  // ── Chart 1: Column — Quantity by Status (default) ────────────
  UI.Chart: {
    $Type              : 'UI.ChartDefinitionType',
    Title              : 'GRN Quantity by Status',
    Description        : 'Total received quantity grouped by receipt status',
    ChartType          : #Column,
    Dimensions         : [Status],
    DimensionAttributes: [
      { $Type: 'UI.ChartDimensionAttributeType', Dimension: Status, Role: #Category }
    ],
    Measures           : [Quantity],
    MeasureAttributes  : [
      { $Type: 'UI.ChartMeasureAttributeType', Measure: Quantity, Role: #Axis1 }
    ]
  },

  // ── Chart 2: Bar — Quantity by Supplier ───────────────────────
  UI.Chart #BySupplier: {
    $Type              : 'UI.ChartDefinitionType',
    Title              : 'GRN Quantity by Supplier',
    Description        : 'Total received quantity per supplier',
    ChartType          : #Bar,
    Dimensions         : [Supplier],
    DimensionAttributes: [
      { $Type: 'UI.ChartDimensionAttributeType', Dimension: Supplier, Role: #Category }
    ],
    Measures           : [Quantity],
    MeasureAttributes  : [
      { $Type: 'UI.ChartMeasureAttributeType', Measure: Quantity, Role: #Axis1 }
    ]
  },

  // ── Chart 3: Donut — Quantity by Unit type ────────────────────
  UI.Chart #ByUnit: {
    $Type              : 'UI.ChartDefinitionType',
    Title              : 'GRN Quantity by Unit',
    Description        : 'Receipt share by unit of measure',
    ChartType          : #Donut,
    Dimensions         : [Unit],
    DimensionAttributes: [
      { $Type: 'UI.ChartDimensionAttributeType', Dimension: Unit, Role: #Category }
    ],
    Measures           : [Quantity],
    MeasureAttributes  : [
      { $Type: 'UI.ChartMeasureAttributeType', Measure: Quantity, Role: #Axis1 }
    ]
  },

  // ── PresentationVariant (default) — Status tab ────────────────
  UI.PresentationVariant: {
    SortOrder     : [{ $Type: 'Common.SortOrderType', Property: Quantity, Descending: true }],
    GroupBy       : [Status],
    Visualizations: ['@UI.Chart', '@UI.LineItem']
  },

  // ── PresentationVariant — Supplier tab ────────────────────────
  UI.PresentationVariant #BySupplier: {
    SortOrder     : [{ $Type: 'Common.SortOrderType', Property: Quantity, Descending: true }],
    GroupBy       : [Supplier],
    Visualizations: ['@UI.Chart#BySupplier', '@UI.LineItem']
  },

  // ── PresentationVariant — Unit tab ────────────────────────────
  UI.PresentationVariant #ByUnit: {
    SortOrder     : [{ $Type: 'Common.SortOrderType', Property: Quantity, Descending: true }],
    GroupBy       : [Unit],
    Visualizations: ['@UI.Chart#ByUnit', '@UI.LineItem']
  },

  // ── SelectionPresentationVariants — tie filter to each view ───
  UI.SelectionPresentationVariant: {
    Text              : 'By Status',
    PresentationVariant: ![@UI.PresentationVariant]
  },
  UI.SelectionPresentationVariant #BySupplier: {
    Text              : 'By Supplier',
    PresentationVariant: ![@UI.PresentationVariant#BySupplier]
  },
  UI.SelectionPresentationVariant #ByUnit: {
    Text              : 'By Unit',
    PresentationVariant: ![@UI.PresentationVariant#ByUnit]
  },

  // ── Header info ───────────────────────────────────────────────
  UI.HeaderInfo: {
    TypeName      : 'GRN Receipt',
    TypeNamePlural: 'GRN Receipts',
    Title         : { $Type: 'UI.DataField', Value: ReceiptID },
    Description   : { $Type: 'UI.DataField', Value: Material }
  }
);

// ── Field titles + aggregation defaults ───────────────────────
annotate service.GRNReceiptAnalytics with {
  ReceiptID @title: 'Receipt ID';
  Material  @title: 'Material'  @Analytics.Dimension: true;
  Quantity  @title: 'Quantity'  @Analytics.Measure: true  @Aggregation.default: #SUM;
  PONumber  @title: 'PO Number';
  Supplier  @title: 'Supplier'  @Analytics.Dimension: true;
  Unit      @title: 'Unit'      @Analytics.Dimension: true;
  Status    @title: 'Status'    @Analytics.Dimension: true;
  Remarks   @title: 'Remarks';
  CreatedAt @title: 'Created On';
}


