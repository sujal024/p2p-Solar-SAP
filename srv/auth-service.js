'use strict';

const cds = require('@sap/cds');

const CAP_ROLES = [
  'BDM',
  'Engineer',
  'ProjectManager',
  'ProcurementOfficer',
  'SiteEngineer',
  'FinanceOfficer',
  'Management'
];

const UI_ROLE_BY_CAP_ROLE = {
  BDM: 'BDM',
  Engineer: 'ENGINEER',
  ProjectManager: 'PROJECT_MANAGER',
  ProcurementOfficer: 'PROCUREMENT_OFFICER',
  SiteEngineer: 'SITE_ENGINEER',
  FinanceOfficer: 'FINANCE_OFFICER',
  Management: 'MANAGEMENT'
};

const ROLE_PRIORITY = [
  'MANAGEMENT',
  'PROJECT_MANAGER',
  'PROCUREMENT_OFFICER',
  'FINANCE_OFFICER',
  'SITE_ENGINEER',
  'ENGINEER',
  'BDM'
];

module.exports = class AuthService extends cds.ApplicationService {
  async init() {
    this.on('me', req => this._sessionFor(req));
    await super.init();
  }

  _sessionFor(req) {
    const user = req.user || {};
    const authKind = cds.env.requires?.auth?.kind || 'mocked';
    const isLocalSimulation = authKind === 'mocked' || authKind === 'dummy';
    const isLocalAdmin = isLocalSimulation && (user.id === 'admin' || user.is?.('*'));
    const capRoles = isLocalAdmin
      ? CAP_ROLES.slice()
      : CAP_ROLES.filter(role => user.is?.(role));
    const uiRoles = capRoles.map(role => UI_ROLE_BY_CAP_ROLE[role]).filter(Boolean);
    const currentRole = ROLE_PRIORITY.find(role => uiRoles.includes(role)) || uiRoles[0] || '';
    const attr = user.attr || {};

    return {
      userId: user.id || '',
      userName: attr.name || attr.given_name || user.id || 'User',
      email: attr.email || user.id || '',
      authMode: authKind,
      isLocalSimulation,
      canSwitchRole: isLocalSimulation && uiRoles.length > 1,
      currentRole,
      capRoles: capRoles.join(','),
      uiRoles: uiRoles.join(',')
    };
  }
};
