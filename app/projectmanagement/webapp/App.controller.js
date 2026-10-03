sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/HashChanger",
    "sap/m/ActionSheet",
    "sap/m/Button",
    "sap/ui/core/Theming"
], function (Controller, JSONModel, HashChanger, ActionSheet, Button, Theming) {
    "use strict";

    return Controller.extend("solar.epc.projectmanagement.App", {
        onInit: function () {
            // Apply default theme to ensure we are starting with the intended one
            Theming.setTheme("sap_horizon");

            this._aHashHistory = [];
            this._bBackNavigation = false;
            this.getView().setModel(new JSONModel({
                showBackButton: false,
                pageBannerVisible: false,
                pageBannerEyebrow: "",
                pageBannerTitle: "",
                pageBannerDescription: "",
                pageBannerNextText: "Next",
                pageBannerRoute: ""
            }), "app");

            this.getOwnerComponent().getRouter().attachRouteMatched(this._onRouteMatched, this);
        },

        onBackPress: function () {
            const oHashChanger = HashChanger.getInstance();
            const sCurrentHash = oHashChanger.getHash();

            if (this._aHashHistory[this._aHashHistory.length - 1] === sCurrentHash) {
                this._aHashHistory.pop();
            }

            const sPreviousHash = this._aHashHistory[this._aHashHistory.length - 1];
            this._bBackNavigation = true;

            if (sPreviousHash) {
                oHashChanger.setHash(sPreviousHash);
            } else {
                this.getOwnerComponent().getRouter().navTo("HomePage", {}, true);
            }

            this._updateBackButton();
        },

        onProfilePress: function (oEvent) {
            const oButton = oEvent.getSource();

            if (!this._oThemeActionSheet) {
                this._oThemeActionSheet = new ActionSheet({
                    title: "Settings",
                    showCancelButton: true,
                    buttons: [
                        new Button({
                            text: "Theme: Horizon Light",
                            icon: "sap-icon://lightbulb",
                            press: this.onThemeChange.bind(this, "sap_horizon")
                        }),
                        new Button({
                            text: "Theme: Horizon Dark",
                            icon: "sap-icon://e-care",
                            press: this.onThemeChange.bind(this, "sap_horizon_dark")
                        }),
                        new Button({
                            text: "Theme: Quartz Light",
                            icon: "sap-icon://palette",
                            press: this.onThemeChange.bind(this, "sap_fiori_3")
                        }),
                        new Button({
                            text: "Theme: Quartz Dark",
                            icon: "sap-icon://background",
                            press: this.onThemeChange.bind(this, "sap_fiori_3_dark")
                        })
                    ]
                });
                this.getView().addDependent(this._oThemeActionSheet);
            }

            this._oThemeActionSheet.openBy(oButton);
        },

        onThemeChange: function (sTheme) {
            Theming.setTheme(sTheme);
        },

        onBannerBackPress: function () {
            this.onBackPress();
        },

        onBannerNextPress: function () {
            const sRoute = this.getView().getModel("app").getProperty("/pageBannerRoute");
            if (sRoute) {
                this.getOwnerComponent().getRouter().navTo(sRoute);
            }
        },

        _onRouteMatched: function (oEvent) {
            const sRouteName = oEvent.getParameter("name");
            const sHash = HashChanger.getInstance().getHash();

            if (!sHash || sRouteName === "LoginPage") {
                this._updateBackButton(sRouteName);
                this._updatePageBanner(sRouteName);
                return;
            }

            if (this._bBackNavigation) {
                this._bBackNavigation = false;
                this._updateBackButton(sRouteName);
                this._updatePageBanner(sRouteName);
                return;
            }

            if (this._aHashHistory[this._aHashHistory.length - 1] !== sHash) {
                this._aHashHistory.push(sHash);
            }

            this._updateBackButton(sRouteName);
            this._updatePageBanner(sRouteName);
        },

        _updateBackButton: function (sRouteName) {
            const bShow = sRouteName !== "LoginPage" &&
                sRouteName !== "HomePage";

            this.getView().getModel("app").setProperty("/showBackButton", bShow);
        },

        _updatePageBanner: function (sRouteName) {
            const oAppModel = this.getView().getModel("app");
            const mBannerConfig = {
                VendorList: {
                    pageBannerVisible: true,
                    pageBannerEyebrow: "Vendor Evaluation Workspace",
                    pageBannerTitle: "Review approved suppliers with commercial clarity, performance context, and faster sourcing decisions.",
                    pageBannerDescription: "Use this page to validate vendor reach, contact readiness, performance indicators, and activation status before opening a vendor record or moving into quotation comparison.",
                    pageBannerNextText: "Compare Quotations",
                    pageBannerRoute: "QuotationComparison"
                }
            };

            const oConfig = mBannerConfig[sRouteName] || {
                pageBannerVisible: false,
                pageBannerEyebrow: "",
                pageBannerTitle: "",
                pageBannerDescription: "",
                pageBannerNextText: "Next",
                pageBannerRoute: ""
            };

            Object.keys(oConfig).forEach(function (sKey) {
                oAppModel.setProperty("/" + sKey, oConfig[sKey]);
            });
        }
    });
});
