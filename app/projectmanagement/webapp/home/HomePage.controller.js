sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "solar/epc/projectmanagement/service/RoleService"
], function (Controller, JSONModel, MessageToast, MessageBox, Fragment, RoleService) {
    "use strict";

    // Tile → route mapping per role.
    // BDM      → all projects (create/activate/hold/cancel)
    // Engineer → ACTIVE projects only, can create BOQ + MR
    // Senior   → ACTIVE projects only, can only approve/reject MR
    const ROUTE_BY_ROLE = {
        "BDM": { "Engineering & Projects": "ProjectsList", default: "ProjectsList" },
        "ENGINEER": { "Engineering & Projects": "EngineeringProjectsList", default: "EngineeringProjectsList" },
        "PROJECT_MANAGER": { "Engineering & Projects": "SeniorProjectsList", "Procurement": "VendorList", default: "SeniorProjectsList" },
        "PROCUREMENT_OFFICER": { "Engineering & Projects": "ProjectsList", "Procurement": "POList", default: "POList" },
        "SITE_ENGINEER": { "Engineering & Projects": "ProjectsList", "Site Operations": "GRNList", default: "GRNList" },
        "FINANCE_OFFICER": { "Engineering & Projects": "ProjectsList", "Finance Cockpit": "InvoiceList", default: "InvoiceList" },
        "MANAGEMENT": { "MyHome": "ManagementDashboard", "Engineering & Projects": "ProjectsList", "Procurement": "ProcurementMRList", "Site Operations": "DeliveryList", "Finance Cockpit": "InvoiceList", default: "ManagementDashboard" }
    };

    return Controller.extend("solar.epc.projectmanagement.home.HomePage", {

        // ── Lifecycle ─────────────────────────────────────────────────────────

        onInit: function () {
            const oComponent = this.getOwnerComponent();
            const oSessionModel = oComponent.getModel("session");
            const sRole = oSessionModel.getProperty("/currentRole");

            this._initViewModel(sRole);

            // Keep view model in sync when session role changes (e.g. from another view)
            this._oRoleBinding = oSessionModel.bindProperty("/currentRole");
            this._oRoleBinding.attachChange(this._onSessionRoleChange, this);

            // Show access-denied message if we were redirected here
            if (oSessionModel.getProperty("/unauthorized")) {
                const sDenied = oSessionModel.getProperty("/lastDeniedRoute");
                MessageBox.warning(
                    "You do not have permission to access '" + sDenied + "'.",
                    { title: "Access Denied" }
                );
                oSessionModel.setProperty("/unauthorized", false);
                oSessionModel.setProperty("/lastDeniedRoute", "");
            }
        },

        onExit: function () {
            if (this._oRoleBinding) {
                this._oRoleBinding.detachChange(this._onSessionRoleChange, this);
            }
            if (this._oTodoResizeObserver) {
                this._oTodoResizeObserver.disconnect();
                this._oTodoResizeObserver = null;
            }
        },

        onAfterRendering: function () {
            this._syncHomeSplitterBarHeight();
        },

        // ── Initialisation helpers ────────────────────────────────────────────

        _initViewModel: function (sRole) {
            // Fallback so the Action Center isn't empty while session auth is pending
            sRole = sRole || "MANAGEMENT";

            const hour = new Date().getHours();
            const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
            const sUserName = this.getOwnerComponent().getModel("session").getProperty("/userName") || "User";
            const oAccess = RoleService.getAccessModel(sRole);
            const oKPIs = this._getKPIData(sRole);
            const aRoleTodos = RoleService.getTodos(sRole);

            const oModel = new JSONModel({
                greeting: greeting,
                userName: sUserName,
                role: RoleService.getDisplayName(sRole),
                systemName: "SolarSage EPC",
                currentRole: sRole,
                todos: aRoleTodos,
                todosCount: aRoleTodos.length,
                access: oAccess,
                todoRows: this.formatTodoRows(oAccess, aRoleTodos),
                kpis: oKPIs,
                editMode: false
            });
            this.getView().setModel(oModel, "view");
        },

        _applyRole: function (sRole) {
            const oModel = this.getView().getModel("view");
            const oAccess = RoleService.getAccessModel(sRole);
            const oKPIs = this._getKPIData(sRole);
            const aRoleTodos = RoleService.getTodos(sRole);
            
            oModel.setProperty("/role", RoleService.getDisplayName(sRole));
            oModel.setProperty("/currentRole", sRole);
            oModel.setProperty("/userName", this.getOwnerComponent().getModel("session").getProperty("/userName") || "User");
            oModel.setProperty("/todos", aRoleTodos);
            oModel.setProperty("/todosCount", aRoleTodos.length);
            oModel.setProperty("/access", oAccess);
            oModel.setProperty("/kpis", oKPIs);

            const iTodoRows = this.formatTodoRows(oAccess, aRoleTodos);
            oModel.setProperty("/todoRows", iTodoRows);

            // Force GridContainer to resize by explicitly setting layoutData and invalidating parent
            const oTodoCard = this.getView().byId("todoCard");
            if (oTodoCard) {
                const oLayoutData = oTodoCard.getLayoutData();
                if (oLayoutData) {
                    oLayoutData.setRows(iTodoRows);
                    const oGrid = this.getView().byId("mainGrid");
                    if (oGrid) {
                        oGrid.invalidate();
                    }
                }
            }

            // Sync session model so the route guard uses the new role
            this.getOwnerComponent().getModel("session")
                .setProperty("/currentRole", sRole);
        },

        // ── KPI Data Mock ─────────────────────────────────────────────────────

        _getKPIData: function (sRole) {
            // Mock KPI data based on role for authentic Fiori NumericHeader cards
            // Note: state expects sap.m.ValueColor: Good, Critical, Error, Neutral
            const oKPIs = {
                home: { value: "14", scale: "Tasks", trend: "None", state: "Neutral", details: "Across all modules" },
                engineering: { value: "0", scale: "Projects", trend: "None", state: "Neutral", details: "Active" },
                procurement: { value: "0", scale: "POs", trend: "None", state: "Neutral", details: "Pending" },
                siteOps: { value: "0", scale: "Deliveries", trend: "None", state: "Neutral", details: "Today" },
                vendorRebates: { value: "0", scale: "Contracts", trend: "None", state: "Neutral", details: "Under Review" },
                finance: { value: "0", scale: "Invoices", trend: "None", state: "Neutral", details: "To Validate" }
            };

            switch (sRole) {
                case "BDM":
                    oKPIs.engineering = { value: "24", scale: "Active", trend: "Up", state: "Good", details: "$4.2M Pipeline" };
                    break;
                case "ENGINEER":
                    oKPIs.engineering = { value: "8", scale: "BOQs", trend: "None", state: "Neutral", details: "In Progress" };
                    break;
                case "PROJECT_MANAGER":
                    oKPIs.engineering = { value: "12", scale: "Projects", trend: "Up", state: "Good", details: "On Track" };
                    oKPIs.procurement = { value: "5", scale: "Vendors", trend: "None", state: "Critical", details: "Pending Evaluation" };
                    break;
                case "PROCUREMENT_OFFICER":
                    oKPIs.procurement = { value: "15", scale: "Open POs", trend: "Up", state: "Critical", details: "Action Required" };
                    break;
                case "SITE_ENGINEER":
                    oKPIs.siteOps = { value: "4", scale: "Receipts", trend: "Down", state: "Neutral", details: "Pending Verification" };
                    break;
                case "FINANCE_OFFICER":
                    oKPIs.finance = { value: "9", scale: "Invoices", trend: "Up", state: "Error", details: "Awaiting Payment" };
                    break;
                case "MANAGEMENT":
                    oKPIs.engineering = { value: "45", scale: "Total", trend: "Up", state: "Good", details: "Projects Enterprise-wide" };
                    oKPIs.procurement = { value: "3.2", scale: "M", trend: "Down", state: "Good", details: "Spend vs Budget" };
                    oKPIs.siteOps = { value: "98", scale: "%", trend: "Up", state: "Good", details: "Safety Compliance" };
                    oKPIs.vendorRebates = { value: "120", scale: "k", trend: "Up", state: "Good", details: "Rebates Claimed" };
                    oKPIs.finance = { value: "12", scale: "%", trend: "Down", state: "Critical", details: "Margin Variance" };
                    break;
            }
            return oKPIs;
        },

        // ── Event handlers ────────────────────────────────────────────────────

        onSwitchUser: function (oEvent) {
            const oButton = oEvent.getSource();
            const oView = this.getView();

            if (!this._pDevUserSwitcher) {
                this._pDevUserSwitcher = Fragment.load({
                    id: oView.getId(),
                    name: "solar.epc.projectmanagement.home.DevUserSwitcher",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }
            this._pDevUserSwitcher.then(function (oPopover) {
                oPopover.openBy(oButton);
            });
        },

        onLogout: function () {
            this.getOwnerComponent().logout();
        },

        onSelectUser: function (oEvent) {
            const oListItem = oEvent.getParameter("listItem");
            const sUserId = oListItem.data("userId");
            const sPass = sUserId === "admin" ? "admin" : "pass";

            this.byId("devUserList").removeSelections(true);
            this._pDevUserSwitcher.then(function(oPopover) {
                oPopover.close();
            });

            MessageToast.show("Switching to user " + sUserId + "...");
            this.getOwnerComponent()
                .loginWithCredentials(sUserId, sPass)
                .then(function () {
                    window.location.reload();
                })
                .catch(function () {
                    MessageToast.show("Failed to switch user");
                });
        },

        onTodoPress: function (oEvent) {
            const oItem = oEvent.getSource();
            
            const oCtx = oItem.getBindingContext("view");
            const sRoute = oCtx ? oCtx.getProperty("route") : null;
            const sTask = oCtx ? oCtx.getProperty("title") : "Task";

            const oRouter = this.getOwnerComponent().getRouter();

            if (sRoute) {
                if (sRoute === "ManagementDashboard") {
                    window.location.href = window.location.origin + "/managementoverview/webapp/index.html";
                } else {
                    oRouter.navTo(sRoute);
                }
                return;
            }
            // fallback
            MessageToast.show("Opening: " + sTask);
        },

        onNavPress: function (oEvent) {
            const oSource = oEvent.getSource();
            const sHeader = oSource.getHeader ? oSource.getHeader() : oSource.getTitle();
            const oRouter = this.getOwnerComponent().getRouter();
            const sRole = this.getView().getModel("view").getProperty("/currentRole");

            // Determine route based on tile header and role.
            // MyHome routes to ManagementDashboard for MANAGEMENT, otherwise HomePage.
            const oRoleRoutes = ROUTE_BY_ROLE[sRole];
            let sRoute = oRoleRoutes && oRoleRoutes[sHeader]
                ? oRoleRoutes[sHeader]
                : sHeader === "MyHome"
                    ? (sRole === "MANAGEMENT" ? "ManagementDashboard" : "HomePage")
                    : oRoleRoutes?.default;

            if (!sRoute) {
                MessageToast.show("'" + sHeader + "' module is coming soon");
                return;
            }

            if (!RoleService.canAccessRoute(sRole, sRoute)) {
                MessageBox.error(
                    "Your role does not have access to '" + sHeader + "'.",
                    { title: "Access Denied" }
                );
                return;
            }

            oRouter.navTo(sRoute);
        },

        onAppPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const sAppKey = oItem.data("appKey") || "";
            const sLabel = oItem.data("appLabel") || "";
            const sRole = this.getView().getModel("view").getProperty("/currentRole");
            const oRouter = this.getOwnerComponent().getRouter();

            const oNavMap = {
                "manageVendors":      "VendorList",
                "createMR":           "EngineeringProjectsList",
                "approveMR":          "MRApprovalDashboard",
                "compareQuotations":  "QuotationComparison",
                "approvedMRs":        "ProcurementMRList",
                "createPO":           "POList",
                "trackDeliveries":    "DeliveryList",
                "postGR":             "GRNList",
                "reportDamage":       "GRNList",
                "validateInvoice":    "InvoiceList",
                "managementOverview": "ManagementDashboard",
                "grnAnalytics":       "GRNAnalytics"
            };

            if (oNavMap[sAppKey]) {
                if (sAppKey === "compareQuotations") {
                    MessageToast.show("Loading Compare Quotations...");
                }
                if (sAppKey === "managementOverview") {
                    // OVP is a standalone app — navigate to it by URL
                    window.location.href = window.location.origin + "/managementoverview/webapp/index.html";
                    return;
                }
                oRouter.navTo(oNavMap[sAppKey]);
                return;
            }

            // Partial matches
            if (sAppKey.toLowerCase().includes("compare") || sLabel.toLowerCase().includes("compare")) {
                MessageToast.show("Loading Compare Quotations...");
                oRouter.navTo("QuotationComparison");
                return;
            }

            MessageToast.show("Launching '" + sLabel + "' — screen coming soon");
        },

        onEditPress: function (oEvent) {
            const oModel = this.getView().getModel("view");
            const bEditMode = !oModel.getProperty("/editMode");
            oModel.setProperty("/editMode", bEditMode);
            MessageToast.show(bEditMode ? "Edit mode enabled. You can now drag and drop to rearrange tiles." : "Edit mode disabled.");
        },

        onDrop: function (oEvent) {
            const oDraggedItem = oEvent.getParameter("draggedControl");
            const oDroppedItem = oEvent.getParameter("droppedControl");
            const sDropPosition = oEvent.getParameter("dropPosition");

            const oParent = oDraggedItem.getParent();
            const iDragPosition = oParent.indexOfItem(oDraggedItem);
            let iDropPosition = oParent.indexOfItem(oDroppedItem);

            if (iDragPosition < iDropPosition && sDropPosition === "Before") {
                iDropPosition--;
            } else if (iDragPosition > iDropPosition && sDropPosition === "After") {
                iDropPosition++;
            }

            oParent.removeItem(oDraggedItem);
            oParent.insertItem(oDraggedItem, iDropPosition);
        },

        // ── Formatters ────────────────────────────────────────────────────────

        formatTodoRows: function (oAccess, aTodos) {
            if (!oAccess) {
                return 4;
            }
            let iCount = 1; // MyHome is always visible
            if (oAccess.tile_engineeringProjects) iCount++;
            if (oAccess.tile_procurement) iCount++;
            if (oAccess.tile_siteOps) iCount++;
            if (oAccess.tile_vendorRebates) iCount++;
            if (oAccess.tile_finance) iCount++;

            const iTodoCount = Array.isArray(aTodos) ? aTodos.length : 0;
            const iBaseRows = iCount <= 3 ? 3 : 4;
            const iExtraRows = Math.max(0, Math.ceil(Math.max(0, iTodoCount - 2) / 2));

            return iBaseRows + iExtraRows;
        },

        // ── Private ───────────────────────────────────────────────────────────

        _onSessionRoleChange: function () {
            const sRole = this._oRoleBinding.getValue();
            if (sRole && this.getView().getModel("view").getProperty("/currentRole") !== sRole) {
                this._applyRole(sRole);
            }
        },

        _syncHomeSplitterBarHeight: function () {
            const oTodoPane = this.byId("homeMainSplitter")?.getContentAreas?.()[0];
            if (!oTodoPane) {
                return;
            }

            const oTodoDom = oTodoPane.getDomRef();
            const oSplitterDom = this.byId("homeMainSplitter")?.getDomRef();
            if (!oTodoDom || !oSplitterDom) {
                return;
            }

            const fnApplyHeight = function () {
                const oBar = oSplitterDom.querySelector(".sapUiLoSplitterBar");
                if (oBar) {
                    oBar.style.height = oTodoDom.offsetHeight + "px";
                }
            };

            fnApplyHeight();

            if (!this._oTodoResizeObserver && typeof ResizeObserver !== "undefined") {
                this._oTodoResizeObserver = new ResizeObserver(fnApplyHeight);
                this._oTodoResizeObserver.observe(oTodoDom);
            }
        }
    });
});
