sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("solar.epc.projectmanagement.management.ManagementDashboard", {

        onInit: function () {
            this.getView().setModel(new JSONModel({
                kpis: {
                    activeProjects   : "--", projectState    : "Neutral", projectDetails    : "Loading...",
                    totalPOValue     : "--", poState         : "Neutral", poDetails         : "Loading...",
                    otdPct           : "--", otdState        : "Neutral", otdDetails        : "Loading...",
                    invoiceClearance : "--", invoiceState    : "Neutral", invoiceDetails    : "Loading...",
                    budgetUtilization: "--", budgetState     : "Neutral", budgetDetails     : "Loading...",
                    rejectionRate    : "--", rejectionState  : "Neutral", rejectionDetails  : "Loading..."
                },
                projects      : [],
                vendors        : [],
                procurementKPIs: []
            }), "mgmt");

            this._loadDashboard();
        },

        onNavBack: function () {
            if (window.history.length > 1) { window.history.back(); return; }
            this.getOwnerComponent().getRouter().navTo("HomePage");
        },

        onRefresh: function () {
            this._loadDashboard();
            MessageToast.show("Dashboard refreshed.");
        },

        // ── Data Loading ──────────────────────────────────────────────────────

        _loadDashboard: function () {
            this._loadProjectSummary();
            this._loadVendorPerformance();
            this._loadProcurementKPI();
            this._loadDeliveryPerformance();
            this._loadInvoiceSummary();
            this._loadReceiptQuality();
        },

        _ds: function () {
            return this.getOwnerComponent().getModel("dashboardService");
        },

        _loadProjectSummary: function () {
            const oDS = this._ds();
            if (!oDS) return;
            oDS.bindList("/ProjectSummary").requestContexts(0, 100)
            .then(function (aCtx) {
                const aProjects = aCtx.map(function (ctx) {
                    const o   = ctx.getObject();
                    const pct = parseFloat((o.budgetUtilizationPct || 0).toFixed(1));
                    return Object.assign({}, o, {
                        budgetUtilizationPct: pct,
                        statusState: o.status === "ACTIVE" ? "Success" : o.status === "ON_HOLD" ? "Warning" : "None",
                        budgetState: pct > 85 ? "Error" : pct > 65 ? "Warning" : "Success"
                    });
                });
                const oModel = this.getView().getModel("mgmt");
                oModel.setProperty("/projects", aProjects);

                const active      = aProjects.filter(function (p) { return p.status === "ACTIVE"; }).length;
                const totalBudget = aProjects.reduce(function (s, p) { return s + (p.budget || 0); }, 0);
                const totalSpent  = aProjects.reduce(function (s, p) { return s + (p.spentAmount || 0); }, 0);
                const utilPct     = totalBudget > 0 ? parseFloat(((totalSpent / totalBudget) * 100).toFixed(1)) : 0;

                oModel.setProperty("/kpis/activeProjects",    String(active));
                oModel.setProperty("/kpis/projectState",      active > 0 ? "Good" : "Neutral");
                oModel.setProperty("/kpis/projectDetails",    aProjects.length + " Total Projects");
                oModel.setProperty("/kpis/budgetUtilization", String(utilPct));
                oModel.setProperty("/kpis/budgetState",       utilPct > 85 ? "Error" : utilPct > 65 ? "Critical" : "Good");
                oModel.setProperty("/kpis/budgetDetails",     "₹" + (totalSpent / 1e7).toFixed(1) + "Cr of ₹" + (totalBudget / 1e7).toFixed(1) + "Cr");
            }.bind(this))
            .catch(function (e) { console.warn("ProjectSummary:", e.message || e); });
        },

        _loadVendorPerformance: function () {
            const oDS = this._ds();
            if (!oDS) return;
            oDS.bindList("/VendorPerformanceSummary").requestContexts(0, 50)
            .then(function (aCtx) {
                const aVendors = aCtx.map(function (ctx) {
                    const o   = ctx.getObject();
                    const otd = parseFloat((o.onTimeDeliveryPct || 0).toFixed(1));
                    return Object.assign({}, o, {
                        onTimeDeliveryPct: otd,
                        otdState    : otd >= 85 ? "Success" : otd >= 70 ? "Warning" : "Error",
                        qualityState: (o.qualityScore     || 0) >= 7.5 ? "Success" : (o.qualityScore     || 0) >= 5 ? "Warning" : "Error",
                        scoreState  : (o.performanceScore || 0) >= 7.5 ? "Success" : (o.performanceScore || 0) >= 5 ? "Warning" : "Error"
                    });
                }).sort(function (a, b) { return (b.performanceScore || 0) - (a.performanceScore || 0); });
                this.getView().getModel("mgmt").setProperty("/vendors", aVendors);
            }.bind(this))
            .catch(function (e) { console.warn("VendorPerformance:", e.message || e); });
        },

        _loadProcurementKPI: function () {
            const oDS = this._ds();
            if (!oDS) return;
            oDS.bindList("/ProcurementKPI").requestContexts(0, 50)
            .then(function (aCtx) {
                const aKPIs = aCtx.map(function (ctx) { return ctx.getObject(); });
                const oModel = this.getView().getModel("mgmt");
                oModel.setProperty("/procurementKPIs", aKPIs);

                const totalValue = aKPIs.reduce(function (s, k) { return s + (k.totalPOValue || 0); }, 0);
                const totalPOs   = aKPIs.reduce(function (s, k) { return s + (k.totalPOs   || 0); }, 0);
                oModel.setProperty("/kpis/totalPOValue", (totalValue / 1e7).toFixed(2));
                oModel.setProperty("/kpis/poState",      totalValue > 0 ? "Good" : "Neutral");
                oModel.setProperty("/kpis/poDetails",    totalPOs + " Total Purchase Orders");
            }.bind(this))
            .catch(function (e) { console.warn("ProcurementKPI:", e.message || e); });
        },

        _loadDeliveryPerformance: function () {
            const oDS = this._ds();
            if (!oDS) return;
            oDS.bindList("/DeliveryPerformance").requestContexts(0, 50)
            .then(function (aCtx) {
                const aPerf    = aCtx.map(function (ctx) { return ctx.getObject(); });
                if (!aPerf.length) return;
                const totalDel = aPerf.reduce(function (s, p) { return s + (p.totalDeliveries || 0); }, 0);
                const totalOT  = aPerf.reduce(function (s, p) { return s + (p.onTime         || 0); }, 0);
                const otdPct   = totalDel > 0 ? parseFloat(((totalOT / totalDel) * 100).toFixed(1)) : 0;
                const oModel   = this.getView().getModel("mgmt");
                oModel.setProperty("/kpis/otdPct",     String(otdPct));
                oModel.setProperty("/kpis/otdState",   otdPct >= 85 ? "Good" : otdPct >= 70 ? "Critical" : "Error");
                oModel.setProperty("/kpis/otdDetails", totalOT + " of " + totalDel + " on time");
            }.bind(this))
            .catch(function (e) { console.warn("DeliveryPerformance:", e.message || e); });
        },

        _loadInvoiceSummary: function () {
            const oDS = this._ds();
            if (!oDS) return;
            oDS.bindList("/InvoiceMatchingSummary").requestContexts(0, 50)
            .then(function (aCtx) {
                const aInv  = aCtx.map(function (ctx) { return ctx.getObject(); });
                if (!aInv.length) return;
                const total   = aInv.reduce(function (s, i) { return s + (i.totalInvoices || 0); }, 0);
                const cleared = aInv.reduce(function (s, i) { return s + (i.paid || 0) + (i.matched || 0); }, 0);
                const pct     = total > 0 ? parseFloat(((cleared / total) * 100).toFixed(1)) : 0;
                const oModel  = this.getView().getModel("mgmt");
                oModel.setProperty("/kpis/invoiceClearance", String(pct));
                oModel.setProperty("/kpis/invoiceState",     pct >= 80 ? "Good" : pct >= 60 ? "Critical" : "Error");
                oModel.setProperty("/kpis/invoiceDetails",   cleared + " of " + total + " Invoices Cleared");
            }.bind(this))
            .catch(function (e) { console.warn("InvoiceSummary:", e.message || e); });
        },

        _loadReceiptQuality: function () {
            const oDS = this._ds();
            if (!oDS) return;
            oDS.bindList("/ReceiptQuality").requestContexts(0, 50)
            .then(function (aCtx) {
                const aRQ      = aCtx.map(function (ctx) { return ctx.getObject(); });
                if (!aRQ.length) return;
                const totalDisp = aRQ.reduce(function (s, r) { return s + (r.totalDispatched || 0); }, 0);
                const totalRej  = aRQ.reduce(function (s, r) { return s + (r.totalRejected   || 0); }, 0);
                const rejPct    = totalDisp > 0 ? parseFloat(((totalRej / totalDisp) * 100).toFixed(1)) : 0;
                const oModel    = this.getView().getModel("mgmt");
                oModel.setProperty("/kpis/rejectionRate",    String(rejPct));
                oModel.setProperty("/kpis/rejectionState",   rejPct <= 2 ? "Good" : rejPct <= 5 ? "Critical" : "Error");
                oModel.setProperty("/kpis/rejectionDetails", totalRej.toFixed(0) + " units rejected of " + totalDisp.toFixed(0));
            }.bind(this))
            .catch(function (e) { console.warn("ReceiptQuality:", e.message || e); });
        }
    });
});
