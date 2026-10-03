'use strict';

/**
 * One-way CAP → External integration layer.
 * Direction: CAP → SEGW_DELIVERY_SRV, CAP → RAP_SERVICE
 * NEVER the reverse. All calls are fire-and-warn (non-fatal in dev).
 */

const cds = require('@sap/cds');
const LOG = cds.log('ext-svc');

let rapSvc  = null;
let segwSvc = null;

async function getRAPService() {
  if (!rapSvc) {
    try   { rapSvc = await cds.connect.to('RAP_SERVICE'); }
    catch (e) { LOG.warn('[RAP]  connect failed (dev mode):', e.message); }
  }
  return rapSvc;
}

async function getSEGWService() {
  if (!segwSvc) {
    try   { segwSvc = await cds.connect.to('SEGW_DELIVERY_SRV'); }
    catch (e) { LOG.warn('[SEGW] connect failed (dev mode):', e.message); }
  }
  return segwSvc;
}

/**
 * Push confirmed PO context to RAP so a GRN can be created against it.
 */
async function pushPOToRAP(po, items) {
  try {
    const svc = await getRAPService();
    if (!svc) return;
    await svc.send('POST', '/PurchaseOrderSet', {
      PONumber    : po.poNumber,
      VendorCode  : po.vendorCode  || '',
      ProjectCode : po.projectCode || '',
      ConfirmedAt : new Date().toISOString(),
      Items: (items || []).map(i => ({
        MaterialCode : i.materialCode  || '',
        OrderedQty   : i.orderedQty    || 0,
        UnitPrice    : i.unitPrice     || 0,
        UnitOfMeasure: i.unitOfMeasure || 'EA'
      }))
    });
    LOG.info(`[RAP]  PO ${po.poNumber} pushed — GRN enabled`);
  } catch (e) {
    LOG.warn(`[RAP]  pushPOToRAP non-fatal: ${e.message}`);
  }
}

/**
 * Push PO delivery schedule to SEGW so a delivery tracking record is created.
 */
async function pushDeliveryScheduleToSEGW(po) {
  try {
    const svc = await getSEGWService();
    if (!svc) return;
    await svc.send('POST', '/DeliverySet', {
      PONumber     : po.poNumber,
      VendorID     : po.vendor_ID   || '',
      ScheduledDate: po.deliveryDate || '',
      Status       : 'SCHEDULED'
    });
    LOG.info(`[SEGW] Delivery record created for PO ${po.poNumber}`);
  } catch (e) {
    LOG.warn(`[SEGW] pushDeliveryScheduleToSEGW non-fatal: ${e.message}`);
  }
}

/**
 * Pull GRN data from RAP for a given PO number (used in 3-way match).
 * Returns the first GRN found, or null if unavailable.
 */
async function fetchGRNFromRAP(poNumber) {
  try {
    const svc = await getRAPService();
    if (!svc) return null;
    const res = await svc.send(
      'GET',
      `/GRNSet?$filter=PONumber eq '${encodeURIComponent(poNumber)}'&$expand=Items`
    );
    const grn = res?.value?.[0] || null;
    if (grn) LOG.info(`[RAP]  GRN found for PO ${poNumber}: ${grn.GRNNumber}`);
    return grn;
  } catch (e) {
    LOG.warn(`[RAP]  fetchGRNFromRAP non-fatal: ${e.message}`);
    return null;
  }
}

/**
 * Lazy-fetch delivery status from SEGW for a given PO number.
 * Returns array of delivery records, empty array if unavailable.
 */
async function fetchDeliveriesFromSEGW(poNumber) {
  try {
    const svc = await getSEGWService();
    if (!svc) return [];
    const res = await svc.send(
      'GET',
      `/DeliverySet?$filter=PONumber eq '${encodeURIComponent(poNumber)}'`
    );
    return res?.value || [];
  } catch (e) {
    LOG.warn(`[SEGW] fetchDeliveriesFromSEGW non-fatal: ${e.message}`);
    return [];
  }
}

/**
 * After invoice approval, mark the SEGW delivery record(s) for this PO as INVOICED.
 */
async function patchDeliveryToInvoicedInSEGW(poNumber) {
  try {
    const svc = await getSEGWService();
    if (!svc) return;
    const deliveries = await fetchDeliveriesFromSEGW(poNumber);
    for (const d of deliveries) {
      if (!d.DeliveryNumber) continue;
      await svc.send('PATCH', `/DeliverySet('${d.DeliveryNumber}')`, { Status: 'INVOICED' });
      LOG.info(`[SEGW] Delivery ${d.DeliveryNumber} → INVOICED`);
    }
  } catch (e) {
    LOG.warn(`[SEGW] patchDeliveryToInvoicedInSEGW non-fatal: ${e.message}`);
  }
}

module.exports = {
  pushPOToRAP,
  pushDeliveryScheduleToSEGW,
  fetchGRNFromRAP,
  fetchDeliveriesFromSEGW,
  patchDeliveryToInvoicedInSEGW
};
