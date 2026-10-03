sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Button"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, Dialog, Label, Input, Button) {
    "use strict";

    return Controller.extend("solar.epc.projectmanagement.vendor.QuotationComparison", {

        onInit: function () {
            const oViewModel = new JSONModel({
                materialRequests: [],
                selectedMR: {},
                selectedMRDetails: {},
                quotations: [],
                stats: {
                    totalQuotations: 0,
                    bestPrice: "",
                    bestVendor: "",
                    avgPrice: "",
                    fastestDelivery: "",
                    savingsVsAvg: ""
                },
                busy: false
            });
            this.getView().setModel(oViewModel, "view");
            this._fetchMaterialRequests();
        },

        onNavBack: function () {
            window.history.go(-1);
        },

        onMRSelectChange: function (oEvent) {
            const oItem = oEvent.getParameter("selectedItem");
            const sKey = oItem ? oItem.getKey() : "";
            this.getView().byId("compareButton").setEnabled(!!sKey);

            const oViewModel = this.getView().getModel("view");
            if (sKey) {
                const aMRs = oViewModel.getProperty("/materialRequests");
                const oMR = aMRs.find(function (mr) { return mr.ID === sKey; }) || {};
                oViewModel.setProperty("/selectedMR", oMR);
                oViewModel.setProperty("/selectedMRDetails", this._buildMrDetails(oMR));
            } else {
                oViewModel.setProperty("/selectedMR", {});
                oViewModel.setProperty("/selectedMRDetails", {});
            }
            // Clear previous results when MR changes
            oViewModel.setProperty("/quotations", []);
            oViewModel.setProperty("/stats", this._emptyStats());
        },

        onCompare: function () {
            const oSelect = this.getView().byId("mrSelect");
            const sMrId = oSelect.getSelectedKey();
            if (!sMrId) {
                MessageToast.show("Please select a Material Request first.");
                return;
            }

            const oViewModel = this.getView().getModel("view");
            const oVendorModel = this.getOwnerComponent().getModel("vendorService");
            const oFunction = oVendorModel.bindContext("/compareQuotations(...)");

            oViewModel.setProperty("/busy", true);
            oViewModel.setProperty("/quotations", []);

            oFunction.setParameter("materialRequestId", sMrId);
            oFunction.execute()
                .then(() => {
                    const rawResult = oFunction.getBoundContext().getObject();
                    const aRaw = Array.isArray(rawResult) ? rawResult
                        : (rawResult && Array.isArray(rawResult.value) ? rawResult.value : []);

                    if (!aRaw.length) {
                        MessageToast.show("No quotations found for evaluation.");
                        oViewModel.setProperty("/stats", this._emptyStats());
                        return;
                    }

                    // Fetch vendor details for each unique vendor_ID
                    const aVendorIds = [...new Set(aRaw.map(q => q.vendor_ID).filter(Boolean))];
                    return this._fetchVendorsByIds(oVendorModel, aVendorIds).then(aVendors => {
                        const oVendorMap = {};
                        aVendors.forEach(v => { if (v && v.ID) oVendorMap[v.ID] = v; });

                        // aRaw is already sorted asc by totalAmount from service
                        const fBestPrice = parseFloat(aRaw[0].totalAmount) || 0;
                        const fTotal = aRaw.reduce((s, q) => s + (parseFloat(q.totalAmount) || 0), 0);
                        const fAvg = fTotal / aRaw.length;
                        const nFastest = Math.min(...aRaw.map(q => q.deliveryLeadDays || 9999));
                        const fSavings = fAvg - fBestPrice;

                        const aQuotations = aRaw.map(q => {
                            const fAmount = parseFloat(q.totalAmount) || 0;
                            const bBest = Math.abs(fAmount - fBestPrice) < 0.01;
                            const fAboveAvg = fAmount - fAvg;
                            return Object.assign({}, q, {
                                vendor: oVendorMap[q.vendor_ID] || { vendorName: "—", vendorCode: "—" },
                                isBestPrice: bBest,
                                savingsVsAvg: !bBest && fAboveAvg > 0
                                    ? this._fmt(fAboveAvg)
                                    : ""
                            });
                        });

                        oViewModel.setProperty("/quotations", aQuotations);
                        oViewModel.setProperty("/stats", {
                            totalQuotations: aRaw.length,
                            bestPrice:       this._fmt(fBestPrice),
                            bestVendor:      (oVendorMap[aRaw[0].vendor_ID] || {}).vendorName || "—",
                            avgPrice:        this._fmt(fAvg),
                            fastestDelivery: nFastest === 9999 ? "—" : String(nFastest),
                            savingsVsAvg:    fSavings > 0 ? "₹ " + this._fmt(fSavings) : "—"
                        });

                        MessageToast.show(aRaw.length + " quotations loaded for comparison.");
                    });
                })
                .catch(oError => {
                    MessageBox.error("Failed to fetch quotations: " + (oError.message || oError));
                })
                .finally(() => {
                    oViewModel.setProperty("/busy", false);
                });
        },

        onSelectVendor: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("view");
            const sQuotationId = oCtx.getProperty("ID");
            const sVendorName  = oCtx.getProperty("vendor/vendorName");
            const oVendorModel = this.getOwnerComponent().getModel("vendorService");

            const oInput = new Input({
                id: "selectionReasonInput",
                width: "100%",
                placeholder: "e.g., Best price with reliable delivery history"
            });

            const oDialog = new Dialog({
                title: "Confirm Vendor Selection",
                content: [
                    new Label({ text: "Selecting: " + sVendorName, design: "Bold" }),
                    new Label({ text: "Provide a reason for selecting this vendor:" }),
                    oInput
                ],
                contentWidth: "400px",
                beginButton: new Button({
                    text: "Confirm Selection",
                    type: "Emphasized",
                    icon: "sap-icon://accept",
                    press: () => {
                        const sReason = oInput.getValue();
                        if (!sReason.trim()) {
                            MessageToast.show("A selection reason is required.");
                            return;
                        }
                        const bIsActiveEntity = oCtx.getProperty("IsActiveEntity") !== undefined ? oCtx.getProperty("IsActiveEntity") : true;
                        const oAction = oVendorModel.bindContext(
                            `/VendorQuotations(ID=${sQuotationId},IsActiveEntity=${bIsActiveEntity})/VendorService.selectVendor(...)`
                        );
                        oAction.setParameter("selectionReason", sReason);
                        oAction.execute()
                            .then(() => {
                                MessageToast.show(sVendorName + " selected. Other quotations rejected.");
                                this.onCompare();
                            })
                            .catch(oErr => {
                                MessageBox.error("Vendor selection failed: " + (oErr.message || oErr));
                            });
                        oDialog.close();
                    }
                }),
                endButton: new Button({
                    text: "Cancel",
                    press: function () { oDialog.close(); }
                }),
                afterClose: function () { oDialog.destroy(); }
            });
            oDialog.open();
        },

        // ── Private ───────────────────────────────────────────────

        _fetchMaterialRequests: function () {
            const oVendorModel = this.getOwnerComponent().getModel("vendorService");
            const oListBinding = oVendorModel.bindList(
                "/ApprovedMaterialRequests", undefined, [], [],
                { $expand: "project", $orderby: "requestDate desc" }
            );
            oListBinding.requestContexts(0, 100).then(aContexts => {
                const aMRs = aContexts.map(function (c) {
                    const oMR = c.getObject();
                    return Object.assign({}, oMR, {
                        statusState: this._statusState(oMR.status),
                        requestDateText: this._formatDate(oMR.requestDate),
                        requiredDateText: this._formatDate(oMR.requiredDate),
                        longDescription: this._buildSharedMrDescription(oMR)
                    });
                }.bind(this));
                this.getView().getModel("view").setProperty("/materialRequests", aMRs);
            }).catch(oErr => {
                console.warn("Failed to load material requests:", oErr.message || oErr);
            });
        },

        _fetchVendorsByIds: function (oVendorModel, aVendorIds) {
            if (!aVendorIds.length) {
                return Promise.resolve([]);
            }

            const aFilters = aVendorIds.map(function (sId) {
                return new Filter("ID", FilterOperator.EQ, sId);
            });
            const oFilter = aFilters.length === 1 ? aFilters[0] : new Filter({
                filters: aFilters,
                and: false
            });

            return oVendorModel.bindList("/VendorMaster", undefined, [], [oFilter])
                .requestContexts(0, aVendorIds.length)
                .then(function (aContexts) {
                    return aContexts.map(function (oContext) {
                        return oContext.getObject();
                    });
                })
                .catch(function () {
                    return [];
                });
        },

        _emptyStats: function () {
            return {
                totalQuotations: 0,
                bestPrice: "",
                bestVendor: "",
                avgPrice: "",
                fastestDelivery: "",
                savingsVsAvg: ""
            };
        },

        _buildMrDetails: function (oMR) {
            if (!oMR || !oMR.ID) {
                return {};
            }

            const sProjectName = oMR.project && oMR.project.projectName ? oMR.project.projectName : "the assigned solar project";
            const sProjectCode = oMR.project && oMR.project.projectCode ? oMR.project.projectCode : "Project";
            const sRemarks = oMR.remarks || "Commercial and engineering remarks will appear here once the sourcing package is finalized.";

            return {
                projectName: sProjectName,
                projectCode: sProjectCode,
                requestDateText: this._formatDate(oMR.requestDate),
                requiredDateText: this._formatDate(oMR.requiredDate),
                statusState: this._statusState(oMR.status),
                overviewTitle: "Procurement readiness snapshot",
                longDescription: this._buildSharedMrDescription(oMR),
                commercialNote: "This material request covers sourcing alignment, quote normalization, delivery risk review, and stakeholder-ready vendor selection notes for " + sProjectName + ".",
                remarksLabel: "Procurement note",
                remarksText: sRemarks
            };
        },

        _buildSharedMrDescription: function (oMR) {
            const sProjectName = oMR.project && oMR.project.projectName ? oMR.project.projectName : "the current solar package";
            const sStatus = oMR.status || "APPROVED";
            const sRequiredDate = this._formatDate(oMR.requiredDate);
            const sRequestDate = this._formatDate(oMR.requestDate);

            return "This sourcing package consolidates engineering demand, commercial evaluation, and delivery readiness for " +
                sProjectName + ". Raised on " + sRequestDate + " and targeted for fulfillment by " + sRequiredDate +
                ", it is being reviewed as a " + sStatus.toLowerCase().replace(/_/g, " ") +
                " request so the team can compare vendor commercials, lead times, and award confidence from one decision surface.";
        },

        _formatDate: function (sDate) {
            if (!sDate) {
                return "TBD";
            }

            const oDate = new Date(sDate);
            if (Number.isNaN(oDate.getTime())) {
                return sDate;
            }

            return oDate.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
        },

        _statusState: function (sStatus) {
            const oMap = {
                APPROVED: "Success",
                ORDERED: "Information",
                SUBMITTED: "Warning",
                REJECTED: "Error",
                CLOSED: "None"
            };

            return oMap[sStatus] || "None";
        },

        _fmt: function (fValue) {
            return parseFloat(fValue || 0).toLocaleString("en-IN", {
                maximumFractionDigits: 0
            });
        }
    });
});
