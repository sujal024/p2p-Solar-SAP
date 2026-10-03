sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"solar/epc/projectmanagement/test/integration/pages/ProjectsList",
	"solar/epc/projectmanagement/test/integration/pages/ProjectsObjectPage"
], function (JourneyRunner, ProjectsList, ProjectsObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('solar/epc/projectmanagement') + '/test/flp.html#app-preview',
        pages: {
			onTheProjectsList: ProjectsList,
			onTheProjectsObjectPage: ProjectsObjectPage
        },
        async: true
    });

    return runner;
});

