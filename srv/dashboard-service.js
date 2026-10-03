'use strict';

const cds = require('@sap/cds');

module.exports = class DashboardService extends cds.ApplicationService {

  async init() {
    this.on('getProjectHealth', this._getProjectHealth.bind(this));
    await super.init();
  }

  // ═══════════════════════════════════════════════════════════════
  // PROJECT HEALTH FUNCTION
  // Returns a composite health status for a single project
  // ═══════════════════════════════════════════════════════════════

  async _getProjectHealth(req) {
    const { projectId } = req.data;

    const { Projects, PurchaseOrders, Deliveries, Invoices } = cds.entities('solar.epc');

    // ── Project basics ─────────────────────────────────────────
    const project = await SELECT.one.from(Projects).where({ ID: projectId });
    if (!project) return req.error(404, `Project ${projectId} not found`);

    const budgetUtilization = project.budget > 0
      ? parseFloat(((project.spentAmount / project.budget) * 100).toFixed(2))
      : 0;

    // ── Procurement status ─────────────────────────────────────
    const pos = await SELECT.from(PurchaseOrders).where({ project_ID: projectId });
    const totalPOs     = pos.length;
    const confirmedPOs = pos.filter(p => p.status !== 'DRAFT' && p.status !== 'CANCELLED').length;
    const procurementStatus = totalPOs === 0
      ? 'No POs raised'
      : `${confirmedPOs}/${totalPOs} POs confirmed`;

    // ── Delivery status ────────────────────────────────────────
    const poIds = pos.map(p => p.ID);
    let deliveryStatus = 'No deliveries';
    if (poIds.length > 0) {
      const deliveries  = await SELECT.from(Deliveries)
        .where({ purchaseOrder_ID: { in: poIds } });
      const total     = deliveries.length;
      const delivered = deliveries.filter(d => d.status === 'DELIVERED').length;
      const delayed   = deliveries.filter(d => d.delayDays > 0).length;
      deliveryStatus  = total > 0
        ? `${delivered}/${total} delivered, ${delayed} delayed`
        : 'Deliveries scheduled';
    }

    // ── Invoice status ─────────────────────────────────────────
    let invoiceStatus = 'No invoices';
    if (poIds.length > 0) {
      const invoices = await SELECT.from(Invoices)
        .where({ purchaseOrder_ID: { in: poIds } });
      const total    = invoices.length;
      const paid     = invoices.filter(i => i.status === 'PAID').length;
      const pending  = invoices.filter(i => !['PAID', 'REJECTED'].includes(i.status)).length;
      invoiceStatus  = total > 0
        ? `${paid}/${total} paid, ${pending} pending`
        : 'No invoices raised';
    }

    // ── Overall health ─────────────────────────────────────────
    let overallHealth;
    if (project.status === 'CANCELLED')       overallHealth = 'CANCELLED';
    else if (project.status === 'COMPLETED')  overallHealth = 'COMPLETED';
    else if (budgetUtilization > 90)          overallHealth = 'AT_RISK';
    else if (budgetUtilization > 75)          overallHealth = 'CAUTION';
    else                                      overallHealth = 'ON_TRACK';

    return {
      projectCode      : project.projectCode,
      budgetUtilization,
      procurementStatus,
      deliveryStatus,
      invoiceStatus,
      overallHealth
    };
  }
};
