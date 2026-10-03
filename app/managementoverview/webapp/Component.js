sap.ui.define([
    "sap/ovp/app/Component"
], function (OVPComponent) {
    "use strict";

    return OVPComponent.extend("solar.epc.managementoverview.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            // Apply the stored auth header BEFORE OVP calls earlyRequests
            // (i18n model etc. are set up in OVPComponent.prototype.init)
            this._applyStoredAuth();

            OVPComponent.prototype.init.apply(this, arguments);

            // Apply again after init in case models were recreated
            this._applyStoredAuth();
        },

        _applyStoredAuth: function () {
            var sAuth = sessionStorage.getItem("solarEpcAuth");
            if (!sAuth) { return; }

            // Apply to every model that supports changeHttpHeaders
            var aModelNames = ["dashboardService", "i18n", ""];
            aModelNames.forEach(function (sName) {
                try {
                    var oModel = sName ? this.getModel(sName) : this.getModel();
                    if (oModel && typeof oModel.changeHttpHeaders === "function") {
                        oModel.changeHttpHeaders({ Authorization: sAuth });
                    }
                } catch (e) { /* model may not exist yet, ignore */ }
            }.bind(this));
        }
    });
});
