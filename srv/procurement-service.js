'use strict';

const cds = require('@sap/cds');
const ext = require('./integration/ExternalServices');

module.exports = class ProcurementService extends cds.ApplicationService {

  async init() {
    const { PurchaseOrders, PurchaseOrderItems, Deliveries } = this.entities;

    // ── AUTO-NUMBERING ────────────────────────────────────────────
    this.before('CREATE', PurchaseOrders, this._generatePONumber.bind(this));
    this.before('CREATE', Deliveries,     this._generateDeliveryNumber.bind(this));

    // ── PO ITEM CALCULATIONS ──────────────────────────────────────
    this.before('CREATE', PurchaseOrderItems, this._calculatePOItemAmounts.bind(this));
    this.before('UPDATE', PurchaseOrderItems, this._calculatePOItemAmounts.bind(this));

    // ── PO HEADER TOTALS ──────────────────────────────────────────
    this.after('CREATE', PurchaseOrderItems, (_, req) => this._recalculatePOTotals(req));
    this.after('UPDATE', PurchaseOrderItems, (_, req) => this._recalculatePOTotals(req));
    this.after('DELETE', PurchaseOrderItems, (_, req) => this._recalculatePOTotals(req));

    // ── PO VALIDATIONS ────────────────────────────────────────────
    this.before('CREATE', PurchaseOrders, this._validatePO.bind(this));

    // ── PO ACTIONS ────────────────────────────────────────────────
    this.on('confirmPO', PurchaseOrders, this._confirmPO.bind(this));
    this.on('cancelPO',  PurchaseOrders, this._cancelPO.bind(this));
    this.on('closePO',   PurchaseOrders, this._closePO.bind(this));

    // ── DELIVERY ACTIONS ──────────────────────────────────────────
    this.on('markInTransit', Deliveries, this._markInTransit.bind(this));
    this.on('markDelivered', Deliveries, this._markDelivered.bind(this));
    this.on('markDelayed',   Deliveries, this._markDelayed.bind(this));

    // ── PENDING QTY CALCULATION ───────────────────────────────────
    this.after('READ', PurchaseOrderItems, this._derivePendingQty.bind(this));

    // ── LAZY SEGW DELIVERY ENRICHMENT ─────────────────────────────
    // Merges live SEGW delivery status into PO results (non-blocking, best-effort)
    this.after('READ', PurchaseOrders, this._enrichWithSEGWDeliveries.bind(this));

    await super.init();
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTO-NUMBERING
  // ═══════════════════════════════════════════════════════════════

  async _generatePONumber(req) {
    const year = new Date().getFullYear();
    const result = await SELECT.one.from(this.entities.PurchaseOrders)
      .columns('poNumber')
      .orderBy('createdAt desc');

    let seq = 1;
    if (result?.poNumber) {
      const match = result.poNumber.match(/PO-\d{4}-(\d{4})$/);
      if (match) seq = parseInt(match[1]) + 1;
    }
    req.data.poNumber    = `PO-${year}-${String(seq).padStart(4, '0')}`;
    req.data.poDate      = req.data.poDate || new Date().toISOString().slice(0, 10);
    req.data.status      = 'DRAFT';
    req.data.subtotal    = 0;
    req.data.taxAmount   = 0;
    req.data.grandTotal  = 0;
  }

  async _generateDeliveryNumber(req) {
    const year = new Date().getFullYear();
    const result = await SELECT.one.from(this.entities.Deliveries)
      .columns('deliveryNumber')
      .orderBy('createdAt desc');

    let seq = 1;
    if (result?.deliveryNumber) {
      const match = result.deliveryNumber.match(/DEL-\d{4}-(\d{4})$/);
      if (match) seq = parseInt(match[1]) + 1;
    }
    req.data.deliveryNumber = `DEL-${year}-${String(seq).padStart(4, '0')}`;
    req.data.status         = 'SCHEDULED';
    req.data.delayDays      = 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // VALIDATIONS
  // ═══════════════════════════════════════════════════════════════

  async _validatePO(req) {
    const po = req.data;
    if (!po.vendor_ID)  return req.error(400, 'Vendor is mandatory',   'vendor_ID');
    if (!po.project_ID) return req.error(400, 'Project is mandatory',  'project_ID');
    if (!po.deliveryDate) return req.error(400, 'Delivery date is mandatory', 'deliveryDate');

    const poDate = new Date(po.poDate || new Date());
    const delDate = new Date(po.deliveryDate);
    if (delDate <= poDate) {
      return req.error(400, 'Delivery date must be after PO date', 'deliveryDate');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CALCULATIONS
  // ═══════════════════════════════════════════════════════════════

  _calculatePOItemAmounts(req) {
    const item = req.data;
    if (item.orderedQty !== undefined && item.unitPrice !== undefined) {
      const baseAmount  = parseFloat((item.orderedQty * item.unitPrice).toFixed(4));
      const taxPct      = item.taxPercent ?? 18;
      item.taxAmount    = parseFloat((baseAmount * taxPct / 100).toFixed(2));
      item.totalAmount  = parseFloat((baseAmount + item.taxAmount).toFixed(2));
      item.pendingQty   = item.orderedQty;
      item.deliveredQty = item.deliveredQty ?? 0;
    }
  }

  async _recalculatePOTotals(req) {
    const poId = req.data?.purchaseOrder_ID;
    if (!poId) return;

    const { PurchaseOrderItems, PurchaseOrders } = this.entities;
    const items = await SELECT.from(PurchaseOrderItems).where({ purchaseOrder_ID: poId });

    let subtotal  = 0;
    let taxAmount = 0;
    for (const item of items) {
      const base = parseFloat(((item.orderedQty || 0) * (item.unitPrice || 0)).toFixed(4));
      const tax  = parseFloat((base * (item.taxPercent || 18) / 100).toFixed(2));
      subtotal  += base;
      taxAmount += tax;
    }
    const grandTotal = parseFloat((subtotal + taxAmount).toFixed(2));
    await UPDATE(PurchaseOrders)
      .set({ subtotal, taxAmount, grandTotal })
      .where({ ID: poId });
  }

  _derivePendingQty(items) {
    const list = Array.isArray(items) ? items : [items];
    for (const item of list) {
      item.pendingQty = parseFloat(
        ((item.orderedQty || 0) - (item.deliveredQty || 0)).toFixed(3)
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PO ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async _confirmPO(req) {
    const { ID } = req.params[0];
    const po = await SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
    if (!po) return req.error(404, `PO ${ID} not found`);
    if (po.status !== 'DRAFT') {
      return req.error(400, `Only DRAFT POs can be confirmed. Current status: ${po.status}`);
    }
    const items = await SELECT.from(this.entities.PurchaseOrderItems)
      .where({ purchaseOrder_ID: ID });
    if (!items || items.length === 0) {
      return req.error(400, 'Cannot confirm PO with no line items');
    }
    await UPDATE(this.entities.PurchaseOrders)
      .set({ status: 'CONFIRMED', approvalDate: new Date().toISOString() })
      .where({ ID });

    // Update vendor total orders count
    await UPDATE(this.entities.VendorMaster)
      .set({ totalOrders: { '+=': 1 } })
      .where({ ID: po.vendor_ID });

    // ── ONE-WAY PUSH: CAP → SEGW (delivery schedule) ─────────────
    ext.pushDeliveryScheduleToSEGW(po).catch(() => {});

    // ── ONE-WAY PUSH: CAP → RAP (PO context for GRN enablement) ──
    ext.pushPOToRAP(po, items).catch(() => {});

    return SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
  }

  async _cancelPO(req) {
    const { ID } = req.params[0];
    const { reason } = req.data;
    const po = await SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
    if (!po) return req.error(404, `PO ${ID} not found`);
    if (['FULLY_DELIVERED', 'CLOSED', 'CANCELLED'].includes(po.status)) {
      return req.error(400, `Cannot cancel a ${po.status} PO`);
    }
    await UPDATE(this.entities.PurchaseOrders)
      .set({ status: 'CANCELLED', remarks: reason || po.remarks })
      .where({ ID });
    return SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
  }

  async _closePO(req) {
    const { ID } = req.params[0];
    const po = await SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
    if (!po) return req.error(404, `PO ${ID} not found`);
    if (!['CONFIRMED', 'PARTIALLY_DELIVERED', 'FULLY_DELIVERED'].includes(po.status)) {
      return req.error(400, `Cannot close PO in status: ${po.status}`);
    }
    await UPDATE(this.entities.PurchaseOrders).set({ status: 'CLOSED' }).where({ ID });
    return SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // DELIVERY ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async _markInTransit(req) {
    const { ID } = req.params[0];
    const delivery = await SELECT.one.from(this.entities.Deliveries).where({ ID });
    if (!delivery) return req.error(404, `Delivery ${ID} not found`);
    if (delivery.status !== 'SCHEDULED') {
      return req.error(400, `Only SCHEDULED deliveries can be marked IN_TRANSIT`);
    }
    await UPDATE(this.entities.Deliveries)
      .set({ status: 'IN_TRANSIT' })
      .where({ ID });
    return SELECT.one.from(this.entities.Deliveries).where({ ID });
  }

  async _markDelivered(req) {
    const { ID } = req.params[0];
    const { actualDate } = req.data;
    const delivery = await SELECT.one.from(this.entities.Deliveries).where({ ID });
    if (!delivery) return req.error(404, `Delivery ${ID} not found`);
    if (!['IN_TRANSIT', 'DELAYED'].includes(delivery.status)) {
      return req.error(400, `Delivery must be IN_TRANSIT or DELAYED to mark as delivered`);
    }
    const actual    = new Date(actualDate || new Date());
    const scheduled = new Date(delivery.scheduledDate);
    const delayMs   = actual - scheduled;
    const delayDays = Math.max(0, Math.floor(delayMs / (1000 * 60 * 60 * 24)));

    await UPDATE(this.entities.Deliveries)
      .set({
        status    : 'DELIVERED',
        actualDate: actualDate || new Date().toISOString().slice(0, 10),
        delayDays
      })
      .where({ ID });

    // Update PO status
    await this._updatePODeliveryStatus(delivery.purchaseOrder_ID);

    // Update vendor on-time delivery count
    if (delayDays === 0) {
      await UPDATE(this.entities.VendorMaster)
        .set({ onTimeDeliveries: { '+=': 1 } })
        .where({ ID: delivery.vendor_ID });
    }
    return SELECT.one.from(this.entities.Deliveries).where({ ID });
  }

  async _markDelayed(req) {
    const { ID } = req.params[0];
    const { reason, newDate } = req.data;
    if (!reason) return req.error(400, 'Delay reason is mandatory');
    const delivery = await SELECT.one.from(this.entities.Deliveries).where({ ID });
    if (!delivery) return req.error(404, `Delivery ${ID} not found`);
    if (!['SCHEDULED', 'IN_TRANSIT'].includes(delivery.status)) {
      return req.error(400, `Cannot mark delay on delivery in status: ${delivery.status}`);
    }

    const scheduled = new Date(delivery.scheduledDate);
    const today     = new Date();
    const delayDays = Math.max(0, Math.floor((today - scheduled) / (1000 * 60 * 60 * 24)));

    await UPDATE(this.entities.Deliveries)
      .set({
        status       : 'DELAYED',
        delayReason  : reason,
        delayDays,
        scheduledDate: newDate || delivery.scheduledDate
      })
      .where({ ID });
    return SELECT.one.from(this.entities.Deliveries).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════

  // Lazy-load live delivery data from SEGW and merge into PO results.
  // Adds `externalDeliveries` virtual field; silent on failure.
  async _enrichWithSEGWDeliveries(pos) {
    try {
      const list = Array.isArray(pos) ? pos : [pos];
      for (const po of list) {
        if (!po?.poNumber) continue;
        const deliveries = await ext.fetchDeliveriesFromSEGW(po.poNumber);
        if (deliveries.length > 0) {
          po.externalDeliveries = deliveries;
        }
      }
    } catch (e) {
      // non-fatal — SEGW may not be reachable in dev
    }
  }

  async _updatePODeliveryStatus(poId) {
    if (!poId) return;
    const items      = await SELECT.from(this.entities.PurchaseOrderItems)
      .where({ purchaseOrder_ID: poId });
    const totalOrdered   = items.reduce((s, i) => s + (i.orderedQty   || 0), 0);
    const totalDelivered = items.reduce((s, i) => s + (i.deliveredQty || 0), 0);

    let newStatus;
    if (totalDelivered >= totalOrdered) {
      newStatus = 'FULLY_DELIVERED';
    } else if (totalDelivered > 0) {
      newStatus = 'PARTIALLY_DELIVERED';
    } else {
      return;
    }
    await UPDATE(this.entities.PurchaseOrders)
      .set({ status: newStatus })
      .where({ ID: poId });
  }
};
