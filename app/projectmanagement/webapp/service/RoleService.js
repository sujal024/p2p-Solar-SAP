sap.ui.define([], function () {
    "use strict";

    // ── Role constants ──────────────────────────────────────────────────────────
    // PROJECT_MANAGER is the backend CDS role; it displays as "Senior Engineer"
    // BDM manages the project lifecycle (create / activate / hold / cancel)
    const ROLES = {
        BDM:                 "BDM",
        ENGINEER:            "ENGINEER",
        PROJECT_MANAGER:     "PROJECT_MANAGER",
        PROCUREMENT_OFFICER: "PROCUREMENT_OFFICER",
        SITE_ENGINEER:       "SITE_ENGINEER",
        FINANCE_OFFICER:     "FINANCE_OFFICER",
        MANAGEMENT:          "MANAGEMENT"
    };

    const CAP_TO_UI_ROLE = {
        BDM:                 ROLES.BDM,
        Engineer:            ROLES.ENGINEER,
        ProjectManager:      ROLES.PROJECT_MANAGER,
        ProcurementOfficer:  ROLES.PROCUREMENT_OFFICER,
        SiteEngineer:        ROLES.SITE_ENGINEER,
        FinanceOfficer:      ROLES.FINANCE_OFFICER,
        Management:          ROLES.MANAGEMENT
    };

    const UI_TO_CAP_ROLE = {
        BDM:                 "BDM",
        ENGINEER:            "Engineer",
        PROJECT_MANAGER:     "ProjectManager",
        PROCUREMENT_OFFICER: "ProcurementOfficer",
        SITE_ENGINEER:       "SiteEngineer",
        FINANCE_OFFICER:     "FinanceOfficer",
        MANAGEMENT:          "Management"
    };

    const ROLE_PRIORITY = [
        ROLES.MANAGEMENT,
        ROLES.PROJECT_MANAGER,
        ROLES.PROCUREMENT_OFFICER,
        ROLES.FINANCE_OFFICER,
        ROLES.SITE_ENGINEER,
        ROLES.ENGINEER,
        ROLES.BDM
    ];

    const ROLE_DISPLAY = {
        BDM:                 "Business Development Manager",
        ENGINEER:            "Engineer",
        PROJECT_MANAGER:     "Senior Engineer",
        PROCUREMENT_OFFICER: "Procurement Officer",
        SITE_ENGINEER:       "Site Engineer",
        FINANCE_OFFICER:     "Finance Officer",
        MANAGEMENT:          "Management"
    };

    // ── Route-level permissions ─────────────────────────────────────────────────
    // Maps every manifest route name to the roles allowed to load it.
    // ProjectsList / ProjectsObjectPage  → BDM view (all projects, status actions)
    // EngineeringProjectsList / ...Page  → Engineering view (ACTIVE only, no status actions)
    const ROUTE_PERMISSIONS = {
        LoginPage: [
            "BDM", "ENGINEER", "PROJECT_MANAGER", "PROCUREMENT_OFFICER",
            "SITE_ENGINEER", "FINANCE_OFFICER", "MANAGEMENT"
        ],
        HomePage: [
            "BDM", "ENGINEER", "PROJECT_MANAGER", "PROCUREMENT_OFFICER",
            "SITE_ENGINEER", "FINANCE_OFFICER", "MANAGEMENT"
        ],
        ProjectsList: [
            "BDM", "MANAGEMENT"
        ],
        ProjectsObjectPage: [
            "BDM", "MANAGEMENT"
        ],
        EngineeringProjectsList: [
            "ENGINEER", "MANAGEMENT"
        ],
        EngineerObjectPage: [
            "ENGINEER", "MANAGEMENT"
        ],
        SeniorProjectsList: [
            "PROJECT_MANAGER", "MANAGEMENT"
        ],
        SeniorObjectPage: [
            "PROJECT_MANAGER", "MANAGEMENT"
        ],
        VendorList: [
            "PROCUREMENT_OFFICER", "PROJECT_MANAGER", "MANAGEMENT"
        ],
        VendorObjectPage: [
            "PROCUREMENT_OFFICER", "PROJECT_MANAGER", "MANAGEMENT"
        ],
        QuotationComparison: [
            "PROJECT_MANAGER", "PROCUREMENT_OFFICER", "MANAGEMENT"
        ],
        MRApprovalDashboard: [
            "PROJECT_MANAGER", "MANAGEMENT"
        ],
        MRApprovalDetail: [
            "PROJECT_MANAGER", "MANAGEMENT"
        ],
        ProcurementMRList: [
            "PROCUREMENT_OFFICER", "PROJECT_MANAGER", "MANAGEMENT"
        ],
        ProcurementMRDetail: [
            "PROCUREMENT_OFFICER", "PROJECT_MANAGER", "MANAGEMENT"
        ],
        GRNList: [
            "SITE_ENGINEER", "PROCUREMENT_OFFICER", "PROJECT_MANAGER", "MANAGEMENT"
        ],
        GRNObjectPage: [
            "SITE_ENGINEER", "PROCUREMENT_OFFICER", "PROJECT_MANAGER", "MANAGEMENT"
        ],
        DeliveryList: [
            "SITE_ENGINEER", "PROCUREMENT_OFFICER", "PROJECT_MANAGER", "MANAGEMENT"
        ],
        DeliveryObjectPage: [
            "SITE_ENGINEER", "PROCUREMENT_OFFICER", "PROJECT_MANAGER", "MANAGEMENT"
        ],
        ManagementDashboard: [
            "MANAGEMENT"
        ],
        GRNAnalytics: [
            "MANAGEMENT", "PROJECT_MANAGER", "PROCUREMENT_OFFICER"
        ],
        POList: [
            "PROCUREMENT_OFFICER", "PROJECT_MANAGER", "MANAGEMENT"
        ],
        POObjectPage: [
            "PROCUREMENT_OFFICER", "PROJECT_MANAGER", "MANAGEMENT"
        ],
        InvoiceList: [
            "FINANCE_OFFICER", "MANAGEMENT"
        ],
        InvoiceObjectPage: [
            "FINANCE_OFFICER", "MANAGEMENT"
        ],
        EngineerMRObjectPage: [
            "ENGINEER", "MANAGEMENT"
        ],
        SeniorMRObjectPage: [
            "PROJECT_MANAGER", "MANAGEMENT"
        ]
    };

    // ── Per-role dashboard access ───────────────────────────────────────────────
    // tiles:    workspace tile visibility
    // features: miscellaneous feature flags
    // apps:     app launcher visibility
    const ROLE_ACCESS = {
        BDM: {
            tiles: {
                engineeringProjects: true,
                procurement:         false,
                siteOps:             false,
                vendorRebates:       false,
                finance:             false
            },
            features: { insightCard: false },
            apps: {
                approvedMRs:          false,
                createMR:             false,
                approveMR:            false,
                manageVendors:        false,
                compareQuotations:    false,
                createPO:             false,
                trackDeliveries:      false,
                postGR:               false,
                reportDamage:         false,
                validateInvoice:      false,
                projectHealth:        false,
                managementOverview:   false,
                grnAnalytics:         false
            }
        },
        ENGINEER: {
            tiles: {
                engineeringProjects: true,
                procurement:         false,
                siteOps:             false,
                vendorRebates:       false,
                finance:             false
            },
            features: { insightCard: false },
            apps: {
                approvedMRs:          false,
                createMR:             true,
                approveMR:            false,
                manageVendors:        false,
                compareQuotations:    false,
                createPO:             false,
                trackDeliveries:      false,
                postGR:               false,
                reportDamage:         false,
                validateInvoice:      false,
                projectHealth:        false,
                managementOverview:   false,
                grnAnalytics:         false
            }
        },
        PROJECT_MANAGER: {
            tiles: {
                engineeringProjects: true,
                procurement:         true,
                siteOps:             false,
                vendorRebates:       false,
                finance:             false
            },
            features: { insightCard: true },
            apps: {
                approvedMRs:          true,
                createMR:             false,
                approveMR:            true,
                manageVendors:        true,
                compareQuotations:    true,
                createPO:             false,
                trackDeliveries:      true,
                postGR:               false,
                reportDamage:         false,
                validateInvoice:      false,
                projectHealth:        true,
                managementOverview:   false,
                grnAnalytics:         true
            }
        },
        PROCUREMENT_OFFICER: {
            tiles: {
                engineeringProjects: false,
                procurement:         true,
                siteOps:             false,
                vendorRebates:       false,
                finance:             false
            },
            features: { insightCard: true },
            apps: {
                approvedMRs:          true,
                createMR:             false,
                approveMR:            false,
                manageVendors:        true,
                compareQuotations:    true,
                createPO:             true,
                trackDeliveries:      true,
                postGR:               true,
                reportDamage:         true,
                validateInvoice:      false,
                projectHealth:        true,
                managementOverview:   false,
                grnAnalytics:         true
            }
        },
        SITE_ENGINEER: {
            tiles: {
                engineeringProjects: false,
                procurement:         false,
                siteOps:             true,
                vendorRebates:       false,
                finance:             false
            },
            features: { insightCard: false },
            apps: {
                approvedMRs:          false,
                createMR:             false,
                approveMR:            false,
                manageVendors:        false,
                compareQuotations:    false,
                createPO:             false,
                trackDeliveries:      true,
                postGR:               true,
                reportDamage:         true,
                validateInvoice:      false,
                projectHealth:        false,
                managementOverview:   false,
                grnAnalytics:         false
            }
        },
        FINANCE_OFFICER: {
            tiles: {
                engineeringProjects: false,
                procurement:         false,
                siteOps:             false,
                vendorRebates:       false,
                finance:             true
            },
            features: { insightCard: true },
            apps: {
                approvedMRs:          false,
                createMR:             false,
                approveMR:            false,
                manageVendors:        false,
                compareQuotations:    false,
                createPO:             false,
                trackDeliveries:      false,
                postGR:               false,
                reportDamage:         false,
                validateInvoice:      true,
                projectHealth:        true,
                managementOverview:   false,
                grnAnalytics:         false
            }
        },
        MANAGEMENT: {
            tiles: {
                engineeringProjects: true,
                procurement:         true,
                siteOps:             true,
                vendorRebates:       true,
                finance:             true
            },
            features: { insightCard: true },
            apps: {
                approvedMRs:          true,
                createMR:             true,
                approveMR:            true,
                manageVendors:        true,
                compareQuotations:    true,
                createPO:             true,
                trackDeliveries:      true,
                postGR:               true,
                reportDamage:         true,
                validateInvoice:      true,
                projectHealth:        true,
                managementOverview:   true,
                grnAnalytics:         true
            }
        }
    };

    // ── Role-specific todo items ────────────────────────────────────────────────
    const ROLE_TODOS = {
        BDM: [
            {
                task: "Activate Project — Rajasthan Solar Ph-II",
                title: "Activate Project — Rajasthan Solar Ph-II",
                project: "Rajasthan Solar Ph-II", 
                description: "Rajasthan Solar Ph-II",
                role: "BDM Action",
                icon: "sap-icon://project-definition-triangle", 
                status: "Awaiting Activation", 
                state: "Warning",
                route: "ProjectsList"
            },
            {
                task: "Review On-Hold Status — Bhadla Solar Park Ph-III",
                title: "Review On-Hold Status — Bhadla Solar Park Ph-III",
                project: "Bhadla Solar Park Ph-III", 
                description: "Bhadla Solar Park Ph-III",
                role: "BDM Action",
                icon: "sap-icon://pause", 
                status: "On Hold", 
                state: "Error",
                route: "ProjectsList"
            },
            {
                task: "Create New Project — Pavagada Extension",
                title: "Create New Project — Pavagada Extension",
                project: "Pavagada Solar Park", 
                description: "Pavagada Solar Park",
                role: "BDM Action",
                icon: "sap-icon://create", 
                status: "Draft Required", 
                state: "None",
                route: "ProjectsList"
            },
            {
                task: "Review Q3 Pipeline — South Region",
                title: "Review Q3 Pipeline — South Region",
                project: "Multiple Projects", 
                description: "Multiple Projects",
                role: "BDM Action",
                icon: "sap-icon://opportunity", 
                status: "Pending Review", 
                state: "Information",
                route: "ProjectsList"
            }
        ],
        ENGINEER: [
            {
                task: "Review BOQ for Bhadla Solar Park Ph-III",
                title: "Review BOQ for Bhadla Solar Park Ph-III",
                project: "Bhadla Solar Park Ph-III", 
                description: "Bhadla Solar Park Ph-III",
                role: "Engineer Action",
                icon: "sap-icon://create-form", 
                status: "In Progress", 
                state: "None",
                route: "EngineeringProjectsList"
            },
            {
                task: "Create Material Request for Solar Panels",
                title: "Create Material Request for Solar Panels",
                project: "Rewa Ultra Mega Solar", 
                description: "Rewa Ultra Mega Solar",
                role: "Engineer Action",
                icon: "sap-icon://approvals", 
                status: "Pending", 
                state: "Warning",
                route: "EngineeringProjectsList"
            },
            {
                task: "Revise Drawings — Kamuthi Solar Plant",
                title: "Revise Drawings — Kamuthi Solar Plant",
                project: "Kamuthi Solar Plant", 
                description: "Kamuthi Solar Plant",
                role: "Engineer Action",
                icon: "sap-icon://draw-rectangle", 
                status: "Awaiting Revision", 
                state: "Error",
                route: "EngineeringProjectsList"
            }
        ],
        PROJECT_MANAGER: [
            {
                task: "Approve Material Request #MR-1024",
                title: "Approve Material Request #MR-1024",
                project: "Bhadla Solar Park Ph-III", 
                description: "Bhadla Solar Park Ph-III",
                role: "Senior Engineer Action",
                icon: "sap-icon://approvals", 
                status: "High Priority", 
                state: "Error",
                route: "MRApprovalDashboard"
            },
            {
                task: "Review Project Health — Rewa Solar",
                title: "Review Project Health — Rewa Solar",
                project: "Rewa Ultra Mega Solar", 
                description: "Rewa Ultra Mega Solar",
                role: "Senior Engineer Action",
                icon: "sap-icon://line-chart-time-axis", 
                status: "Budget at 75%", 
                state: "Warning",
                route: "SeniorProjectsList"
            },
            {
                task: "Evaluate Inverter Quotations",
                title: "Evaluate Inverter Quotations",
                project: "Rewa Ultra Mega Solar", 
                description: "Rewa Ultra Mega Solar",
                role: "Senior Engineer Action",
                icon: "sap-icon://compare", 
                status: "Pending Bid Review", 
                state: "Warning",
                route: "QuotationComparison"
            },
            {
                task: "Schedule Kickoff — Pavagada Extension",
                title: "Schedule Kickoff — Pavagada Extension",
                project: "Pavagada Solar Park", 
                description: "Pavagada Solar Park",
                role: "Senior Engineer Action",
                icon: "sap-icon://appointment-2", 
                status: "Not Started", 
                state: "Information",
                route: "SeniorProjectsList"
            }
        ],
        PROCUREMENT_OFFICER: [
            {
                task: "Evaluate Vendor Quotations (RFQ #Q-2024-001)",
                title: "Evaluate Vendor Quotations (RFQ #Q-2024-001)",
                project: "Kurnool Operations", 
                description: "Kurnool Operations",
                role: "Procurement Action",
                icon: "sap-icon://compare", 
                status: "Requires Review", 
                state: "Warning",
                route: "QuotationComparison"
            },
            {
                task: "Verify Goods Receipt — Delivery #DL-883",
                title: "Verify Goods Receipt — Delivery #DL-883",
                project: "Kamuthi Solar Plant", 
                description: "Kamuthi Solar Plant",
                role: "Procurement Action",
                icon: "sap-icon://shipping-status", 
                status: "In Transit", 
                state: "None",
                route: "DeliveryList"
            },
            {
                task: "Approve Purchase Order #PO-992",
                title: "Approve Purchase Order #PO-992",
                project: "Bhadla Solar Park Ph-III", 
                description: "Bhadla Solar Park Ph-III",
                role: "Procurement Action",
                icon: "sap-icon://approvals", 
                status: "Pending", 
                state: "Warning",
                route: "POList"
            },
            {
                task: "Update Vendor Master Data — SunPower Inc",
                title: "Update Vendor Master Data — SunPower Inc",
                project: "Vendor Management", 
                description: "Vendor Management",
                role: "Procurement Action",
                icon: "sap-icon://supplier", 
                status: "Data Missing", 
                state: "Error",
                route: "VendorList"
            }
        ],
        SITE_ENGINEER: [
            {
                task: "Verify Damaged Solar Panels (Delivery #DL-883)",
                title: "Verify Damaged Solar Panels (Delivery #DL-883)",
                project: "Kurnool Operations", 
                description: "Kurnool Operations",
                role: "Site Action",
                icon: "sap-icon://quality-issue", 
                status: "Requires Inspection", 
                state: "Warning",
                route: "GRNList"
            },
            {
                task: "Post Goods Receipt for Materials",
                title: "Post Goods Receipt for Materials",
                project: "Kamuthi Solar Plant", 
                description: "Kamuthi Solar Plant",
                role: "Site Action",
                icon: "sap-icon://receipt", 
                status: "Pending Verification", 
                state: "None",
                route: "GRNList"
            },
            {
                task: "Daily Site Safety Inspection",
                title: "Daily Site Safety Inspection",
                project: "Rewa Ultra Mega Solar", 
                description: "Rewa Ultra Mega Solar",
                role: "Site Action",
                icon: "sap-icon://shield", 
                status: "Due Today", 
                state: "Warning",
                route: "GRNList"
            }
        ],
        FINANCE_OFFICER: [
            {
                task: "Validate Invoice #INV-551 against PO #PO-992",
                title: "Validate Invoice #INV-551 against PO #PO-992",
                project: "Kamuthi Solar Plant", 
                description: "Kamuthi Solar Plant",
                role: "Finance Action",
                icon: "sap-icon://my-sales-order", 
                status: "Ready for Payment", 
                state: "Success",
                route: "InvoiceList"
            },
            {
                task: "Review Project Budget Status — Bhadla Ph-III",
                title: "Review Project Budget Status — Bhadla Ph-III",
                project: "Bhadla Solar Park Ph-III", 
                description: "Bhadla Solar Park Ph-III",
                role: "Finance Action",
                icon: "sap-icon://money-bills", 
                status: "High Spend", 
                state: "Warning",
                route: "InvoiceList"
            },
            {
                task: "Reconcile Q2 Payments",
                title: "Reconcile Q2 Payments",
                project: "Corporate Finance", 
                description: "Corporate Finance",
                role: "Finance Action",
                icon: "sap-icon://accounting-document-verification", 
                status: "In Progress", 
                state: "Information",
                route: "InvoiceList"
            }
        ],
        MANAGEMENT: [
            {
                task: "Approve Material Request #MR-1024",
                title: "Approve Material Request #MR-1024",
                project: "Bhadla Solar Park Ph-III", 
                description: "Bhadla Solar Park Ph-III",
                role: "Executive Action",
                icon: "sap-icon://approvals", 
                status: "High Priority", 
                state: "Error",
                route: "MRApprovalDashboard"
            },
            {
                task: "Evaluate Inverter Quotations",
                title: "Evaluate Inverter Quotations",
                project: "Rewa Ultra Mega Solar", 
                description: "Rewa Ultra Mega Solar",
                role: "Executive Action",
                icon: "sap-icon://compare", 
                status: "Pending Bid Review", 
                state: "Warning",
                route: "QuotationComparison"
            },
            {
                task: "Review All Project Health Metrics",
                title: "Review All Project Health Metrics",
                project: "Multi-Project", 
                description: "Multi-Project",
                role: "Executive Action",
                icon: "sap-icon://line-chart-time-axis", 
                status: "Dashboard Update", 
                state: "None",
                route: "ManagementDashboard"
            },
            {
                task: "Approve Invoice #INV-551",
                title: "Approve Invoice #INV-551",
                project: "Kamuthi Solar Plant", 
                description: "Kamuthi Solar Plant",
                role: "Executive Action",
                icon: "sap-icon://my-sales-order", 
                status: "Ready for Payment", 
                state: "Success",
                route: "InvoiceList"
            },
            {
                task: "Review Executive Quarterly Report",
                title: "Review Executive Quarterly Report",
                project: "Enterprise", 
                description: "Enterprise",
                role: "Executive Action",
                icon: "sap-icon://business-objects-experience", 
                status: "Draft Ready", 
                state: "Information",
                route: "ManagementDashboard"
            }
        ]
    };

    // ── Public API ──────────────────────────────────────────────────────────────
    return {
        ROLES: ROLES,

        toUiRole: function (sCapRole) {
            return CAP_TO_UI_ROLE[sCapRole] || sCapRole;
        },

        toCapRole: function (sUiRole) {
            return UI_TO_CAP_ROLE[sUiRole] || sUiRole;
        },

        parseRoleList: function (sRoles) {
            if (Array.isArray(sRoles)) {
                return sRoles.filter(Boolean);
            }
            return String(sRoles || "")
                .split(",")
                .map(function (sRole) { return sRole.trim(); })
                .filter(Boolean);
        },

        getPrimaryRole: function (aUiRoles) {
            const aRoles = this.parseRoleList(aUiRoles);
            return ROLE_PRIORITY.find(function (sRole) {
                return aRoles.indexOf(sRole) !== -1;
            }) || aRoles[0] || ROLES.MANAGEMENT;
        },

        getRoleOptions: function (aUiRoles) {
            return this.parseRoleList(aUiRoles).map(function (sRole) {
                return { key: sRole, text: ROLE_DISPLAY[sRole] || sRole };
            });
        },

        getDisplayName: function (sRole) {
            return ROLE_DISPLAY[sRole] || sRole;
        },

        canAccessRoute: function (sRole, sRouteName) {
            const aAllowed = ROUTE_PERMISSIONS[sRouteName];
            if (!aAllowed) return true; // unknown routes are open by default
            return aAllowed.indexOf(sRole) !== -1;
        },

        // Returns a flat object for JSONModel binding:
        //   tile_engineeringProjects, tile_procurement, ...
        //   insightCard
        //   app_createMR, app_approveMR, ...
        getAccessModel: function (sRole) {
            const oConfig = ROLE_ACCESS[sRole];
            if (!oConfig) return {};

            const oFlat = {
                displayName: ROLE_DISPLAY[sRole] || sRole
            };
            Object.keys(oConfig.tiles).forEach(function (k) {
                oFlat["tile_" + k] = oConfig.tiles[k];
            });
            Object.keys(oConfig.features).forEach(function (k) {
                oFlat[k] = oConfig.features[k];
            });
            Object.keys(oConfig.apps).forEach(function (k) {
                oFlat["app_" + k] = oConfig.apps[k];
            });
            return oFlat;
        },

        getTodos: function (sRole) {
            const sNormalizedRole = this.toUiRole(sRole) || sRole;
            return (ROLE_TODOS[sNormalizedRole] || []).slice();
        }
    };
});
