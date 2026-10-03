sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _toLakhs(value) {
        return value ? parseFloat((value / 100000).toFixed(2)) : 0;
    }

    function _toCrores(value) {
        return value ? parseFloat((value / 10000000).toFixed(2)) : 0;
    }

    function _statusState(status) {
        const map = {
            ACTIVE   : "Success",
            COMPLETED: "Success",
            ON_HOLD  : "Warning",
            DRAFT    : "None",
            CANCELLED: "Error"
        };
        return map[status] || "None";
    }

    function _budgetState(pct) {
        if (pct >= 90) return "Error";
        if (pct >= 75) return "Warning";
        return "Success";
    }

    // ═════════════════════════════════════════════════════════════════════════
    return Controller.extend("solar.epc.projectmanagement.dashboard.ManagementDashboard", {

        onInit: function () {
            const oDashModel = new JSONModel({
                lastRefreshed   : "",
                systemStatus    : "Healthy",
                systemState     : "Success",
                kpi: {
                    ongoingProjects  : 0,
                    completedProjects: 0,
                    delayedProjects  : 0,
                    totalPOValueCr   : 0,
                    pendingInvoices  : 0
                },
                budgetData    : [],
                vendorData    : [],
                deliveryData  : [],
                anomalies     : [],
                anomalyCount  : 0,
                projects      : [],
                invoiceSummary: []
            });
            this.getView().setModel(oDashModel, "dashboard");

            this._loadDashboard();
        },

        // ── Public handlers ───────────────────────────────────────────────────

        onRefresh: function () {
            this._loadDashboard();
            MessageToast.show("Dashboard refreshed.");
        },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("HomePage");
        },

        onAnomalyPress: function (oEvent) {
            const oCtx   = oEvent.getSource().getBindingContext("dashboard");
            const sTitle = oCtx.getProperty("title");
            const sDetail= oCtx.getProperty("detail");
            MessageBox.warning(sDetail, { title: sTitle });
        },

        onProjectRowPress: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("dashboard");
            MessageToast.show("Navigate to project: " + oCtx.getProperty("projectName"));
        },

        // ── Data loading ──────────────────────────────────────────────────────

        _loadDashboard: function () {
            const oComponent = this.getOwnerComponent();

            // Pull OData models registered on the app component
            const oMainModel      = oComponent.getModel();
            const oProcModel      = oComponent.getModel("procurementService");
            const oDashboardModel = oComponent.getModel("dashboardService");
            const oInvoiceModel   = oComponent.getModel("invoiceService");

            const aLoads = [];

            // ── Projects summary ──────────────────────────────────────────────
            if (oDashboardModel) {
                aLoads.push(
                    oDashboardModel.bindList("/ProjectSummary")
                        .requestContexts(0, 100)
                        .then(function (aCtx) {
                            return aCtx.map(function (c) { return c.getObject(); });
                        })
                );
            } else {
                // Fallback: read directly from mainService
                aLoads.push(
                    oMainModel.bindList("/Projects")
                        .requestContexts(0, 50)
                        .then(function (aCtx) {
                            return aCtx.map(function (c) {
                                const o = c.getObject();
                                const pct = o.budget > 0
                                    ? parseFloat(((o.spentAmount / o.budget) * 100).toFixed(1))
                                    : 0;
                                return Object.assign(o, {
                                    remainingBudget: o.budget - o.spentAmount,
                                    budgetUtilizationPct: pct
                                });
                            });
                        })
                );
            }

            // ── Vendor performance ─────────────────────────────────────────────
            if (oDashboardModel) {
                aLoads.push(
                    oDashboardModel.bindList("/VendorPerformanceSummary")
                        .requestContexts(0, 20)
                        .then(function (aCtx) { return aCtx.map(function (c) { return c.getObject(); }); })
                );
            } else {
                aLoads.push(Promise.resolve([]));
            }

            // ── Delivery performance ───────────────────────────────────────────
            if (oDashboardModel) {
                aLoads.push(
                    oDashboardModel.bindList("/DeliveryPerformance")
                        .requestContexts(0, 20)
                        .then(function (aCtx) { return aCtx.map(function (c) { return c.getObject(); }); })
                );
            } else {
                aLoads.push(Promise.resolve([]));
            }

            // ── Invoice matching summary ───────────────────────────────────────
            if (oDashboardModel) {
                aLoads.push(
                    oDashboardModel.bindList("/InvoiceMatchingSummary")
                        .requestContexts(0, 20)
                        .then(function (aCtx) { return aCtx.map(function (c) { return c.getObject(); }); })
                );
            } else {
                aLoads.push(Promise.resolve([]));
            }

            // ── Procurement KPIs ──────────────────────────────────────────────
            if (oDashboardModel) {
                aLoads.push(
                    oDashboardModel.bindList("/ProcurementKPI")
                        .requestContexts(0, 50)
                        .then(function (aCtx) { return aCtx.map(function (c) { return c.getObject(); }); })
                );
            } else {
                aLoads.push(Promise.resolve([]));
            }

            Promise.all(aLoads).then(function (aResults) {
                const aProjects    = aResults[0] || [];
                const aVendors     = aResults[1] || [];
                const aDeliveries  = aResults[2] || [];
                const aInvoices    = aResults[3] || [];
                const aProcurement = aResults[4] || [];

                this._updateModel(aProjects, aVendors, aDeliveries, aInvoices, aProcurement);
            }.bind(this)).catch(function (oErr) {
                // If OData calls fail (e.g. no data), show placeholder data
                this._updateModelWithPlaceholders();
            }.bind(this));
        },

        _updateModel: function (aProjects, aVendors, aDeliveries, aInvoices, aProcurement) {
            const oDashModel = this.getView().getModel("dashboard");

            // ── KPIs ──────────────────────────────────────────────────────────
            const nOngoing   = aProjects.filter(function (p) { return p.status === "ACTIVE"; }).length;
            const nCompleted = aProjects.filter(function (p) { return p.status === "COMPLETED"; }).length;
            const nDelayed   = aProjects.filter(function (p) {
                return p.status === "ACTIVE" && p.endDate && new Date(p.endDate) < new Date();
            }).length;

            const totalPO = aProcurement.reduce(function (s, p) { return s + (p.totalPOValue || 0); }, 0);

            const nPendingInv = aInvoices.reduce(function (s, i) {
                return s + ((i.totalInvoices || 0) - (i.paid || 0) - (i.approved || 0));
            }, 0);

            // ── Budget chart data ─────────────────────────────────────────────
            const aBudgetData = aProjects.slice(0, 8).map(function (p) {
                return {
                    projectCode: p.projectCode,
                    budgetL    : _toLakhs(p.budget),
                    spentL     : _toLakhs(p.spentAmount)
                };
            });

            // ── Vendor chart data ─────────────────────────────────────────────
            const aVendorData = aVendors.slice(0, 10).map(function (v) {
                return {
                    vendorName        : (v.vendorName || "").substring(0, 15),
                    onTimeDeliveryPct : parseFloat((v.onTimeDeliveryPct || 0).toFixed(1)),
                    performanceScore  : parseFloat((v.performanceScore  || 0).toFixed(1))
                };
            });

            // ── Delivery chart data ───────────────────────────────────────────
            const aDeliveryData = aDeliveries.slice(0, 8).map(function (d) {
                return {
                    vendorName  : (d.vendorName || "").substring(0, 15),
                    avgDelayDays: parseFloat((d.avgDelayDays || 0).toFixed(1)),
                    maxDelayDays: d.maxDelayDays || 0
                };
            });

            // ── Project table rows ────────────────────────────────────────────
            const aProjectRows = aProjects.map(function (p) {
                const pct = p.budget > 0
                    ? parseFloat(((p.spentAmount / p.budget) * 100).toFixed(1))
                    : 0;
                return {
                    projectName          : p.projectName,
                    clientName           : p.clientName || "-",
                    status               : p.status,
                    statusState          : _statusState(p.status),
                    budget               : p.budget || 0,
                    spentAmount          : p.spentAmount || 0,
                    budgetUtilizationPct : pct,
                    budgetState          : _budgetState(pct)
                };
            });

            // ── Anomaly detection ─────────────────────────────────────────────
            const aAnomalies = [];

            // Cost overruns
            aProjects.forEach(function (p) {
                const pct = p.budget > 0 ? (p.spentAmount / p.budget) * 100 : 0;
                if (pct > 90) {
                    aAnomalies.push({
                        title    : "Cost Overrun: " + p.projectName,
                        detail   : p.projectCode + " — Budget utilization at " + pct.toFixed(1) + "%. Immediate action required.",
                        icon     : "sap-icon://money-bills",
                        category : "Cost Overrun",
                        infoState: "Error"
                    });
                } else if (pct > 75) {
                    aAnomalies.push({
                        title    : "Budget Alert: " + p.projectName,
                        detail   : p.projectCode + " — Budget at " + pct.toFixed(1) + "%. Monitor closely.",
                        icon     : "sap-icon://warning",
                        category : "Budget Warning",
                        infoState: "Warning"
                    });
                }
            });

            // Long delays
            aDeliveries.forEach(function (d) {
                if (d.maxDelayDays > 7) {
                    aAnomalies.push({
                        title    : "Long Delay: " + d.vendorName,
                        detail   : "Max delivery delay of " + d.maxDelayDays + " days. Review vendor SLA.",
                        icon     : "sap-icon://shipping-status",
                        category : "Delivery Delay",
                        infoState: "Error"
                    });
                }
            });

            // Delivery failures
            aVendors.forEach(function (v) {
                if (v.onTimeDeliveryPct < 60 && v.totalOrders > 2) {
                    aAnomalies.push({
                        title    : "Poor Performance: " + v.vendorName,
                        detail   : "On-time delivery at " + (v.onTimeDeliveryPct || 0).toFixed(1) + "%. Consider vendor review.",
                        icon     : "sap-icon://supplier",
                        category : "Vendor Issue",
                        infoState: "Warning"
                    });
                }
            });

            // Overdue projects
            aProjects.forEach(function (p) {
                if (p.status === "ACTIVE" && p.endDate && new Date(p.endDate) < new Date()) {
                    const daysLate = Math.floor((new Date() - new Date(p.endDate)) / 86400000);
                    aAnomalies.push({
                        title    : "Overdue Project: " + p.projectName,
                        detail   : p.projectCode + " is " + daysLate + " day(s) past end date. Review timeline.",
                        icon     : "sap-icon://calendar",
                        category : "Schedule Overrun",
                        infoState: "Error"
                    });
                }
            });

            const now = new Date();
            const sTime = now.toLocaleDateString("en-IN") + " " + now.toLocaleTimeString("en-IN");

            oDashModel.setProperty("/lastRefreshed",    sTime);
            oDashModel.setProperty("/systemStatus",     aAnomalies.length === 0 ? "Healthy" : "Action Required");
            oDashModel.setProperty("/systemState",      aAnomalies.length === 0 ? "Success" : "Warning");
            oDashModel.setProperty("/kpi/ongoingProjects",   nOngoing);
            oDashModel.setProperty("/kpi/completedProjects", nCompleted);
            oDashModel.setProperty("/kpi/delayedProjects",   nDelayed);
            oDashModel.setProperty("/kpi/totalPOValueCr",    _toCrores(totalPO));
            oDashModel.setProperty("/kpi/pendingInvoices",   Math.max(0, nPendingInv));
            oDashModel.setProperty("/budgetData",       aBudgetData);
            oDashModel.setProperty("/vendorData",       aVendorData);
            oDashModel.setProperty("/deliveryData",     aDeliveryData);
            oDashModel.setProperty("/projects",         aProjectRows);
            oDashModel.setProperty("/invoiceSummary",   aInvoices);
            oDashModel.setProperty("/anomalies",        aAnomalies);
            oDashModel.setProperty("/anomalyCount",     aAnomalies.length);
        },

        _updateModelWithPlaceholders: function () {
            const oDashModel = this.getView().getModel("dashboard");
            const now = new Date();
            oDashModel.setProperty("/lastRefreshed", now.toLocaleDateString("en-IN") + " (no data)");
            oDashModel.setProperty("/systemStatus",  "No Data");
            oDashModel.setProperty("/systemState",   "Warning");
            oDashModel.setProperty("/budgetData",    [
                { projectCode: "PRJ-2025-0001", budgetL: 120, spentL: 87 },
                { projectCode: "PRJ-2025-0002", budgetL: 85,  spentL: 42 },
                { projectCode: "PRJ-2025-0003", budgetL: 200, spentL: 190 }
            ]);
            oDashModel.setProperty("/vendorData",    [
                { vendorName: "SunTech Solar",    onTimeDeliveryPct: 85, performanceScore: 8.2 },
                { vendorName: "PowerGrid Equip",  onTimeDeliveryPct: 72, performanceScore: 7.1 },
                { vendorName: "GreenWatt India",  onTimeDeliveryPct: 60, performanceScore: 6.0 }
            ]);
            oDashModel.setProperty("/deliveryData",  [
                { vendorName: "SunTech Solar",   avgDelayDays: 2,  maxDelayDays: 5  },
                { vendorName: "PowerGrid Equip", avgDelayDays: 4,  maxDelayDays: 10 },
                { vendorName: "GreenWatt India", avgDelayDays: 6,  maxDelayDays: 14 }
            ]);
        }
    });
});
