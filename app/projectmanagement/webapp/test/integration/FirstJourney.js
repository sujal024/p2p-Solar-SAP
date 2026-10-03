sap.ui.define([
    "sap/ui/test/opaQunit",
    "./pages/JourneyRunner"
], function (opaTest, runner) {
    "use strict";

    function journey() {
        QUnit.module("First journey");

        opaTest("Start application", function (Given, When, Then) {
            Given.iStartMyApp();

            Then.onTheProjectsList.iSeeThisPage();
            Then.onTheProjectsList.onFilterBar().iCheckFilterField("Status");
            Then.onTheProjectsList.onFilterBar().iCheckFilterField("Project Manager");
            Then.onTheProjectsList.onFilterBar().iCheckFilterField("State");
            Then.onTheProjectsList.onTable().iCheckColumns(8, {"projectCode":{"header":"Project Code"},"projectName":{"header":"Project Name"},"clientName":{"header":"Client"},"location":{"header":"Location"},"capacityKWp":{"header":"Capacity (kWp)"},"status":{"header":"Status"},"startDate":{"header":"Start Date"},"budget":{"header":"Budget (INR)"}});

        });


        opaTest("Navigate to ObjectPage", function (Given, When, Then) {
            // Note: this test will fail if the ListReport page doesn't show any data
            
            When.onTheProjectsList.onFilterBar().iExecuteSearch();
            
            Then.onTheProjectsList.onTable().iCheckRows();

            When.onTheProjectsList.onTable().iPressRow(0);
            Then.onTheProjectsObjectPage.iSeeThisPage();

        });

        opaTest("Teardown", function (Given, When, Then) { 
            // Cleanup
            Given.iTearDownMyApp();
        });
    }

    runner.run([journey]);
});