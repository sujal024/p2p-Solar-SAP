'use strict';

const cds = require('@sap/cds');
const ext = require('./integration/ExternalServices');

module.exports = class InvoiceService extends cds.ApplicationService {

  async init() {
    const { Invoices, InvoiceItems, ThreeWayMatchResults } = this.entities;

    // ── AUTO-NUMBERING ────────────────────────────────────────────
    this.before('CREATE', Invoices, this._generateInvoiceNumber.bind(this));

    // ── ITEM CALCULATIONS ─────────────────────────────────────────
    this.before('CREATE', InvoiceItems, this._calculateItemAmounts.bind(this));
    this.before('UPDATE', InvoiceItems, this._calculateItemAmounts.bind(this));

    // ── HEADER TOTALS ─────────────────────────────────────────────
    this.after('CREATE', InvoiceItems, (_, req) => this._recalculateInvoiceTotals(req));
    this.after('UPDATE', InvoiceItems, (_, req) => this._recalculateInvoiceTotals(req));
    this.after('DELETE', InvoiceItems, (_, req) => this._recalculateInvoiceTotals(req));

    // ── VALIDATIONS ───────────────────────────────────────────────
    this.before('CREATE', Invoices, this._validateInvoice.bind(this));

    // ── INVOICE ACTIONS ───────────────────────────────────────────
    this.on('submitInvoice',        Invoices, this._submitInvoice.bind(this));
    this.on('performThreeWayMatch', Invoices, this._performThreeWayMatch.bind(this));
    this.on('approveInvoice',       Invoices, this._approveInvoice.bind(this));
    this.on('rejectInvoice',        Invoices, this._rejectInvoice.bind(this));
    this.on('markPaid',             Invoices, this._markPaid.bind(this));

    await super.init();
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTO-NUMBERING
  // ═══════════════════════════════════════════════════════════════

  async _generateInvoiceNumber(req) {
    const year = new Date().getFullYear();
    const result = await SELECT.one.from(this.entities.Invoices)
      .columns('invoiceNumber')
      .orderBy('createdAt desc');

    let seq = 1;
    if (result?.invoiceNumber) {
      const match = result.invoiceNumber.match(/INV-\d{4}-(\d{4})$/);
      if (match) seq = parseInt(match[1]) + 1;
    }
    req.data.invoiceNumber = `INV-${year}-${String(seq).padStart(4, '0')}`;
    req.data.invoiceDate   = req.data.invoiceDate || new Date().toISOString().slice(0, 10);
    req.data.status        = 'DRAFT';
    req.data.subtotal      = 0;
    req.data.taxAmount     = 0;
    req.data.totalAmount   = 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // VALIDATIONS
  // ═══════════════════════════════════════════════════════════════

  async _validateInvoice(req) {
    const inv = req.data;
    if (!inv.vendorInvoiceNo) {
      return req.error(400, 'Vendor Invoice Number is mandatory', 'vendorInvoiceNo');
    }
    if (!inv.purchaseOrder_ID) {
      return req.error(400, 'Purchase Order reference is mandatory', 'purchaseOrder_ID');
    }
    // Check for duplicate vendor invoice number
    const { Invoices } = this.entities;
    const existing = await SELECT.one.from(Invoices)
      .where({ vendorInvoiceNo: inv.vendorInvoiceNo, vendor_ID: inv.vendor_ID });
    if (existing) {
      return req.error(400,
        `Vendor invoice ${inv.vendorInvoiceNo} already exists for this vendor`,
        'vendorInvoiceNo'
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CALCULATIONS
  // ═══════════════════════════════════════════════════════════════

  _calculateItemAmounts(req) {
    const item = req.data;
    if (item.invoicedQty !== undefined && item.unitPrice !== undefined) {
      const base       = parseFloat((item.invoicedQty * item.unitPrice).toFixed(4));
      const taxPct     = item.taxPercent ?? 18;
      item.taxAmount   = parseFloat((base * taxPct / 100).toFixed(2));
      item.totalAmount = parseFloat((base + item.taxAmount).toFixed(2));
    }
  }

  async _recalculateInvoiceTotals(req) {
    const invoiceId = req.data?.invoice_ID;
    if (!invoiceId) return;

    const { InvoiceItems, Invoices } = this.entities;
    const items = await SELECT.from(InvoiceItems).where({ invoice_ID: invoiceId });

    let subtotal  = 0;
    let taxAmount = 0;
    for (const item of items) {
      const base = parseFloat(((item.invoicedQty || 0) * (item.unitPrice || 0)).toFixed(4));
      const tax  = parseFloat((base * (item.taxPercent || 18) / 100).toFixed(2));
      subtotal  += base;
      taxAmount += tax;
    }
    await UPDATE(Invoices)
      .set({
        subtotal,
        taxAmount,
        totalAmount: parseFloat((subtotal + taxAmount).toFixed(2))
      })
      .where({ ID: invoiceId });
  }

  // ═══════════════════════════════════════════════════════════════
  // INVOICE ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async _submitInvoice(req) {
    const { ID } = req.params[0];
    const inv = await SELECT.one.from(this.entities.Invoices).where({ ID });
    if (!inv) return req.error(404, `Invoice ${ID} not found`);
    if (inv.status !== 'DRAFT') {
      return req.error(400, `Only DRAFT invoices can be submitted. Current: ${inv.status}`);
    }
    const items = await SELECT.from(this.entities.InvoiceItems).where({ invoice_ID: ID });
    if (!items || items.length === 0) {
      return req.error(400, 'Cannot submit invoice with no line items');
    }
    await UPDATE(this.entities.Invoices)
      .set({ status: 'SUBMITTED' })
      .where({ ID });
    return SELECT.one.from(this.entities.Invoices).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // THREE-WAY MATCH ENGINE
  // ═══════════════════════════════════════════════════════════════

  async _performThreeWayMatch(req) {
    const { ID } = req.params[0];
    const inv = await SELECT.one.from(this.entities.Invoices).where({ ID });
    if (!inv) return req.error(404, `Invoice ${ID} not found`);
    if (!['SUBMITTED', 'UNDER_REVIEW', 'MISMATCH'].includes(inv.status)) {
      return req.error(400, `Cannot run three-way match on invoice in status: ${inv.status}`);
    }
    if (!inv.receipt_ID) {
      return req.error(400, 'Invoice must be linked to a Material Receipt (GRN) before three-way match');
    }

    // Load invoice items
    const invItems = await SELECT.from(this.entities.InvoiceItems)
      .where({ invoice_ID: ID });

    // Load PO items
    const { PurchaseOrderItems } = cds.entities('solar.epc');
    const poItems = await SELECT.from(PurchaseOrderItems)
      .where({ purchaseOrder_ID: inv.purchaseOrder_ID });

    // Load receipt items — prefer CAP local, fall back to RAP GRN
    const { MaterialReceiptItems, PurchaseOrders } = cds.entities('solar.epc');
    let receiptItems = await SELECT.from(MaterialReceiptItems)
      .where({ receipt_ID: inv.receipt_ID });

    if (!receiptItems || receiptItems.length === 0) {
      // ── ONE-WAY PULL: CAP ← RAP (GRN data for 3-way match) ──────
      const po  = await SELECT.one.from(PurchaseOrders).where({ ID: inv.purchaseOrder_ID });
      const grn = po?.poNumber ? await ext.fetchGRNFromRAP(po.poNumber) : null;
      if (grn?.Items?.length > 0) {
        receiptItems = grn.Items.map(i => ({
          material_ID : i.MaterialCode,   // best-effort field mapping
          acceptedQty : i.AcceptedQty || i.ReceivedQty || 0,
          poItem_ID   : null
        }));
      }
    }

    // Clear previous match results
    const { ThreeWayMatchResults } = this.entities;
    await DELETE.from(ThreeWayMatchResults).where({ invoice_ID: ID });

    let overallMatchStatus = 'MATCHED';
    const matchRecords     = [];

    for (const invItem of invItems) {
      // Find corresponding PO item
      const poItem = poItems.find(p =>
        p.ID === invItem.poItem_ID || p.material_ID === invItem.material_ID
      );
      // Find corresponding receipt item
      const receiptItem = receiptItems.find(r =>
        r.material_ID === invItem.material_ID ||
        (poItem && r.poItem_ID === poItem.ID)
      );

      const poQty       = poItem?.orderedQty     || 0;
      const receivedQty = receiptItem?.acceptedQty || 0;
      const invoicedQty = invItem.invoicedQty     || 0;
      const poPrice     = poItem?.unitPrice        || 0;
      const invPrice    = invItem.unitPrice        || 0;

      // Tolerance thresholds
      const QTY_TOLERANCE   = 0.001;
      const PRICE_TOLERANCE = 0.01;  // 1 paisa

      const qtyDeviation   = Math.abs(invoicedQty - receivedQty);
      const priceDeviation = Math.abs(invPrice - poPrice);

      const qtyMatched   = qtyDeviation   <= QTY_TOLERANCE;
      const priceMatched = priceDeviation <= PRICE_TOLERANCE;

      let quantityMatch, priceMatch, lineStatus;

      if (qtyMatched && priceMatched) {
        quantityMatch = 'MATCHED';
        priceMatch    = 'MATCHED';
        lineStatus    = 'MATCHED';
      } else if (!qtyMatched && !priceMatched) {
        quantityMatch = 'QUANTITY_MISMATCH';
        priceMatch    = 'PRICE_MISMATCH';
        lineStatus    = 'BOTH_MISMATCH';
        overallMatchStatus = 'BOTH_MISMATCH';
      } else if (!qtyMatched) {
        quantityMatch = 'QUANTITY_MISMATCH';
        priceMatch    = 'MATCHED';
        lineStatus    = 'QUANTITY_MISMATCH';
        if (overallMatchStatus === 'MATCHED') overallMatchStatus = 'QUANTITY_MISMATCH';
      } else {
        quantityMatch = 'MATCHED';
        priceMatch    = 'PRICE_MISMATCH';
        lineStatus    = 'PRICE_MISMATCH';
        if (overallMatchStatus === 'MATCHED') overallMatchStatus = 'PRICE_MISMATCH';
      }

      const qtyVariance   = parseFloat((invoicedQty - receivedQty).toFixed(3));
      const priceVariance = parseFloat((invPrice - poPrice).toFixed(4));
      const valueVariance = parseFloat((qtyVariance * invPrice).toFixed(2));

      matchRecords.push({
        ID              : cds.utils.uuid(),
        invoice_ID      : ID,
        purchaseOrder_ID: inv.purchaseOrder_ID,
        receipt_ID      : inv.receipt_ID,
        invoiceItem_ID  : invItem.ID,
        poItem_ID       : poItem?.ID       || null,
        receiptItem_ID  : receiptItem?.ID  || null,
        material_ID     : invItem.material_ID,
        poQty,
        receivedQty,
        invoicedQty,
        poUnitPrice     : poPrice,
        invoiceUnitPrice: invPrice,
        quantityMatch,
        priceMatch,
        overallStatus   : lineStatus,
        qtyVariance,
        priceVariance,
        valueVariance,
        remarks         : this._buildMatchRemarks(qtyVariance, priceVariance)
      });
    }

    // Insert all match results
    await INSERT.into(ThreeWayMatchResults).entries(matchRecords);

    // Update invoice status based on match result
    const invoiceStatus = (overallMatchStatus === 'MATCHED') ? 'MATCHED' : 'MISMATCH';
    await UPDATE(this.entities.Invoices)
      .set({ status: invoiceStatus })
      .where({ ID });

    return SELECT.one.from(this.entities.Invoices).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // APPROVE / REJECT / MARK PAID
  // ═══════════════════════════════════════════════════════════════

  async _approveInvoice(req) {
    const { ID } = req.params[0];
    const inv = await SELECT.one.from(this.entities.Invoices).where({ ID });
    if (!inv) return req.error(404, `Invoice ${ID} not found`);
    if (!['MATCHED', 'MISMATCH', 'UNDER_REVIEW'].includes(inv.status)) {
      return req.error(400, `Invoice must be MATCHED or UNDER_REVIEW to approve. Current: ${inv.status}`);
    }
    await UPDATE(this.entities.Invoices)
      .set({ status: 'APPROVED', approvalDate: new Date().toISOString() })
      .where({ ID });

    // Update project spent amount
    await this._updateProjectSpentAmount(inv.purchaseOrder_ID, inv.totalAmount);

    // Update vendor performance score
    await this._updateVendorInvoiceScore(inv.vendor_ID, true);

    // ── ONE-WAY PUSH: CAP → SEGW (mark delivery INVOICED) ────────
    const { PurchaseOrders } = cds.entities('solar.epc');
    const po = await SELECT.one.from(PurchaseOrders).where({ ID: inv.purchaseOrder_ID });
    if (po?.poNumber) {
      ext.patchDeliveryToInvoicedInSEGW(po.poNumber).catch(() => {});
    }

    return SELECT.one.from(this.entities.Invoices).where({ ID });
  }

  async _rejectInvoice(req) {
    const { ID } = req.params[0];
    const { reason } = req.data;
    if (!reason) return req.error(400, 'Rejection reason is mandatory');
    const inv = await SELECT.one.from(this.entities.Invoices).where({ ID });
    if (!inv) return req.error(404, `Invoice ${ID} not found`);
    if (['PAID', 'REJECTED'].includes(inv.status)) {
      return req.error(400, `Cannot reject invoice in status: ${inv.status}`);
    }
    await UPDATE(this.entities.Invoices)
      .set({ status: 'REJECTED', rejectionReason: reason })
      .where({ ID });
    await this._updateVendorInvoiceScore(inv.vendor_ID, false);
    return SELECT.one.from(this.entities.Invoices).where({ ID });
  }

  async _markPaid(req) {
    const { ID } = req.params[0];
    const { paymentReference, paymentDate } = req.data;
    if (!paymentReference) return req.error(400, 'Payment reference is mandatory', 'paymentReference');
    const inv = await SELECT.one.from(this.entities.Invoices).where({ ID });
    if (!inv) return req.error(404, `Invoice ${ID} not found`);
    if (inv.status !== 'APPROVED') {
      return req.error(400, `Only APPROVED invoices can be marked as paid. Current: ${inv.status}`);
    }
    await UPDATE(this.entities.Invoices)
      .set({
        status          : 'PAID',
        paymentReference,
        paymentDate     : paymentDate || new Date().toISOString().slice(0, 10)
      })
      .where({ ID });
    return SELECT.one.from(this.entities.Invoices).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════

  _buildMatchRemarks(qtyVariance, priceVariance) {
    const parts = [];
    if (Math.abs(qtyVariance) > 0.001) {
      parts.push(`Qty variance: ${qtyVariance > 0 ? '+' : ''}${qtyVariance}`);
    }
    if (Math.abs(priceVariance) > 0.01) {
      parts.push(`Price variance: ${priceVariance > 0 ? '+' : ''}${priceVariance}`);
    }
    return parts.length > 0 ? parts.join('; ') : 'Fully matched';
  }

  async _updateProjectSpentAmount(poId, amount) {
    if (!poId || !amount) return;
    const { PurchaseOrders } = cds.entities('solar.epc');
    const po = await SELECT.one.from(PurchaseOrders).where({ ID: poId });
    if (!po?.project_ID) return;
    const { Projects } = cds.entities('solar.epc');
    await UPDATE(Projects)
      .set({ spentAmount: { '+=': amount } })
      .where({ ID: po.project_ID });
  }

  async _updateVendorInvoiceScore(vendorId, accurate) {
    if (!vendorId) return;
    const { VendorMaster } = cds.entities('solar.epc');
    const vendor = await SELECT.one.from(VendorMaster).where({ ID: vendorId });
    if (!vendor) return;
    // Adjust performance score: +0.2 for accurate invoice, -0.3 for inaccurate
    const delta    = accurate ? 0.2 : -0.3;
    const newScore = parseFloat(
      Math.min(10, Math.max(0, (vendor.performanceScore || 5) + delta)).toFixed(2)
    );
    await UPDATE(VendorMaster)
      .set({ performanceScore: newScore })
      .where({ ID: vendorId });
  }
};
