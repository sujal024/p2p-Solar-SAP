sap.ui.define(['sap/fe/test/ListReport'], function(ListReport) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ListReport(
        {
            appId: 'solar.epc.projectmanagement',
            componentId: 'ProjectsList',
            contextPath: '/Projects'
        },
        CustomPageDefinitions
    );
});