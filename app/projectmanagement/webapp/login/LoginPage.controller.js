sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "solar/epc/projectmanagement/service/RoleService"
], function (Controller, JSONModel, MessageBox, MessageToast, RoleService) {
    "use strict";

    return Controller.extend("solar.epc.projectmanagement.login.LoginPage", {

        onInit: function () {
            this.getView().setModel(new JSONModel({
                username: "",
                password: "",
                selectedRole: RoleService.ROLES.MANAGEMENT
            }), "login");
        },

        onLoginPress: function () {
            const oModel = this.getView().getModel("login");
            const sUsername = (oModel.getProperty("/username") || "").trim();
            const sPassword = oModel.getProperty("/password") || "";

            if (!sUsername && !sPassword) {
                // Only attempt XSUAA SSO when the server has explicitly declared
                // authMode: "xsuaa". In local dev (kind: mocked) this path is
                // skipped — credentials are always required.
                const oComp = this.getOwnerComponent();
                const sMode = oComp.getModel("session").getProperty("/authMode");
                if (sMode === "xsuaa") {
                    MessageToast.show("Checking XSUAA session…");
                    oComp._loadSession().catch(function () {
                        MessageBox.error("No active XSUAA session found. Enter your credentials.");
                    });
                } else {
                    MessageBox.warning("Enter your username and password to sign in.", { title: "Sign In" });
                }
                return;
            }

            if (!sUsername || !sPassword) {
                MessageBox.warning("Enter both username and password.", { title: "Login" });
                return;
            }

            this.getOwnerComponent()
                .loginWithCredentials(sUsername, sPassword)
                .catch(function () {
                    MessageBox.error("Invalid username or password.", { title: "Login Failed" });
                });
        }
    });
});
