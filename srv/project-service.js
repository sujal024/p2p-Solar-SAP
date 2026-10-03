'use strict';

const cds = require('@sap/cds');

module.exports = class ProjectService extends cds.ApplicationService {

  async init() {
    const {
      Projects,
      ActiveProjects,
      SeniorActiveProjects,
      MaterialRequests,
      ActiveProjects_MaterialRequests,
      SeniorActiveProjects_MaterialRequests,
      ApprovedMaterialRequests,
      MaterialRequestItems,
      ActiveProjects_MaterialRequestItems,
      SeniorActiveProjects_MaterialRequestItems,
      BOQItems,
      ActiveProjects_BOQItems,
      SeniorActiveProjects_BOQItems,
      VendorMaster,
      PurchaseOrders,
      PurchaseOrderItems,
      Deliveries,
      DeliveryItems,
      GRNReceipts,
      GRNReceiptAnalytics,
      Invoices,
      InvoiceItems,
      ThreeWayMatchResults
    } = this.entities;

    // ── AUTO-NUMBERING ────────────────────────────────────────────
    this.before('CREATE', Projects, this._generateProjectCode.bind(this));
    this.before('CREATE', MaterialRequests, this._generateRequestNumber.bind(this));
    this.before('CREATE', ActiveProjects_MaterialRequests, this._generateRequestNumber.bind(this));
    this.before('CREATE', SeniorActiveProjects_MaterialRequests, this._generateRequestNumber.bind(this));
    this.before('CREATE', VendorMaster, this._generateVendorCode.bind(this));
    this.before('CREATE', Invoices, this._generateInvoiceNumber.bind(this));

    // ── DERIVED FIELD CALCULATION ────────────────────────────────
    this.before('CREATE', MaterialRequestItems, this._validateRequestItem.bind(this));
    this.before('CREATE', ActiveProjects_MaterialRequestItems, this._validateRequestItem.bind(this));
    this.before('CREATE', SeniorActiveProjects_MaterialRequestItems, this._validateRequestItem.bind(this));
    this.before('SAVE', BOQItems, this._calculateBOQValue.bind(this));
    this.before('SAVE', ActiveProjects_BOQItems, this._calculateBOQValue.bind(this));
    this.before('SAVE', SeniorActiveProjects_BOQItems, this._calculateBOQValue.bind(this));
    this.before('CREATE', Invoices, this._validateInvoice.bind(this));
    this.before(['CREATE', 'UPDATE'], InvoiceItems, this._calculateInvoiceItemAmounts.bind(this));
    this.after(['CREATE', 'UPDATE', 'DELETE'], InvoiceItems, (_, req) => this._recalculateInvoiceTotals(req));

    // ── BUSINESS GATING ──────────────────────────────────────────
    this.before(['CREATE', 'UPDATE', 'DELETE'], BOQItems, this._checkProjectActiveGate.bind(this));
    this.before(['CREATE', 'UPDATE', 'DELETE'], ActiveProjects_BOQItems, this._checkProjectActiveGate.bind(this));
    this.before(['CREATE', 'UPDATE', 'DELETE'], MaterialRequests, this._checkProjectActiveGate.bind(this));
    this.before(['CREATE', 'UPDATE', 'DELETE'], ActiveProjects_MaterialRequests, this._checkProjectActiveGate.bind(this));
    this.before(['CREATE', 'UPDATE', 'DELETE'], SeniorActiveProjects_MaterialRequests, this._checkProjectActiveGate.bind(this));
    // ── DRAFT ACTIVATION — bypass gate checks for ActiveProjects draft ──
    // Must use `before` (not `on`) so the flag is set BEFORE CAP fires the
    // internal before-UPDATE hooks.
    this.before('draftActivate', ActiveProjects, this._handleDraftActivate.bind(this));
    this.before('draftActivate', SeniorActiveProjects, this._handleDraftActivate.bind(this));

    // ── PROJECT ACTIONS ───────────────────────────────────────────
    this.on('activateProject', Projects, this._activateProject.bind(this));
    this.on('putOnHold', Projects, this._putProjectOnHold.bind(this));
    this.on('completeProject', Projects, this._completeProject.bind(this));
    this.on('cancelProject', Projects, this._cancelProject.bind(this));

    // ── MATERIAL REQUEST ACTIONS (all entity paths) ───────────────
    // submitRequest is also called through the draft composition path
    // (ActiveProjects.drafts/materialRequests) so register without entity too.
    const mrEntities = [MaterialRequests, ActiveProjects_MaterialRequests, SeniorActiveProjects_MaterialRequests];
    for (const entity of mrEntities) {
      this.on('submitRequest', entity, this._submitRequest.bind(this));
      this.on('approveRequest', entity, this._approveRequest.bind(this));
      this.on('rejectRequest', entity, this._rejectRequest.bind(this));
      this.on('closeRequest', entity, this._closeRequest.bind(this));
    }
    this.on('submitRequest', this._submitRequest.bind(this));

    // ── VENDOR MASTER ACTIONS ─────────────────────────────────────
    this.on('activateVendor', VendorMaster, this._activateVendor.bind(this));
    this.on('deactivateVendor', VendorMaster, this._deactivateVendor.bind(this));

    // ── PURCHASE ORDER ACTIONS ─────────────────────────────────
    this.before('CREATE', PurchaseOrders, this._generatePONumber.bind(this));
    this.on('confirmPO', PurchaseOrders, this._confirmPO.bind(this));
    this.on('cancelPO', PurchaseOrders, this._cancelPO.bind(this));
    this.on('closePO', PurchaseOrders, this._closePO.bind(this));

    // ── DELIVERIES (ABAP SEGW proxy) ────────────────────────────
    // Same pattern as GRN: READ proxies to SEGW, draft reads fall through to SQLite.
    // draftActivate POSTs to SEGW; update/delete PATCH/DELETE SEGW then local SQLite.
    const segwSvc = await cds.connect.to('SEGW_DELIVERY_SRV');
    segwSvc.before('READ', (req) => {
      const cols = req.query?.SELECT?.columns;
      if (cols && cols.some(c => c?.ref?.[0] === 'DraftMessages')) {
        req.reply([]); // lean-draft DraftMessages query — SEGW doesn’t have it
      }
    });
    this.on('READ',          Deliveries, this._deliveryRead.bind(this));
    this.on('CREATE',        Deliveries, this._deliveryCreate.bind(this));
    this.on('UPDATE',        Deliveries, this._deliveryUpdate.bind(this));
    this.on('DELETE',        Deliveries, this._deliveryDelete.bind(this));
    this.on('draftActivate', Deliveries, this._deliveryDraftActivate.bind(this));
    this.on('markInTransit', Deliveries, this._markInTransit.bind(this));
    this.on('markDelivered', Deliveries, this._markDelivered.bind(this));
    this.on('markDelayed', Deliveries, this._markDelayed.bind(this));

    // ── GRN RECEIPTS (ABAP proxy) ────────────────────────────────
    // READ proxies to ABAP for active entities; draft reads fall through to SQLite.
    // DraftMessages sub-queries from lean-draft are silently intercepted on RAP_SERVICE.
    const rapSvc = await cds.connect.to('RAP_SERVICE');
    rapSvc.before('READ', (req) => {
      const cols = req.query?.SELECT?.columns;
      if (cols && cols.some(c => c?.ref?.[0] === 'DraftMessages')) {
        req.reply([]); // lean-draft DraftMessages query — ABAP doesn’t have it, return empty
      }
    });
    this.on('READ',          GRNReceipts, this._grnRead.bind(this));
    this.on('CREATE',        GRNReceipts, this._grnCreate.bind(this));
    this.on('UPDATE',        GRNReceipts, this._grnUpdate.bind(this));
    this.on('DELETE',        GRNReceipts, this._grnDelete.bind(this));
    this.on('draftActivate', GRNReceipts, this._grnDraftActivate.bind(this));
    this.on('verifyReceipt', GRNReceipts, this._grnVerify.bind(this));
    this.on('rejectReceipt', GRNReceipts, this._grnReject.bind(this));

    // GRNReceiptAnalytics — CAP 9 handles $apply groupby/aggregate natively on SQLite.

    // ── INVOICE ACTIONS ───────────────────────────────────────────
    this.on('submitInvoice', Invoices, this._submitInvoice.bind(this));
    this.on('performThreeWayMatch', Invoices, this._performThreeWayMatch.bind(this));
    this.on('approveInvoice', Invoices, this._approveInvoice.bind(this));
    this.on('rejectInvoice', Invoices, this._rejectInvoice.bind(this));
    this.on('markPaid', Invoices, this._markPaid.bind(this));

    // ── POST-READ ENRICHMENT ──────────────────────────────────────
    this.after('READ', Projects, this._enrichProjects.bind(this));
    this.after('READ', ActiveProjects, this._enrichProjects.bind(this));
    this.after('READ', SeniorActiveProjects, this._enrichProjects.bind(this));
    this.after('READ', MaterialRequests, this._enrichRequests.bind(this));
    this.after('READ', ActiveProjects_MaterialRequests, this._enrichRequests.bind(this));
    this.after('READ', SeniorActiveProjects_MaterialRequests, this._enrichRequests.bind(this));
    this.after('READ', ApprovedMaterialRequests, this._enrichRequests.bind(this));

    await super.init();
  }

  // ═══════════════════════════════════════════════════════════════
  // VENDOR MASTER
  // ═══════════════════════════════════════════════════════════════

  async _generateVendorCode(req) {
    if (req.data.vendorCode) return;
    const year = new Date().getFullYear();
    const result = await SELECT.one.from(this.entities.VendorMaster)
      .columns('vendorCode').orderBy('createdAt desc');
    let seq = 1;
    if (result?.vendorCode) {
      const match = result.vendorCode.match(/VND-\d{4}-(\d{4})$/);
      if (match) seq = parseInt(match[1]) + 1;
    }
    req.data.vendorCode = `VND-${year}-${String(seq).padStart(4, '0')}`;
    req.data.isActive = req.data.isActive ?? true;
    req.data.performanceScore = req.data.performanceScore ?? 0;
    req.data.totalOrders = req.data.totalOrders ?? 0;
    req.data.onTimeDeliveries = req.data.onTimeDeliveries ?? 0;
    req.data.qualityScore = req.data.qualityScore ?? 0;
  }

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
  // INVOICE — AUTO-NUMBERING & VALIDATION
  // ═══════════════════════════════════════════════════════════════

  async _generateInvoiceNumber(req) {
    if (req.data.invoiceNumber) return;
    const year = new Date().getFullYear();
    const result = await SELECT.one.from(this.entities.Invoices)
      .columns('invoiceNumber').orderBy('createdAt desc');
    let seq = 1;
    if (result?.invoiceNumber) {
      const match = result.invoiceNumber.match(/INV-\d{4}-(\d{4})$/);
      if (match) seq = parseInt(match[1]) + 1;
    }
    req.data.invoiceNumber = `INV-${year}-${String(seq).padStart(4, '0')}`;
    req.data.invoiceDate = req.data.invoiceDate || new Date().toISOString().slice(0, 10);
    req.data.status = 'DRAFT';
    req.data.subtotal = 0;
    req.data.taxAmount = 0;
    req.data.totalAmount = 0;
  }

  async _validateInvoice(req) {
    const inv = req.data;
    if (!inv.vendorInvoiceNo) return req.error(400, 'Vendor Invoice Number is mandatory', 'vendorInvoiceNo');
    if (!inv.purchaseOrder_ID) return req.error(400, 'Purchase Order reference is mandatory', 'purchaseOrder_ID');
    const existing = await SELECT.one.from(this.entities.Invoices)
      .where({ vendorInvoiceNo: inv.vendorInvoiceNo, vendor_ID: inv.vendor_ID });
    if (existing) return req.error(400, `Vendor invoice ${inv.vendorInvoiceNo} already exists for this vendor`, 'vendorInvoiceNo');
  }

  _calculateInvoiceItemAmounts(req) {
    const item = req.data;
    if (item.invoicedQty !== undefined && item.unitPrice !== undefined) {
      const base = parseFloat((item.invoicedQty * item.unitPrice).toFixed(4));
      const taxPct = item.taxPercent ?? 18;
      item.taxAmount = parseFloat((base * taxPct / 100).toFixed(2));
      item.totalAmount = parseFloat((base + item.taxAmount).toFixed(2));
    }
  }

  async _recalculateInvoiceTotals(req) {
    const invoiceId = req.data?.invoice_ID;
    if (!invoiceId) return;
    const items = await SELECT.from(this.entities.InvoiceItems).where({ invoice_ID: invoiceId });
    let subtotal = 0, taxAmount = 0;
    for (const item of items) {
      const base = parseFloat(((item.invoicedQty || 0) * (item.unitPrice || 0)).toFixed(4));
      const tax = parseFloat((base * (item.taxPercent || 18) / 100).toFixed(2));
      subtotal += base;
      taxAmount += tax;
    }
    await UPDATE(this.entities.Invoices)
      .set({ subtotal, taxAmount, totalAmount: parseFloat((subtotal + taxAmount).toFixed(2)) })
      .where({ ID: invoiceId });
  }

  // ═══════════════════════════════════════════════════════════════
  // INVOICE ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async _submitInvoice(req) {
    const { ID } = req.params[0];
    const inv = await SELECT.one.from(this.entities.Invoices).where({ ID });
    if (!inv) return req.error(404, `Invoice ${ID} not found`);
    if (inv.status !== 'DRAFT') return req.error(400, `Only DRAFT invoices can be submitted. Current: ${inv.status}`);
    const items = await SELECT.from(this.entities.InvoiceItems).where({ invoice_ID: ID });
    if (!items?.length) return req.error(400, 'Cannot submit invoice with no line items');
    await UPDATE(this.entities.Invoices).set({ status: 'SUBMITTED' }).where({ ID });
    return SELECT.one.from(this.entities.Invoices).where({ ID });
  }

  async _performThreeWayMatch(req) {
    const { ID } = req.params[0];
    const inv = await SELECT.one.from(this.entities.Invoices).where({ ID });
    if (!inv) return req.error(404, `Invoice ${ID} not found`);
    if (!['SUBMITTED', 'UNDER_REVIEW', 'MISMATCH'].includes(inv.status))
      return req.error(400, `Cannot run three-way match on invoice in status: ${inv.status}`);
    if (!inv.receipt_ID) return req.error(400, 'Invoice must be linked to a Material Receipt before three-way match');

    const invItems = await SELECT.from(this.entities.InvoiceItems).where({ invoice_ID: ID });
    const poItems = await SELECT.from(cds.entities('solar.epc').PurchaseOrderItems).where({ purchaseOrder_ID: inv.purchaseOrder_ID });
    const receiptItems = await SELECT.from(cds.entities('solar.epc').MaterialReceiptItems).where({ receipt_ID: inv.receipt_ID });

    await DELETE.from(this.entities.ThreeWayMatchResults).where({ invoice_ID: ID });

    let overallStatus = 'MATCHED';
    const records = [];

    for (const invItem of invItems) {
      const poItem = poItems.find(p => p.ID === invItem.poItem_ID || p.material_ID === invItem.material_ID);
      const receiptItem = receiptItems.find(r => r.material_ID === invItem.material_ID || (poItem && r.poItem_ID === poItem.ID));

      const poQty = poItem?.orderedQty || 0;
      const receivedQty = receiptItem?.acceptedQty || 0;
      const invoicedQty = invItem.invoicedQty || 0;
      const poPrice = poItem?.unitPrice || 0;
      const invPrice = invItem.unitPrice || 0;

      const qtyOk = Math.abs(invoicedQty - receivedQty) <= 0.001;
      const priceOk = Math.abs(invPrice - poPrice) <= 0.01;

      const quantityMatch = qtyOk ? 'MATCHED' : 'QUANTITY_MISMATCH';
      const priceMatch = priceOk ? 'MATCHED' : 'PRICE_MISMATCH';
      let lineStatus;
      if (qtyOk && priceOk) { lineStatus = 'MATCHED'; }
      else if (!qtyOk && !priceOk) { lineStatus = 'BOTH_MISMATCH'; overallStatus = 'BOTH_MISMATCH'; }
      else if (!qtyOk) { lineStatus = 'QUANTITY_MISMATCH'; if (overallStatus === 'MATCHED') overallStatus = 'QUANTITY_MISMATCH'; }
      else { lineStatus = 'PRICE_MISMATCH'; if (overallStatus === 'MATCHED') overallStatus = 'PRICE_MISMATCH'; }

      const qtyVariance = parseFloat((invoicedQty - receivedQty).toFixed(3));
      const priceVariance = parseFloat((invPrice - poPrice).toFixed(4));
      records.push({
        ID: cds.utils.uuid(), invoice_ID: ID,
        purchaseOrder_ID: inv.purchaseOrder_ID, receipt_ID: inv.receipt_ID,
        invoiceItem_ID: invItem.ID, poItem_ID: poItem?.ID || null, receiptItem_ID: receiptItem?.ID || null,
        material_ID: invItem.material_ID, poQty, receivedQty, invoicedQty,
        poUnitPrice: poPrice, invoiceUnitPrice: invPrice,
        quantityMatch, priceMatch, overallStatus: lineStatus,
        qtyVariance, priceVariance,
        valueVariance: parseFloat((qtyVariance * invPrice).toFixed(2)),
        remarks: [Math.abs(qtyVariance) > 0.001 && `Qty variance: ${qtyVariance}`, Math.abs(priceVariance) > 0.01 && `Price variance: ${priceVariance}`].filter(Boolean).join('; ') || 'Fully matched'
      });
    }

    await INSERT.into(this.entities.ThreeWayMatchResults).entries(records);
    const invoiceStatus = overallStatus === 'MATCHED' ? 'MATCHED' : 'MISMATCH';
    await UPDATE(this.entities.Invoices).set({ status: invoiceStatus }).where({ ID });
    return SELECT.one.from(this.entities.Invoices).where({ ID });
  }

  async _approveInvoice(req) {
    const { ID } = req.params[0];
    const inv = await SELECT.one.from(this.entities.Invoices).where({ ID });
    if (!inv) return req.error(404, `Invoice ${ID} not found`);
    if (!['MATCHED', 'MISMATCH', 'UNDER_REVIEW'].includes(inv.status))
      return req.error(400, `Invoice must be MATCHED or UNDER_REVIEW to approve. Current: ${inv.status}`);
    await UPDATE(this.entities.Invoices).set({ status: 'APPROVED', approvalDate: new Date().toISOString() }).where({ ID });
    // Update project spent amount
    const po = await SELECT.one.from(cds.entities('solar.epc').PurchaseOrders).where({ ID: inv.purchaseOrder_ID });
    if (po?.project_ID) await UPDATE(cds.entities('solar.epc').Projects).set({ spentAmount: { '+=': inv.totalAmount } }).where({ ID: po.project_ID });
    // Update vendor performance
    const vm = await SELECT.one.from(cds.entities('solar.epc').VendorMaster).where({ ID: inv.vendor_ID });
    if (vm) await UPDATE(cds.entities('solar.epc').VendorMaster).set({ performanceScore: parseFloat(Math.min(10, (vm.performanceScore || 5) + 0.2).toFixed(2)) }).where({ ID: inv.vendor_ID });
    return SELECT.one.from(this.entities.Invoices).where({ ID });
  }

  async _rejectInvoice(req) {
    const { ID } = req.params[0];
    const { reason } = req.data;
    if (!reason) return req.error(400, 'Rejection reason is mandatory');
    const inv = await SELECT.one.from(this.entities.Invoices).where({ ID });
    if (!inv) return req.error(404, `Invoice ${ID} not found`);
    if (['PAID', 'REJECTED'].includes(inv.status)) return req.error(400, `Cannot reject invoice in status: ${inv.status}`);
    await UPDATE(this.entities.Invoices).set({ status: 'REJECTED', rejectionReason: reason }).where({ ID });
    const vm = await SELECT.one.from(cds.entities('solar.epc').VendorMaster).where({ ID: inv.vendor_ID });
    if (vm) await UPDATE(cds.entities('solar.epc').VendorMaster).set({ performanceScore: parseFloat(Math.max(0, (vm.performanceScore || 5) - 0.3).toFixed(2)) }).where({ ID: inv.vendor_ID });
    return SELECT.one.from(this.entities.Invoices).where({ ID });
  }

  async _markPaid(req) {
    const { ID } = req.params[0];
    const { paymentReference, paymentDate } = req.data;
    if (!paymentReference) return req.error(400, 'Payment reference is mandatory', 'paymentReference');
    const inv = await SELECT.one.from(this.entities.Invoices).where({ ID });
    if (!inv) return req.error(404, `Invoice ${ID} not found`);
    if (inv.status !== 'APPROVED') return req.error(400, `Only APPROVED invoices can be marked as paid. Current: ${inv.status}`);
    await UPDATE(this.entities.Invoices).set({ status: 'PAID', paymentReference, paymentDate: paymentDate || new Date().toISOString().slice(0, 10) }).where({ ID });
    return SELECT.one.from(this.entities.Invoices).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTO-NUMBERING
  // ═══════════════════════════════════════════════════════════════

  async _generateProjectCode(req) {
    const year = new Date().getFullYear();
    const { Projects } = this.entities;
    const result = await SELECT.one.from(Projects)
      .columns('projectCode')
      .orderBy('createdAt desc');

    let seq = 1;
    if (result?.projectCode) {
      const match = result.projectCode.match(/PRJ-\d{4}-(\d{4})$/);
      if (match) seq = parseInt(match[1]) + 1;
    }
    req.data.projectCode = `PRJ-${year}-${String(seq).padStart(4, '0')}`;
    req.data.requestDate = req.data.requestDate || new Date().toISOString().slice(0, 10);
    req.data.status = 'DRAFT';
    req.data.spentAmount = 0;
  }

  async _generateRequestNumber(req) {
    const year = new Date().getFullYear();
    const { MaterialRequests } = this.entities;
    const result = await SELECT.one.from(MaterialRequests)
      .columns('requestNumber')
      .orderBy('createdAt desc');

    let seq = 1;
    if (result?.requestNumber) {
      const match = result.requestNumber.match(/MR-\d{4}-(\d{4})$/);
      if (match) seq = parseInt(match[1]) + 1;
    }
    req.data.requestNumber = `MR-${year}-${String(seq).padStart(4, '0')}`;
    req.data.requestDate = req.data.requestDate || new Date().toISOString().slice(0, 10);
    req.data.status = 'DRAFT';
    req.data.priority = req.data.priority || 'MEDIUM';

    // Auto-fill requestedBy from the logged-in user
    if (!req.data.requestedBy_ID && req.user?.id) {
      const { Users } = this.entities;
      const user = await SELECT.one.from(Users).where({ userName: req.user.id });
      if (user) req.data.requestedBy_ID = user.ID;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VALIDATIONS
  // ═══════════════════════════════════════════════════════════════

  async _checkProjectActiveGate(req) {
    let project_ID = req.data?.project_ID;

    // If project_ID is not in the payload (e.g. UPDATE/DELETE without providing it), fetch it from DB
    if (!project_ID) {
      const ID = req.data?.ID || (req.params && req.params[0]?.ID);
      if (!ID) return; // Might be a deep insert inherited from parent

      const record = await SELECT.one.from(req.target).where({ ID });
      if (record) project_ID = record.project_ID || record.project_ID;
    }

    if (project_ID) {
      const project = await SELECT.one.from(this.entities.Projects).where({ ID: project_ID });
      if (project && project.status !== 'ACTIVE') {
        return req.error(403, `Action blocked: Engineering activities are only allowed when the Project is ACTIVE. Current status is ${project.status}.`);
      }
    }
  }

  async _validateRequestItem(req) {
    const item = req.data;
    if (!item.requestedQty || item.requestedQty <= 0) {
      req.error(400, 'Requested quantity must be greater than zero', 'requestedQty');
    }
    if (!item.material_ID) {
      req.error(400, 'Material is mandatory', 'material_ID');
    }

    // Auto-assign line number for new items
    if (!item.lineNumber && item.request_ID) {
      const existing = await SELECT.from(this.entities.MaterialRequestItems)
        .where({ request_ID: item.request_ID });
      item.lineNumber = (existing?.length || 0) + 1;
    }

    // Compute estimated value from rate × qty
    if (item.estimatedRate && item.requestedQty) {
      item.estimatedValue = parseFloat((item.estimatedRate * item.requestedQty).toFixed(2));
    }
    // Check BOQ availability if linked
    if (item.boqItem_ID) {
      const { BOQItems } = this.entities;
      const boq = await SELECT.one.from(BOQItems).where({ ID: item.boqItem_ID });
      if (boq) {
        const available = boq.plannedQty - boq.requestedQty;
        if (item.requestedQty > available) {
          req.error(400,
            `Requested qty ${item.requestedQty} exceeds BOQ available qty ${available}`,
            'requestedQty'
          );
        }
      }
    }
  }

  _calculateBOQValue(req) {
    if (req.data.plannedQty && req.data.estimatedRate) {
      req.data.estimatedValue = parseFloat(
        (req.data.plannedQty * req.data.estimatedRate).toFixed(2)
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DRAFT ACTIVATION HANDLER
  // ═══════════════════════════════════════════════════════════════

  async _handleDraftActivate(req) {
    // Mark request so nested before-UPDATE hooks know this is draft activation
    if (req._) req._.draftActivate = true;
  }

  // ═══════════════════════════════════════════════════════════════
  // PROJECT ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async _activateProject(req) {
    const { ID } = req.params[0];
    const project = await SELECT.one.from(this.entities.Projects).where({ ID });
    if (!project) return req.error(404, `Project ${ID} not found`);
    if (project.status !== 'DRAFT' && project.status !== 'ON_HOLD') {
      return req.error(400, `Cannot activate project in status: ${project.status}`);
    }
    await UPDATE(this.entities.Projects).set({ status: 'ACTIVE' }).where({ ID });
    return SELECT.one.from(this.entities.Projects).where({ ID });
  }

  async _putProjectOnHold(req) {
    const { ID } = req.params[0];
    const { reason } = req.data;
    const project = await SELECT.one.from(this.entities.Projects).where({ ID });
    if (!project) return req.error(404, `Project ${ID} not found`);
    if (project.status !== 'ACTIVE') {
      return req.error(400, `Only ACTIVE projects can be put on hold`);
    }
    await UPDATE(this.entities.Projects)
      .set({ status: 'ON_HOLD', description: reason || project.description })
      .where({ ID });
    return SELECT.one.from(this.entities.Projects).where({ ID });
  }

  async _completeProject(req) {
    const { ID } = req.params[0];
    const project = await SELECT.one.from(this.entities.Projects).where({ ID });
    if (!project) return req.error(404, `Project ${ID} not found`);
    if (project.status !== 'ACTIVE') {
      return req.error(400, `Only ACTIVE projects can be completed`);
    }
    await UPDATE(this.entities.Projects)
      .set({ status: 'COMPLETED', endDate: new Date().toISOString().slice(0, 10) })
      .where({ ID });
    return SELECT.one.from(this.entities.Projects).where({ ID });
  }

  async _cancelProject(req) {
    const { ID } = req.params[0];
    const project = await SELECT.one.from(this.entities.Projects).where({ ID });
    if (!project) return req.error(404, `Project ${ID} not found`);
    if (['COMPLETED', 'CANCELLED'].includes(project.status)) {
      return req.error(400, `Cannot cancel a ${project.status} project`);
    }
    await UPDATE(this.entities.Projects).set({ status: 'CANCELLED' }).where({ ID });
    return SELECT.one.from(this.entities.Projects).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // MATERIAL REQUEST ACTIONS
  // ═══════════════════════════════════════════════════════════════

  async _submitRequest(req) {
    const { ID } = req.params[0];
    let mr = await SELECT.one.from(this.entities.MaterialRequests).where({ ID });
    // Draft MR (IsActiveEntity=false) lives in the drafts table, not the active entity
    if (!mr) mr = await SELECT.one.from(this.entities.MaterialRequests.drafts).where({ ID });
    if (!mr) return req.error(404, `Material Request ${ID} not found`);
    if (mr.status !== 'DRAFT') {
      return req.error(400, `Only DRAFT requests can be submitted. Current status: ${mr.status}`);
    }
    // Must have at least one item
    const items = await SELECT.from(this.entities.MaterialRequestItems).where({ request_ID: ID });
    if (!items || items.length === 0) {
      return req.error(400, 'Cannot submit a request with no items');
    }
    await UPDATE(this.entities.MaterialRequests)
      .set({ status: 'SUBMITTED' })
      .where({ ID });

    // Update BOQ requested quantities
    for (const item of items) {
      if (item.boqItem_ID) {
        const boq = await SELECT.one.from(this.entities.BOQItems)
          .where({ ID: item.boqItem_ID });
        if (boq) {
          await UPDATE(this.entities.BOQItems)
            .set({ requestedQty: (boq.requestedQty || 0) + item.requestedQty })
            .where({ ID: item.boqItem_ID });
        }
      }
    }
    return SELECT.one.from(this.entities.MaterialRequests).where({ ID });
  }

  async _approveRequest(req) {
    const { ID } = req.params[0];
    const { approvalRemarks } = req.data;
    const mr = await SELECT.one.from(this.entities.MaterialRequests).where({ ID });
    if (!mr) return req.error(404, `Material Request ${ID} not found`);
    if (mr.status !== 'SUBMITTED') {
      return req.error(400, `Only SUBMITTED requests can be approved. Current status: ${mr.status}`);
    }
    await UPDATE(this.entities.MaterialRequests)
      .set({
        status: 'APPROVED',
        approvalDate: new Date().toISOString(),
        remarks: approvalRemarks || mr.remarks,
        approvedBy_ID: req.user?.id || null
      })
      .where({ ID });
    return SELECT.one.from(this.entities.MaterialRequests).where({ ID });
  }

  async _rejectRequest(req) {
    const { ID } = req.params[0];
    const { rejectionReason } = req.data;
    if (!rejectionReason) {
      return req.error(400, 'Rejection reason is mandatory');
    }
    const mr = await SELECT.one.from(this.entities.MaterialRequests).where({ ID });
    if (!mr) return req.error(404, `Material Request ${ID} not found`);
    if (mr.status !== 'SUBMITTED') {
      return req.error(400, `Only SUBMITTED requests can be rejected. Current status: ${mr.status}`);
    }
    // Reverse BOQ requested quantities
    const items = await SELECT.from(this.entities.MaterialRequestItems).where({ request_ID: ID });
    for (const item of items) {
      if (item.boqItem_ID) {
        const boq = await SELECT.one.from(this.entities.BOQItems)
          .where({ ID: item.boqItem_ID });
        if (boq) {
          const newQty = Math.max(0, (boq.requestedQty || 0) - item.requestedQty);
          await UPDATE(this.entities.BOQItems)
            .set({ requestedQty: newQty })
            .where({ ID: item.boqItem_ID });
        }
      }
    }
    await UPDATE(this.entities.MaterialRequests)
      .set({ status: 'REJECTED', rejectionReason })
      .where({ ID });
    return SELECT.one.from(this.entities.MaterialRequests).where({ ID });
  }

  async _closeRequest(req) {
    const { ID } = req.params[0];
    const mr = await SELECT.one.from(this.entities.MaterialRequests).where({ ID });
    if (!mr) return req.error(404, `Material Request ${ID} not found`);
    if (!['APPROVED', 'ORDERED'].includes(mr.status)) {
      return req.error(400, `Cannot close request in status: ${mr.status}`);
    }
    await UPDATE(this.entities.MaterialRequests).set({ status: 'CLOSED' }).where({ ID });
    return SELECT.one.from(this.entities.MaterialRequests).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // POST-READ ENRICHMENT
  // ═══════════════════════════════════════════════════════════════

  _enrichProjects(projects) {
    if (!projects) return;
    const list = Array.isArray(projects) ? projects : [projects];
    for (const p of list) {
      // Safely apply criticality only when the object exists
      if (p && typeof p === 'object') {
        // Use 0 as default if status is missing to prevent drill-down errors in FE cache
        p.criticality = p.status ? this._projectStatusCriticality(p.status) : 0;
      }
    }
  }

  _enrichRequests(requests) {
    if (!requests) return;
    const list = Array.isArray(requests) ? requests : [requests];
    for (const r of list) {
      if (r && typeof r === 'object') {
        r.criticality = r.status ? this._requestStatusCriticality(r.status) : 0;
      }
    }
  }

  _projectStatusCriticality(status) {
    const map = {
      DRAFT: 0,  // Neutral
      ACTIVE: 3,  // Positive
      ON_HOLD: 2,  // Critical
      COMPLETED: 3,  // Positive
      CANCELLED: 1   // Negative
    };
    return map[status] ?? 0;
  }

  _requestStatusCriticality(status) {
    const map = {
      DRAFT: 0,
      SUBMITTED: 2,
      APPROVED: 3,
      REJECTED: 1,
      ORDERED: 3,
      CLOSED: 0
    };
    return map[status] ?? 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // PURCHASE ORDERS
  // ═══════════════════════════════════════════════════════════════

  async _generatePONumber(req) {
    if (req.data.poNumber) return;
    const year = new Date().getFullYear();
    const last = await SELECT.one.from(this.entities.PurchaseOrders).columns('poNumber').orderBy('createdAt desc');
    let seq = 1;
    if (last?.poNumber) { const m = last.poNumber.match(/PO-\d{4}-(\d{4})$/); if (m) seq = parseInt(m[1]) + 1; }
    req.data.poNumber = `PO-${year}-${String(seq).padStart(4, '0')}`;
    req.data.poDate = req.data.poDate || new Date().toISOString().slice(0, 10);
    req.data.status = req.data.status || 'DRAFT';
    req.data.subtotal = req.data.subtotal ?? 0;
    req.data.taxAmount = req.data.taxAmount ?? 0;
    req.data.grandTotal = req.data.grandTotal ?? 0;
    req.data.currency = req.data.currency || 'INR';
  }

  async _confirmPO(req) {
    const { ID } = req.params[0];
    const po = await SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
    if (!po) return req.error(404, `PO not found`);
    if (!['DRAFT', 'PENDING'].includes(po.status)) return req.error(400, `Cannot confirm PO in status ${po.status}`);
    await UPDATE(this.entities.PurchaseOrders).set({ status: 'CONFIRMED' }).where({ ID });
    return SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
  }

  async _cancelPO(req) {
    const { ID } = req.params[0];
    const { reason } = req.data;
    const po = await SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
    if (!po) return req.error(404, `PO not found`);
    if (['CLOSED', 'CANCELLED'].includes(po.status)) return req.error(400, `PO is already ${po.status}`);
    await UPDATE(this.entities.PurchaseOrders).set({ status: 'CANCELLED', remarks: reason || '' }).where({ ID });
    return SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
  }

  async _closePO(req) {
    const { ID } = req.params[0];
    const po = await SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
    if (!po) return req.error(404, `PO not found`);
    if (po.status !== 'CONFIRMED') return req.error(400, `Only CONFIRMED POs can be closed`);
    await UPDATE(this.entities.PurchaseOrders).set({ status: 'CLOSED' }).where({ ID });
    return SELECT.one.from(this.entities.PurchaseOrders).where({ ID });
  }

  // ═══════════════════════════════════════════════════════════════
  // DELIVERIES — ABAP SEGW Proxy (ZSolarDeliverySet)
  // ═══════════════════════════════════════════════════════════════

  static SEGW_DELIVERY_SET = 'ZSolarDeliverySet';

  // Fields that are OData V4 / draft system only — stripped before querying SEGW OData V2
  static DELIVERY_VIRTUAL_FIELDS = new Set([
    'IsActiveEntity','HasDraftEntity','HasActiveEntity',
    'DraftAdministrativeData','SiblingEntity','DraftMessages',
    'Criticality'
  ]);

  async _getSegwService() {
    if (!this._segwSvc) this._segwSvc = await cds.connect.to('SEGW_DELIVERY_SRV');
    return this._segwSvc;
  }

  // ── CSRF-aware SEGW HTTP helper ──────────────────────────────────────────
  // SEGW OData V2 rejects PATCH/DELETE/POST without a valid X-CSRF-Token.
  // CAP's svc.send() doesn't handle the token refresh cycle per-call,
  // so we manage it ourselves: GET token → reuse session cookie → mutate.
  async _segwRequest({ method, key, payload }) {
    const http  = require('http');  // port 8000 is plain HTTP
    const creds = cds.env.requires.SEGW_DELIVERY_SRV.credentials;
    const base  = new URL(creds.url);
    const auth  = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
    const eset  = ProjectService.SEGW_DELIVERY_SET;
    const client = base.protocol === 'https:' ? require('https') : require('http');

    const commonHeaders = {
      'Authorization' : `Basic ${auth}`,
      'sap-client'    : '100',
      'Accept'        : 'application/json',
      'Content-Type'  : 'application/json'
    };

    // Step 1: fetch CSRF token
    const token = await new Promise((resolve, reject) => {
      const opts = {
        hostname: base.hostname,
        port    : parseInt(base.port) || (base.protocol === 'https:' ? 443 : 80),
        path    : `${base.pathname}/${eset}?$top=1`,
        method  : 'GET',
        headers : { ...commonHeaders, 'x-csrf-token': 'Fetch' },
        rejectUnauthorized: false
      };
      const req = client.request(opts, res => {
        res.resume();
        const t = res.headers['x-csrf-token'];
        if (!t || t === 'Required') return reject(new Error('CSRF fetch returned no token'));
        resolve({ token: t, cookie: res.headers['set-cookie']?.join('; ') || '' });
      });
      req.on('error', reject);
      req.end();
    });

    // Step 2: send mutating request with token + session cookie
    const resourcePath = key
      ? `${base.pathname}/${eset}('${encodeURIComponent(key)}')`
      : `${base.pathname}/${eset}`;
    const body = payload ? JSON.stringify(payload) : '';

    return new Promise((resolve, reject) => {
      const opts = {
        hostname: base.hostname,
        port    : parseInt(base.port) || (base.protocol === 'https:' ? 443 : 80),
        path    : resourcePath,
        method,
        headers : {
          ...commonHeaders,
          'x-csrf-token'  : token.token,
          'Cookie'        : token.cookie,
          'Content-Length': Buffer.byteLength(body)
        },
        rejectUnauthorized: false
      };
      const req = client.request(opts, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
          } else {
            reject(new Error(`SEGW ${method} failed ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async _deliveryRead(req, next) {
    const s = req.query?.SELECT;
    const whereStr = JSON.stringify(s?.where ?? '');
    // Draft reads → serve from local SQLite (draft staging)
    if (whereStr.includes('IsActiveEntity')) return next();

    const svc = await this._getSegwService();
    const q = SELECT.from(ProjectService.SEGW_DELIVERY_SET);

    // Strip draft/virtual fields from $select before hitting SEGW
    if (s?.columns?.length) {
      const safe = s.columns.filter(c => !c?.ref || !ProjectService.DELIVERY_VIRTUAL_FIELDS.has(c.ref[0]));
      if (safe.length) q.columns(safe);
    }
    if (s?.where?.length)   q.where(s.where);
    if (s?.orderBy?.length) q.orderBy(s.orderBy);
    if (s?.limit?.rows)     q.limit(s.limit.rows.val, s.limit.offset?.val ?? 0);

    const results = await svc.run(q);
    if (Array.isArray(results)) results.forEach(r => this._deliveryNormalize(r));
    else if (results) this._deliveryNormalize(results);
    return results;
  }

  _parseV2DateToISO(val) {
    if (!val || typeof val !== 'string') return val;
    // OData V2: /Date(1777593600000)/ or /Date(1777593600000+0000)/
    const m = val.match(/\/Date\((-?\d+)([+-]\d{4})?\)\//);
    if (m) return new Date(parseInt(m[1])).toISOString().slice(0, 10); // return YYYY-MM-DD
    return val; // already ISO or null
  }

  _deliveryNormalize(r) {
    if (!r) return;
    // Parse OData V2 /Date(ms)/ format for all date fields
    if (r.ScheduledDate) r.ScheduledDate = this._parseV2DateToISO(r.ScheduledDate);
    if (r.ActualDate)    r.ActualDate    = this._parseV2DateToISO(r.ActualDate);
    if (r.CreatedAt)     r.CreatedAt     = this._parseV2DateToISO(r.CreatedAt);
    // Compute Criticality for UI color coding
    const statusCrit = { DELIVERED: 3, IN_TRANSIT: 2, SCHEDULED: 2, DELAYED: 1, INVOICED: 3 };
    r.Criticality = statusCrit[r.Status] ?? 0;
  }

  async _deliveryCreate(req) {
    // With @odata.draft.enabled, CREATE stages in local SQLite draft table.
    // _deliveryDraftActivate will POST to SEGW on Save.
    console.log('[DEL] 🔵 Draft staged in SQLite:', req.data?.DeliveryNumber);
  }

  async _deliveryDraftActivate(req, next) {
    try {
      const data = req.data ?? {};
      const fields = ['DeliveryNumber','PoNumber','VendorId','ProjectCode','Status',
                      'ScheduledDate','ActualDate','DelayDays','DelayReason',
                      'VehicleNumber','DriverName','DriverPhone','EwayBill'];
      const payload = {};
      for (const f of fields) { if (data[f] !== undefined && data[f] !== null) payload[f] = data[f]; }
      if (!payload.DeliveryNumber) return req.error(400, 'Delivery Number is mandatory');
      payload.Status = payload.Status || 'SCHEDULED';

      console.log('[DEL draftActivate] Sending to SEGW:', JSON.stringify(payload));
      await this._segwRequest({ method: 'POST', payload });
      console.log('[DEL draftActivate] SEGW POST succeeded');
    } catch (err) {
      console.error('[DEL draftActivate] SEGW error:', err.message);
      return req.error(500, `SEGW create failed: ${err.message}`);
    }
    return next();
  }

  async _deliveryUpdate(req, next) {
    const { DeliveryNumber } = req.params?.[0] ?? {};
    if (!DeliveryNumber) return next();
    const payload = { ...req.data };
    delete payload.DeliveryNumber; delete payload.CreatedAt; delete payload.Criticality;
    try {
      await this._segwRequest({ method: 'PATCH', key: DeliveryNumber, payload });
      console.log(`[DEL] PATCH ${DeliveryNumber} → SEGW OK`);
    } catch (err) {
      return req.error(500, `SEGW update failed: ${err.message}`);
    }
    return next();
  }

  async _deliveryDelete(req, next) {
    const { DeliveryNumber } = req.params?.[0] ?? {};
    if (!DeliveryNumber) return next();
    try {
      await this._segwRequest({ method: 'DELETE', key: DeliveryNumber, payload: null });
      console.log(`[DEL] DELETE ${DeliveryNumber} → SEGW OK`);
    } catch (err) {
      return req.error(500, `SEGW delete failed: ${err.message}`);
    }
    return next();
  }

  async _markInTransit(req) {
    const { DeliveryNumber } = req.params?.[0] ?? {};
    if (!DeliveryNumber) return req.error(400, 'Delivery Number required');
    await this._segwRequest({ method: 'PATCH', key: DeliveryNumber, payload: { Status: 'IN_TRANSIT' } });
    await UPDATE(this.entities.Deliveries).set({ Status: 'IN_TRANSIT', Criticality: 2 }).where({ DeliveryNumber });
    return SELECT.one.from(this.entities.Deliveries).where({ DeliveryNumber });
  }

  async _markDelivered(req) {
    const { DeliveryNumber } = req.params?.[0] ?? {};
    const { actualDate } = req.data;
    if (!DeliveryNumber) return req.error(400, 'Delivery Number required');
    const del = await SELECT.one.from(this.entities.Deliveries).where({ DeliveryNumber });
    const delayDays = del?.ScheduledDate
      ? Math.max(0, Math.round((new Date(actualDate || Date.now()) - new Date(del.ScheduledDate)) / 86400000))
      : 0;
    const patch = { Status: 'DELIVERED', ActualDate: actualDate || new Date().toISOString().slice(0, 10), DelayDays: delayDays };
    await this._segwRequest({ method: 'PATCH', key: DeliveryNumber, payload: patch });
    await UPDATE(this.entities.Deliveries).set({ ...patch, Criticality: 3 }).where({ DeliveryNumber });
    return SELECT.one.from(this.entities.Deliveries).where({ DeliveryNumber });
  }

  async _markDelayed(req) {
    const { DeliveryNumber } = req.params?.[0] ?? {};
    const { reason, newDate } = req.data;
    if (!DeliveryNumber) return req.error(400, 'Delivery Number required');
    const patch = { Status: 'DELAYED', DelayReason: reason || '', ScheduledDate: newDate };
    await this._segwRequest({ method: 'PATCH', key: DeliveryNumber, payload: patch });
    await UPDATE(this.entities.Deliveries).set({ ...patch, Criticality: 1 }).where({ DeliveryNumber });
    return SELECT.one.from(this.entities.Deliveries).where({ DeliveryNumber });
  }





  // ═══════════════════════════════════════════════════════════════
  // GRN RECEIPTS — ABAP Proxy (ZUI_MAT_RECEIPT_BIND / Z_C_MAT_RECEIPT)
  // ═══════════════════════════════════════════════════════════════

  // The ABAP entity set is Z_C_MAT_RECEIPT — NOT GRNReceipts.
  // All queries must explicitly target this name.
  static ABAP_GRN = 'Z_C_MAT_RECEIPT';

  async _getRapService() {
    if (!this._rapSvc) {
      this._rapSvc = await cds.connect.to('RAP_SERVICE');
    }
    return this._rapSvc;
  }


  // ── Direct ABAP HTTPS helper ─────────────────────────────────────────────
  // Bypasses CAP remote service for mutating ops because svc.tx({ headers })
  // does NOT forward custom headers to the underlying HTTP client.
  // This method: 1) fetches CSRF token + session cookie, 2) sends the actual
  // request with both, keeping the session alive across both calls.
  async _abapRequest({ method, key, payload }) {
    const https = require('https');
    const creds = cds.env.requires.RAP_SERVICE.credentials;
    const base  = new URL(creds.url);
    const auth  = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
    const eset  = ProjectService.ABAP_GRN;

    const commonHeaders = {
      'Authorization'      : `Basic ${auth}`,
      'sap-client'         : '100',
      'DataServiceVersion' : '2.0',
      'MaxDataServiceVersion': '2.0',
      'Accept'             : 'application/json'
    };

    // ── Step 1: Fetch CSRF token + session cookie ─────────────────
    const { token, sessionCookie } = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: base.hostname, port: base.port || 443,
        path: base.pathname + '/', method: 'GET',
        headers: { ...commonHeaders, 'X-CSRF-Token': 'Fetch' },
        rejectUnauthorized: false
      }, (res) => {
        const token = res.headers['x-csrf-token'];
        const rawCookies = res.headers['set-cookie'] || [];
        // Only keep the name=value part; strip Path/Secure/HttpOnly attributes
        const sessionCookie = rawCookies.map(c => c.split(';')[0]).join('; ');
        res.resume(); // drain to free socket
        if (token && token !== 'Required') {
          console.log(`[GRN CSRF] ✅ Token: ${token.substring(0, 8)}...  Cookie: ${sessionCookie.substring(0, 30)}...`);
          resolve({ token, sessionCookie });
        } else {
          reject(new Error('ABAP did not return X-CSRF-Token'));
        }
      });
      r.on('error', reject);
      r.end();
    });

    // ── Step 2: Actual mutating request ───────────────────────────
    const path = key
      ? `${base.pathname}/${eset}('${encodeURIComponent(key)}')`
      : `${base.pathname}/${eset}`;
    const body = payload ? JSON.stringify(payload) : null;

    return new Promise((resolve, reject) => {
      const mutHeaders = {
        ...commonHeaders,
        'X-CSRF-Token' : token,
        'Cookie'       : sessionCookie
      };
      if (body) {
        mutHeaders['Content-Type']   = 'application/json';
        mutHeaders['Content-Length'] = Buffer.byteLength(body);
      }

      const r = https.request({
        hostname: base.hostname, port: base.port || 443,
        path, method, headers: mutHeaders,
        rejectUnauthorized: false
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(data ? JSON.parse(data) : null); }
            catch { resolve(null); }
          } else {
            reject(new Error(`ABAP ${method} ${path} failed: ${res.statusCode} ${data}`));
          }
        });
      });
      r.on('error', reject);
      if (body) r.write(body);
      r.end();
    });
  }


  // Draft-system and virtual fields that exist in CAP/UI but NOT in ABAP OData V2
  static DRAFT_FIELDS = new Set([
    'IsActiveEntity','HasDraftEntity','HasActiveEntity',
    'DraftAdministrativeData','SiblingEntity','DraftMessages',
    'Criticality', 'dummyInfo'
  ]);

  async _grnRead(req, next) {
    const s = req.query?.SELECT;
    const whereStr = JSON.stringify(s?.where ?? '');

    // Any draft-context query → serve from local SQLite, not ABAP
    if (whereStr.includes('IsActiveEntity')) return next();

    const svc = await this._getRapService();
    const q = SELECT.from(ProjectService.ABAP_GRN);

    // Strip draft-system columns before hitting ABAP OData V2
    if (s?.columns?.length) {
      const safe = s.columns.filter(c => !c?.ref || !ProjectService.DRAFT_FIELDS.has(c.ref[0]));
      if (safe.length) q.columns(safe);
    }
    if (s?.where?.length)   q.where(s.where);
    if (s?.orderBy?.length) q.orderBy(s.orderBy);
    if (s?.limit?.rows)     q.limit(s.limit.rows.val, s.limit.offset?.val ?? 0);

    const results = await svc.run(q);
    if (Array.isArray(results)) results.forEach(r => this._normalizeGRNDates(r));
    else if (results) this._normalizeGRNDates(results);
    return results;
  }

  _normalizeGRNDates(record) {
    if (!record) return;
    if (record.CreatedAt) record.CreatedAt = this._parseV2Date(record.CreatedAt);
    
    // Set Criticality for UI color coding
    if (record.Status === 'VERIFIED') record.Criticality = 3;      // Green
    else if (record.Status === 'REJECTED') record.Criticality = 1; // Red
    else record.Criticality = 2;                                   // Yellow (OPEN/PENDING)

    // Strip ABAP RAP metadata control fields
    delete record.Delete_mc;
    delete record.Update_mc;
  }

  _parseV2Date(val) {
    if (!val || typeof val !== 'string') return val;
    const m = val.match(/\/Date\((-?\d+)([+-]\d{4})?\)\//);
    if (m) return new Date(parseInt(m[1])).toISOString();
    return val; // already ISO or null
  }


  // ── draftActivate — final Save sends staged draft data to ABAP ──
  async _grnDraftActivate(req, next) {
    try {
      const data = req.data ?? {};
      const payload = {};
      const fields = ['ReceiptID', 'Material', 'Quantity', 'PONumber', 'Supplier', 'Unit', 'Remarks'];
      for (const f of fields) { if (data[f] !== undefined && data[f] !== null) payload[f] = data[f]; }
      if (!payload.ReceiptID) return req.error(400, 'Receipt ID is mandatory');
      console.log('[GRN draftActivate] Sending to ABAP:', JSON.stringify(payload));
      const result = await this._abapRequest({ method: 'POST', payload });
      console.log('[GRN draftActivate] ABAP response:', JSON.stringify(result));
    } catch (err) {
      console.error('[GRN draftActivate] ABAP error:', err.message);
      return req.error(500, `ABAP create failed: ${err.message}`);
    }
    return next();
  }

  async _grnCreate(req) {
    console.log('[GRN Logger] 🔵 Fired: CREATE Receipt (draft staging in SQLite)');
    // With draft enabled, CREATE stages the record in local SQLite.
    // draftActivate will forward to ABAP on Save. Let CAP handle this.
    return;
  }

  async _grnUpdate(req, next) {
    const { ReceiptID } = req.params?.[0] ?? {};
    if (!ReceiptID) return next();
    console.log(`[GRN Logger] 🟡 Fired: UPDATE Receipt (${ReceiptID})`);
    const payload = { ...req.data };
    delete payload.ReceiptID; delete payload.CreatedAt;
    try {
      await this._abapRequest({ method: 'PATCH', key: ReceiptID, payload });
    } catch (err) {
      return req.error(500, `ABAP update failed: ${err.message}`);
    }
    return next(); // Let CAP also update local SQLite
  }

  async _grnDelete(req, next) {
    const { ReceiptID } = req.params?.[0] ?? {};
    if (!ReceiptID) return next();
    console.log(`[GRN Logger] 🗑️ Fired: DELETE Receipt (${ReceiptID})`);
    try {
      await this._abapRequest({ method: 'DELETE', key: ReceiptID });
    } catch (err) {
      return req.error(500, `ABAP delete failed: ${err.message}`);
    }
    return next(); // Let CAP also delete from local SQLite
  }

  async _grnVerify(req) {
    const { ReceiptID } = req.params[0];
    const { remarks } = req.data;
    console.log(`[GRN Logger] 🟢 Fired: ACTION verifyReceipt (${ReceiptID})`);
    if (!ReceiptID) return req.error(400, 'Cannot verify a receipt with no Receipt ID');
    const svc = await this._getRapService();
    const rec = await svc.run(SELECT.one.from(ProjectService.ABAP_GRN).where({ ReceiptID }));
    if (!rec) return req.error(404, `GRN Receipt ${ReceiptID} not found`);
    if (!['OPEN', 'PENDING'].includes(rec.Status))
      return req.error(400, `Cannot verify receipt in status: ${rec.Status}`);
    await this._abapRequest({ method: 'PATCH', key: ReceiptID,
      payload: { Status: 'VERIFIED', Remarks: remarks || rec.Remarks || '' } });
    return svc.run(SELECT.one.from(ProjectService.ABAP_GRN).where({ ReceiptID }));
  }

  async _grnReject(req) {
    const { ReceiptID } = req.params[0];
    const { reason } = req.data;
    console.log(`[GRN Logger] 🔴 Fired: ACTION rejectReceipt (${ReceiptID})`);
    if (!ReceiptID) return req.error(400, 'Cannot reject a receipt with no Receipt ID');
    if (!reason) return req.error(400, 'Rejection reason is mandatory');
    const svc = await this._getRapService();
    await this._abapRequest({ method: 'PATCH', key: ReceiptID,
      payload: { Status: 'REJECTED', Remarks: reason } });
    return svc.run(SELECT.one.from(ProjectService.ABAP_GRN).where({ ReceiptID }));
  }

  // ═══════════════════════════════════════════════════════════════
  // GRN RECEIPT ANALYTICS — virtual entity READ handler
  // Serves sap.fe.templates.AnalyticalListPage without draft columns.
  // Handles both plain list reads (table panel) and $apply groupby
  // (chart panel: aggregate Quantity by Status).
  // ═══════════════════════════════════════════════════════════════

  async _grnAnalyticsRead(req) {
    // Let CAP/database handle FE ALP queries natively first. This covers
    // $apply/groupby/aggregate requests for charts much more reliably than
    // hand-parsing the incoming query shape.
    try {
      const db = await cds.connect.to('db');
      const result = await db.run(req.query);
      if (result !== undefined && result !== null) {
        return result;
      }
    } catch (e) {
      console.warn('[GRNAnalytics] Native DB query failed, falling back to manual handler:', e.message);
    }

    // ── Load source rows from GRNReceipts SQLite (bypasses ABAP proxy) ──────
    let rows = [];
    try {
      const db = await cds.connect.to('db');
      const GRNReceiptsEntity = this.entities.GRNReceipts;

      // Draft-enabled table: active entity rows have IsActiveEntity = true (1 in SQLite)
      try {
        rows = await db.run(
          SELECT.from(GRNReceiptsEntity)
            .columns('ReceiptID', 'Material', 'Quantity', 'PONumber', 'Supplier', 'Unit', 'Status', 'Remarks', 'CreatedAt')
            .where({ IsActiveEntity: true })
        );
      } catch (_) {
        // Fallback: table may not have draft columns yet
        rows = await db.run(
          SELECT.from(GRNReceiptsEntity)
            .columns('ReceiptID', 'Material', 'Quantity', 'PONumber', 'Supplier', 'Unit', 'Status', 'Remarks', 'CreatedAt')
        );
      }
    } catch (e) {
      console.warn('[GRNAnalytics] DB read failed, using sample data:', e.message);
    }

    // ── Fallback: sample data for first-run or pure-ABAP environments ────────
    if (!rows || rows.length === 0) {
      rows = [
        { ReceiptID: 'GRN-DEMO-001', Material: 'Solar Panel 400W Mono',    Quantity: 100,  PONumber: 'PO-2024-001', Supplier: 'SunTech India',     Unit: 'EA',  Status: 'VERIFIED', Remarks: 'Received in good condition.'  },
        { ReceiptID: 'GRN-DEMO-002', Material: 'Inverter 50kVA',            Quantity: 20,   PONumber: 'PO-2024-001', Supplier: 'SunTech India',     Unit: 'EA',  Status: 'VERIFIED', Remarks: 'All units tested.'            },
        { ReceiptID: 'GRN-DEMO-003', Material: 'Mounting Structure',        Quantity: 500,  PONumber: 'PO-2024-002', Supplier: 'Steel Masters Ltd', Unit: 'KG',  Status: 'OPEN',     Remarks: 'Pending site inspection.'     },
        { ReceiptID: 'GRN-DEMO-004', Material: 'DC Cable 6mm2',             Quantity: 2000, PONumber: 'PO-2024-003', Supplier: 'CableCo India',     Unit: 'MTR', Status: 'VERIFIED', Remarks: 'Full length verified.'        },
        { ReceiptID: 'GRN-DEMO-005', Material: 'AC Distribution Board',     Quantity: 10,   PONumber: 'PO-2024-004', Supplier: 'Electro Systems',   Unit: 'EA',  Status: 'REJECTED', Remarks: '2 units damaged on arrival.'  },
        { ReceiptID: 'GRN-DEMO-006', Material: 'Solar Panel 540W Bifacial', Quantity: 150,  PONumber: 'PO-2024-005', Supplier: 'HelioTech',         Unit: 'EA',  Status: 'VERIFIED', Remarks: 'Quality check passed.'        },
        { ReceiptID: 'GRN-DEMO-007', Material: 'String Combiner Box',       Quantity: 25,   PONumber: 'PO-2024-006', Supplier: 'Power Grid Co',     Unit: 'EA',  Status: 'VERIFIED', Remarks: 'All MCBs tested.'             },
        { ReceiptID: 'GRN-DEMO-008', Material: 'Inverter 100kVA',           Quantity: 5,    PONumber: 'PO-2024-007', Supplier: 'SunTech India',     Unit: 'EA',  Status: 'PENDING',  Remarks: 'Pending 3-phase load test.'   },
        { ReceiptID: 'GRN-DEMO-009', Material: 'Battery Storage 100kWh',    Quantity: 4,    PONumber: 'PO-2024-009', Supplier: 'EnerStore Ltd',     Unit: 'EA',  Status: 'OPEN',     Remarks: 'Capacity test in progress.'   },
        { ReceiptID: 'GRN-DEMO-010', Material: 'Lightning Arrestor',        Quantity: 30,   PONumber: 'PO-2024-008', Supplier: 'SmartGrid Tech',    Unit: 'EA',  Status: 'REJECTED', Remarks: 'Wrong spec supplied.'         }
      ];
    }

    // ── Sanitize: strip draft/system columns that don't belong in GRNReceiptAnalytics ─
    const DRAFT_COLS = new Set([
      'IsActiveEntity','HasActiveEntity','HasDraftEntity',
      'DraftAdministrativeData_DraftUUID','DraftAdministrativeData',
      'SiblingEntity','Criticality','dummyInfo'
    ]);
    const clean = rows.map(r => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        if (!DRAFT_COLS.has(k)) out[k] = v;
      }
      return out;
    });

    // ── Apply filter from SelectionFields (Status, Supplier, Unit, Material) ─
    const filterWhere = req.query?.SELECT?.where;
    let filtered = clean;
    if (filterWhere && filterWhere.length > 0) {
      // Simple equality filters from SmartFilterBar
      const filters = {};
      for (let i = 0; i < filterWhere.length; i++) {
        const token = filterWhere[i];
        if (token?.ref && filterWhere[i + 1] === '=' && filterWhere[i + 2]?.val !== undefined) {
          filters[token.ref[0]] = filterWhere[i + 2].val;
        }
      }
      if (Object.keys(filters).length > 0) {
        filtered = clean.filter(r => Object.entries(filters).every(([k, v]) => r[k] === v));
      }
    }

    // ── Handle $count-only request (ALP fires this separately for table count badge) ─
    if (req.query?.SELECT?.count && !req.query?.SELECT?.columns) {
      return filtered.length;
    }

    // ── Handle $apply groupby (ALP chart: CAP translates OData $apply → SELECT.groupBy) ─
    // Chart requests: groupby((Status),aggregate(Quantity with sum as Quantity))
    const groupBy = req.query?.SELECT?.groupBy;
    if (groupBy && groupBy.length > 0) {
      // Support multi-field groupBy (e.g. [Status], [Supplier], [Unit])
      const groupByFields = groupBy.map(g => g?.ref?.[0]).filter(Boolean);
      const primaryField = groupByFields[0] || 'Status';
      const groups = {};
      for (const row of filtered) {
        const key = groupByFields.map(f => row[f] || 'UNKNOWN').join('||');
        if (!groups[key]) {
          const groupRow = { Quantity: 0 };
          for (const f of groupByFields) groupRow[f] = row[f] || 'UNKNOWN';
          groups[key] = groupRow;
        }
        groups[key].Quantity += (parseInt(row.Quantity) || 0);
      }
      const result = Object.values(groups);
      result.$count = result.length;
      return result;
    }

    // ── Raw $apply fallback (older CAP versions keep the raw query string) ──
    const rawApply = req._?.req?.query?.['$apply'];
    if (rawApply) {
      const groupMatch = rawApply.match(/groupby\s*\(\s*\(\s*([^)]+)\s*\)/);
      const groupByField = groupMatch?.[1]?.trim() || 'Status';
      const groups = {};
      for (const row of filtered) {
        const key = row[groupByField] || 'UNKNOWN';
        if (!groups[key]) groups[key] = { [groupByField]: key, Quantity: 0 };
        groups[key].Quantity += (parseInt(row.Quantity) || 0);
      }
      const result = Object.values(groups);
      result.$count = result.length;
      return result;
    }

    // ── Plain table read (list panel) ────────────────────────────────────────
    // Apply $top/$skip for pagination
    const limit = req.query?.SELECT?.limit;
    let page = filtered;
    if (limit?.rows?.val) {
      const top  = limit.rows.val;
      const skip = limit.offset?.val ?? 0;
      page = filtered.slice(skip, skip + top);
    }
    page.$count = filtered.length;
    return page;
  }

};


