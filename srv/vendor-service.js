'use strict';

const cds = require('@sap/cds');

module.exports = class VendorService extends cds.ApplicationService {

  async init() {
    const { VendorMaster, VendorQuotations, VendorQuotationItems } = this.entities;

    // ── AUTO-NUMBERING ────────────────────────────────────────────
    this.before('CREATE', VendorMaster,         this._generateVendorCode.bind(this));
    this.before('CREATE', VendorQuotations,     this._generateQuotationNumber.bind(this));

    // ── ITEM CALCULATIONS ─────────────────────────────────────────
    this.before('CREATE', VendorQuotationItems, this._calculateItemAmounts.bind(this));
    this.before('UPDATE', VendorQuotationItems, this._calculateItemAmounts.bind(this));

    // ── HEADER TOTALS ─────────────────────────────────────────────
    this.after('CREATE', VendorQuotationItems, (_, req) => this._recalculateHeader(req));
    this.after('UPDATE', VendorQuotationItems, (_, req) => this._recalculateHeader(req));
    this.after('DELETE', VendorQuotationItems, (_, req) => this._recalculateHeader(req));

    // ── VENDOR MASTER ACTIONS ─────────────────────────────────────
    this.on('activateVendor',   VendorMaster, this._activateVendor.bind(this));
    this.on('deactivateVendor', VendorMaster, this._deactivateVendor.bind(this));

    // ── QUOTATION ACTIONS ─────────────────────────────────────────
    this.on('submitQuotation',  VendorQuotations, this._submitQuotation.bind(this));
    this.on('selectVendor',     VendorQuotations, this._selectVendor.bind(this));
    this.on('rejectQuotation',  VendorQuotations, this._rejectQuotation.bind(this));

    // ── CUSTOM FUNCTION ───────────────────────────────────────────
    this.on('compareQuotations', this._compareQuotations.bind(this));

    await super.init();
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTO-NUMBERING
  // ═══════════════════════════════════════════════════════════════

  async _generateVendorCode(req) {
    if (req.data.vendorCode) return; // don't overwrite if caller set it explicitly
    const { VendorMaster } = this.entities;
    // Find the highest numeric suffix from any vendorCode format (VND-1001 or VND-YYYY-NNNN)
    const allVendors = await SELECT.from(VendorMaster).columns('vendorCode');
    let maxSeq = 1000;
    for (const v of allVendors) {
      const code = v.vendorCode || '';
      const m1 = code.match(/VND-(\d{4})$/);
      const m2 = code.match(/VND-\d{4}-(\d{4})$/);
      const num = m1 ? parseInt(m1[1]) : m2 ? parseInt(m2[1]) : 0;
      if (num > maxSeq) maxSeq = num;
    }
    req.data.vendorCode        = `VND-${maxSeq + 1}`;
    req.data.isActive          = req.data.isActive ?? true;
    req.data.performanceScore  = req.data.performanceScore  ?? 0;
    req.data.totalOrders       = req.data.totalOrders       ?? 0;
    req.data.onTimeDeliveries  = req.data.onTimeDeliveries  ?? 0;
    req.data.qualityScore      = req.data.qualityScore      ?? 0;
  }

  async _generateQuotationNumber(req) {
    const year = new Date().getFullYear();
    const { VendorQuotations } = this.entities;
    const result = await SELECT.one.from(VendorQuotations)
      .columns('quotationNumber')
      .orderBy('createdAt desc');

    let seq = 1;
    if (result?.quotationNumber) {
      const match = result.quotationNumber.match(/QT-\d{4}-(\d{4})$/);
      if (match) seq = parseInt(match[1]) + 1;
    }
    req.data.quotationNumber = `QT-${year}-${String(seq).padStart(4, '0')}`;
    req.data.quotationDate   = req.data.quotationDate || new Date().toISOString().slice(0, 10);
    req.data.status          = 'DRAFT';
    req.data.isSelected      = false;
    req.data.subtotal        = 0;
    req.data.taxAmount       = 0;
    req.data.totalAmount     = 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // ITEM CALCULATIONS
  // ═══════════════════════════════════════════════════════════════

  _calculateItemAmounts(req) {
    const item = req.data;
    if (item.unitPrice !== undefined && item.quotedQty !== undefined) {
      const baseAmount = parseFloat((item.quotedQty * item.unitPrice).toFixed(4));
      const taxPct     = item.taxPercent ?? 18;
      const taxAmt     = parseFloat((baseAmount * taxPct / 100).toFixed(2));
      item.taxAmount   = taxAmt;
      item.totalAmount = parseFloat((baseAmount + taxAmt).toFixed(2));
    }
  }

  async _recalculateHeader(req) {
    // Extract quotation_ID from request context
    const quotationId = req.data?.quotation_ID;
    if (!quotationId) return;

    const { VendorQuotationItems, VendorQuotations } = this.entities;
    const items = await SELECT.from(VendorQuotationItems)
      .where({ quotation_ID: quotationId });

    let subtotal  = 0;
    let taxAmount = 0;
    for (const item of items) {
      const base = parseFloat(((item.quotedQty || 0) * (item.unitPrice || 0)).toFixed(4));
      const tax  = parseFloat((base * (item.taxPercent || 18) / 100).toFixed(2));
      subtotal  += base;
      taxAmount += tax;
    }
    const totalAmount = parseFloat((subtotal + taxAmount).toFixed(2));
    await UPDATE(VendorQuotations)
      .set({ subtotal, taxAmount, totalAmount })
      .where({ ID: quotationId });
  }

  // ═══════════════════════════════════════════════════════════════
  // VENDOR ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async _activateVendor(req) {
    const { ID } = req.params[0];
    await UPDATE(this.entities.VendorMaster).set({ isActive: true }).where({ ID });
    return SELECT.one.from(this.entities.VendorMaster).where({ ID });
  }

  async _deactivateVendor(req) {
    const { ID } = req.params[0];
    await UPDATE(this.entities.VendorMaster).set({ isActive: false }).where({ ID });
    return SELECT.one.from(this.entities.VendorMaster).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // QUOTATION ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async _submitQuotation(req) {
    const { ID } = req.params[0];
    const qt = await SELECT.one.from(this.entities.VendorQuotations).where({ ID });
    if (!qt) return req.error(404, `Quotation ${ID} not found`);
    if (qt.status !== 'DRAFT') {
      return req.error(400, `Only DRAFT quotations can be submitted. Current status: ${qt.status}`);
    }
    const items = await SELECT.from(this.entities.VendorQuotationItems)
      .where({ quotation_ID: ID });
    if (!items || items.length === 0) {
      return req.error(400, 'Cannot submit quotation with no items');
    }
    if (!qt.validityDate) {
      return req.error(400, 'Validity date is mandatory before submission');
    }
    await UPDATE(this.entities.VendorQuotations)
      .set({ status: 'SUBMITTED' })
      .where({ ID });
    return SELECT.one.from(this.entities.VendorQuotations).where({ ID });
  }

  async _selectVendor(req) {
    const { ID } = req.params[0];
    const { selectionReason } = req.data;
    const qt = await SELECT.one.from(this.entities.VendorQuotations).where({ ID });
    if (!qt) return req.error(404, `Quotation ${ID} not found`);
    if (!['SUBMITTED', 'UNDER_EVALUATION'].includes(qt.status)) {
      return req.error(400, `Quotation must be SUBMITTED or UNDER_EVALUATION to select vendor`);
    }

    // Reject all other quotations for the same material request
    const siblings = await SELECT.from(this.entities.VendorQuotations)
      .where({ materialRequest_ID: qt.materialRequest_ID })
      .and({ ID: { '!=': ID } });

    for (const sibling of siblings) {
      await UPDATE(this.entities.VendorQuotations)
        .set({ status: 'REJECTED', isSelected: false })
        .where({ ID: sibling.ID });
    }

    // Select this quotation
    await UPDATE(this.entities.VendorQuotations)
      .set({ status: 'SELECTED', isSelected: true, selectionReason: selectionReason || '' })
      .where({ ID });

    return SELECT.one.from(this.entities.VendorQuotations).where({ ID });
  }

  async _rejectQuotation(req) {
    const { ID } = req.params[0];
    const { reason } = req.data;
    const qt = await SELECT.one.from(this.entities.VendorQuotations).where({ ID });
    if (!qt) return req.error(404, `Quotation ${ID} not found`);
    if (['SELECTED', 'REJECTED'].includes(qt.status)) {
      return req.error(400, `Cannot reject a ${qt.status} quotation`);
    }
    await UPDATE(this.entities.VendorQuotations)
      .set({ status: 'REJECTED', isSelected: false, commercialRemarks: reason || '' })
      .where({ ID });
    return SELECT.one.from(this.entities.VendorQuotations).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // QUOTATION COMPARISON FUNCTION
  // ═══════════════════════════════════════════════════════════════

  async _compareQuotations(req) {
    const { materialRequestId } = req.data;
    const quotations = await SELECT.from(this.entities.VendorQuotations)
      .where({ materialRequest_ID: materialRequestId })
      .and({ status: { in: ['SUBMITTED', 'UNDER_EVALUATION', 'SELECTED'] } });

    // Mark all as UNDER_EVALUATION (if submitted)
    for (const qt of quotations) {
      if (qt.status === 'SUBMITTED') {
        await UPDATE(this.entities.VendorQuotations)
          .set({ status: 'UNDER_EVALUATION' })
          .where({ ID: qt.ID });
      }
    }

    // Return enriched list sorted by total amount (ascending)
    const enriched = await SELECT.from(this.entities.VendorQuotations)
      .where({ materialRequest_ID: materialRequestId })
      .and({ status: { in: ['UNDER_EVALUATION', 'SELECTED'] } })
      .orderBy('totalAmount asc');

    return enriched;
  }
};
