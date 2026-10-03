sap.ui.define([
    "sap/fe/core/AppComponent",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/HashChanger",
    "solar/epc/projectmanagement/service/RoleService"
], function (AppComponent, JSONModel, HashChanger, RoleService) {
    "use strict";

    return AppComponent.extend("solar.epc.projectmanagement.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            AppComponent.prototype.init.apply(this, arguments);

            // authPending: true blocks the route guard until session is resolved
            const oSessionModel = new JSONModel({
                authPending: true,
                authMode: "",
                isLocalSimulation: false,
                canSwitchRole: false,
                currentRole: RoleService.ROLES.MANAGEMENT,
                availableRoles: [],
                capRoles: [],
                uiRoles: [],
                userId: "",
                userName: "",
                email: "",
                loggedIn: false,
                unauthorized: false,
                lastDeniedRoute: ""
            });
            this.setModel(oSessionModel, "session");

            this.getRouter().attachBeforeRouteMatched(this._onBeforeRouteMatched, this);

            // Save the current hash (e.g., from a reload) before auth starts
            const oHashChanger = HashChanger.getInstance();
            const sIntendedHash = oHashChanger.getHash();
            sessionStorage.setItem("solarEpcIntendedHash", sIntendedHash || "");

            // Restore session from sessionStorage so page reload doesn't force re-login
            const sSavedAuth = sessionStorage.getItem("solarEpcAuth");
            if (sSavedAuth) {
                this._loadSession(sSavedAuth).catch(function () {
                    sessionStorage.removeItem("solarEpcAuth");
                });
            } else {
                oSessionModel.setProperty("/authPending", false);
            }
        },

        _getDefaultRouteForRole: function (sRole) {
            return "HomePage";
        },

        loginWithCredentials: function (sUsername, sPassword) {
            const sAuthHeader = "Basic " + window.btoa(sUsername + ":" + sPassword);
            sessionStorage.setItem("solarEpcAuth", sAuthHeader);
            return this._loadSession(sAuthHeader);
        },

        logout: function () {
            const oSessionModel = this.getModel("session");

            sessionStorage.removeItem("solarEpcAuth");
            sessionStorage.removeItem("solarEpcIntendedHash");

            this._forEachHttpHeaderModel(function (oModel) {
                this._clearAuthorizationHeader(oModel);
            }.bind(this));

            oSessionModel.setData({
                authPending: false,
                authMode: "",
                isLocalSimulation: false,
                canSwitchRole: false,
                currentRole: RoleService.ROLES.MANAGEMENT,
                availableRoles: [],
                capRoles: [],
                uiRoles: [],
                userId: "",
                userName: "",
                email: "",
                loggedIn: false,
                unauthorized: false,
                lastDeniedRoute: ""
            });

            this.getRouter().navTo("LoginPage", {}, true);
        },

        _loadSession: function (sAuthHeader) {
            const oSessionModel = this.getModel("session");
            const oHeaders = sAuthHeader ? { Authorization: sAuthHeader } : {};

            oSessionModel.setProperty("/authPending", true);

            return fetch("/auth/me()", { headers: oHeaders })
                .then(function (oResponse) {
                    if (!oResponse.ok) {
                        throw new Error("Session request failed with HTTP " + oResponse.status);
                    }
                    return oResponse.json();
                })
                .then(function (oPayload) {
                    const oSession = oPayload.value || oPayload;
                    const aUiRoles = RoleService.parseRoleList(oSession.uiRoles);
                    const aCapRoles = RoleService.parseRoleList(oSession.capRoles);
                    const sCurrentRole = oSession.currentRole || RoleService.getPrimaryRole(aUiRoles);

                    if (sAuthHeader && oSession.isLocalSimulation) {
                        this._applyAuthorizationHeader(sAuthHeader);
                    }

                    oSessionModel.setProperty("/currentRole", sCurrentRole);
                    oSessionModel.setData({
                        authPending: false,
                        authMode: oSession.authMode || "",
                        isLocalSimulation: !!oSession.isLocalSimulation,
                        canSwitchRole: !!oSession.canSwitchRole,
                        currentRole: sCurrentRole,
                        availableRoles: RoleService.getRoleOptions(aUiRoles.length ? aUiRoles : [sCurrentRole]),
                        capRoles: aCapRoles,
                        uiRoles: aUiRoles,
                        userId: oSession.userId || "",
                        userName: oSession.userName || oSession.userId || "User",
                        email: oSession.email || "",
                        loggedIn: true,
                        unauthorized: false,
                        lastDeniedRoute: ""
                    });

                    const sIntended = sessionStorage.getItem("solarEpcIntendedHash") || "";
                    sessionStorage.removeItem("solarEpcIntendedHash");

                    const oHashChanger = HashChanger.getInstance();
                    const sHash = oHashChanger.getHash();

                    if (sIntended && sIntended !== "LoginPage" && sIntended === sHash) {
                        // We are already on the right route (e.g. Fiori Element template inner route)
                        // Do not redirect to the default route.
                        return;
                    }

                    if (!sHash || sHash === "LoginPage") {
                        this.getRouter().navTo(this._getDefaultRouteForRole(sCurrentRole), {}, true);
                    }
                }.bind(this))
                .catch(function (oError) {
                    oSessionModel.setProperty("/authPending", false);
                    oSessionModel.setProperty("/loggedIn", false);
                    this.getRouter().navTo("LoginPage", {}, true);
                    throw oError;
                }.bind(this));
        },

        _applyAuthorizationHeader: function (sAuthHeader) {
            this._forEachHttpHeaderModel(function (oModel) {
                oModel.changeHttpHeaders({ Authorization: sAuthHeader });
            });
        },

        _clearAuthorizationHeader: function (oModel) {
            const mHeaders = typeof oModel.getHttpHeaders === "function"
                ? Object.assign({}, oModel.getHttpHeaders())
                : {};

            delete mHeaders.Authorization;
            oModel.changeHttpHeaders(mHeaders);
        },

        _forEachHttpHeaderModel: function (fnCallback) {
            ["", "vendorService", "invoiceService", "procurementService", "receiptService", "dashboardService"].forEach(function (sModelName) {
                const oModel = sModelName ? this.getModel(sModelName) : this.getModel();
                if (oModel && typeof oModel.changeHttpHeaders === "function") {
                    fnCallback(oModel);
                }
            }.bind(this));
        },

        _onBeforeRouteMatched: function (oEvent) {
            const sRouteName = oEvent.getParameter("name");
            const oSessionModel = this.getModel("session");
            const bAuthPending = oSessionModel.getProperty("/authPending");
            const bLoggedIn = oSessionModel.getProperty("/loggedIn");
            const sRole = oSessionModel.getProperty("/currentRole");

            if (bAuthPending) {
                return;
            }

            if (sRouteName === "LoginPage") {
                oSessionModel.setProperty("/unauthorized", false);

                if (bLoggedIn) {
                    this.getRouter().navTo(this._getDefaultRouteForRole(sRole), {}, true);
                }
                return;
            }

            if (!bLoggedIn) {
                this.getRouter().navTo("LoginPage", {}, true);
                return;
            }

            if (!RoleService.canAccessRoute(sRole, sRouteName)) {
                oSessionModel.setProperty("/unauthorized", true);
                oSessionModel.setProperty("/lastDeniedRoute", sRouteName);
                this.getRouter().navTo("HomePage", {}, true);
            } else {
                oSessionModel.setProperty("/unauthorized", false);
            }
        }
    });
});
