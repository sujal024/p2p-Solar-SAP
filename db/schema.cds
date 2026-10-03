namespace solar.epc;

using { cuid, managed } from '@sap/cds/common';

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

type ProjectStatus : String(20) enum {
  DRAFT     = 'DRAFT';
  ACTIVE    = 'ACTIVE';
  ON_HOLD   = 'ON_HOLD';
  COMPLETED = 'COMPLETED';
  CANCELLED = 'CANCELLED';
}

type RequestStatus : String(20) enum {
  DRAFT     = 'DRAFT';
  SUBMITTED = 'SUBMITTED';
  APPROVED  = 'APPROVED';
  REJECTED  = 'REJECTED';
  ORDERED   = 'ORDERED';
  CLOSED    = 'CLOSED';
}

type QuotationStatus : String(20) enum {
  DRAFT     = 'DRAFT';
  SUBMITTED = 'SUBMITTED';
  UNDER_EVALUATION = 'UNDER_EVALUATION';
  SELECTED  = 'SELECTED';
  REJECTED  = 'REJECTED';
}

type POStatus : String(30) enum {
  DRAFT               = 'DRAFT';
  CONFIRMED           = 'CONFIRMED';
  PARTIALLY_DELIVERED = 'PARTIALLY_DELIVERED';
  FULLY_DELIVERED     = 'FULLY_DELIVERED';
  CLOSED              = 'CLOSED';
  CANCELLED           = 'CANCELLED';
}

type DeliveryStatus : String(30) enum {
  SCHEDULED           = 'SCHEDULED';
  IN_TRANSIT          = 'IN_TRANSIT';
  DELAYED             = 'DELAYED';
  DELIVERED           = 'DELIVERED';
  PARTIALLY_DELIVERED = 'PARTIALLY_DELIVERED';
}

type ReceiptStatus : String(30) enum {
  PENDING             = 'PENDING';
  VERIFIED            = 'VERIFIED';
  PARTIALLY_ACCEPTED  = 'PARTIALLY_ACCEPTED';
  FULLY_REJECTED      = 'FULLY_REJECTED';
}

type InvoiceStatus : String(20) enum {
  DRAFT        = 'DRAFT';
  SUBMITTED    = 'SUBMITTED';
  UNDER_REVIEW = 'UNDER_REVIEW';
  MATCHED      = 'MATCHED';
  MISMATCH     = 'MISMATCH';
  APPROVED     = 'APPROVED';
  REJECTED     = 'REJECTED';
  PAID         = 'PAID';
}

type MatchStatus : String(20) enum {
  MATCHED           = 'MATCHED';
  QUANTITY_MISMATCH = 'QUANTITY_MISMATCH';
  PRICE_MISMATCH    = 'PRICE_MISMATCH';
  BOTH_MISMATCH     = 'BOTH_MISMATCH';
  PENDING           = 'PENDING';
}

type UserRole : String(30) enum {
  ENGINEER            = 'ENGINEER';
  PROJECT_MANAGER     = 'PROJECT_MANAGER';
  PROCUREMENT_OFFICER = 'PROCUREMENT_OFFICER';
  SITE_ENGINEER       = 'SITE_ENGINEER';
  FINANCE_OFFICER     = 'FINANCE_OFFICER';
  MANAGEMENT          = 'MANAGEMENT';
}

type MaterialCondition : String(20) enum {
  GOOD    = 'GOOD';
  DAMAGED = 'DAMAGED';
  PARTIAL = 'PARTIAL';
}

type DamageType : String(20) enum {
  PHYSICAL      = 'PHYSICAL';
  TRANSIT       = 'TRANSIT';
  MANUFACTURING = 'MANUFACTURING';
  WEATHER       = 'WEATHER';
}

type ClaimStatus : String(20) enum {
  PENDING  = 'PENDING';
  CLAIMED  = 'CLAIMED';
  SETTLED  = 'SETTLED';
  REJECTED = 'REJECTED';
}

// ═══════════════════════════════════════════════════════════════
// MASTER DATA
// ═══════════════════════════════════════════════════════════════

entity MaterialMaster : cuid, managed {
  materialCode  : String(20)   not null;
  description   : String(200)  not null;
  uom           : String(10)   not null;
  category      : String(50);
  hsnCode       : String(20);
  taxRate       : Decimal(5,2) default 18;
  isActive      : Boolean      default true;
}

entity VendorMaster : cuid, managed {
  vendorCode       : String(20)   not null;
  vendorName       : String(200)  not null;
  gstin            : String(20);
  pan              : String(20);
  address          : String(500);
  city             : String(100);
  state            : String(100);
  pincode          : String(10);
  contactPerson    : String(100);
  email            : String(100);
  phone            : String(20);
  bankAccount      : String(30);
  bankIFSC         : String(15);
  paymentTerms     : String(100);
  isActive         : Boolean      default true;
  performanceScore : Decimal(5,2) default 0;
  totalOrders      : Integer      default 0;
  onTimeDeliveries : Integer      default 0;
  qualityScore     : Decimal(5,2) default 0;
}

entity Users : cuid {
  userId      : String(20)  not null;
  userName    : String(100) not null;
  email       : String(100);
  role        : UserRole    not null;
  department  : String(100);
  isActive    : Boolean     default true;
}

// ═══════════════════════════════════════════════════════════════
// PROJECT
// ═══════════════════════════════════════════════════════════════

entity Projects : cuid, managed {
  projectCode      : String(20)   not null;
  projectName      : String(200)  not null;
  clientName       : String(200);
  location         : String(200);
  state            : String(100);
  capacityKWp      : Decimal(10,2);
  startDate        : Date;
  endDate          : Date;
  budget           : Decimal(18,2);
  spentAmount      : Decimal(18,2) default 0;
  currency         : String(5)    default 'INR';
  status           : ProjectStatus default 'DRAFT';
  projectManager   : Association to Users;
  description      : String(1000);
  boqItems         : Composition of many BOQItems          on boqItems.project          = $self;
  materialRequests : Composition of many MaterialRequests  on materialRequests.project  = $self;
}

// ═══════════════════════════════════════════════════════════════
// BILL OF QUANTITY
// ═══════════════════════════════════════════════════════════════

entity BOQItems : cuid, managed {
  project        : Association to Projects      not null;
  lineNumber     : Integer;
  material       : Association to MaterialMaster not null;
  description    : String(200);
  plannedQty     : Decimal(13,3) not null;
  uom            : String(10)   not null;
  estimatedRate  : Decimal(18,2);
  estimatedValue : Decimal(18,2);
  requestedQty   : Decimal(13,3) default 0;
  orderedQty     : Decimal(13,3) default 0;
  receivedQty    : Decimal(13,3) default 0;
}

// ═══════════════════════════════════════════════════════════════
// MATERIAL REQUEST (MR / PR)
// ═══════════════════════════════════════════════════════════════

entity MaterialRequests : cuid, managed {
  requestNumber   : String(20);
  project         : Association to Projects not null;
  requestDate     : Date;
  requiredDate    : Date         not null;
  priority        : String(10)   default 'MEDIUM';
  purpose         : String(300);
  siteLocation    : String(200);
  requestedBy     : Association to Users;
  status          : RequestStatus default 'DRAFT';
  remarks         : String(500);
  approvedBy      : Association to Users;
  approvalDate    : DateTime;
  rejectionReason : String(500);
  items           : Composition of many MaterialRequestItems on items.request    = $self;
  quotations      : Composition of many VendorQuotations     on quotations.materialRequest = $self;
}

entity MaterialRequestItems : cuid {
  request        : Association to MaterialRequests not null;
  lineNumber     : Integer;
  material       : Association to MaterialMaster   not null;
  description    : String(200);
  requestedQty   : Decimal(13,3) not null;
  uom            : String(10)   not null;
  estimatedRate  : Decimal(13,2);
  estimatedValue : Decimal(13,2);
  boqItem        : Association to BOQItems;
  remarks        : String(200);
}

// ═══════════════════════════════════════════════════════════════
// VENDOR QUOTATION (RFQ RESPONSE)
// ═══════════════════════════════════════════════════════════════

entity VendorQuotations : cuid, managed {
  quotationNumber   : String(20);
  materialRequest   : Association to MaterialRequests not null;
  vendor            : Association to VendorMaster     not null;
  quotationDate     : Date;
  validityDate      : Date not null;
  currency          : String(5)    default 'INR';
  subtotal          : Decimal(18,2) default 0;
  taxAmount         : Decimal(18,2) default 0;
  totalAmount       : Decimal(18,2) default 0;
  deliveryLeadDays  : Integer;
  paymentTerms      : String(100);
  status            : QuotationStatus default 'DRAFT';
  technicalRemarks  : String(500);
  commercialRemarks : String(500);
  isSelected        : Boolean default false;
  selectionReason   : String(500);
  items             : Composition of many VendorQuotationItems on items.quotation = $self;
}

entity VendorQuotationItems : cuid {
  quotation    : Association to VendorQuotations   not null;
  lineNumber   : Integer;
  requestItem  : Association to MaterialRequestItems;
  material     : Association to MaterialMaster     not null;
  description  : String(200);
  quotedQty    : Decimal(13,3) not null;
  uom          : String(10)   not null;
  unitPrice    : Decimal(18,4) not null;
  taxPercent   : Decimal(5,2)  default 18;
  taxAmount    : Decimal(18,2);
  totalAmount  : Decimal(18,2);
  deliveryDays : Integer;
  brand        : String(100);
  partNumber   : String(100);
  remarks      : String(200);
}

// ═══════════════════════════════════════════════════════════════
// PURCHASE ORDER
// ═══════════════════════════════════════════════════════════════

entity PurchaseOrders : cuid, managed {
  poNumber        : String(20)   not null;
  project         : Association to Projects         not null;
  vendor          : Association to VendorMaster     not null;
  quotation       : Association to VendorQuotations;
  materialRequest : Association to MaterialRequests;
  poDate          : Date         not null;
  deliveryDate    : Date         not null;
  currency        : String(5)    default 'INR';
  subtotal        : Decimal(18,2) default 0;
  taxAmount       : Decimal(18,2) default 0;
  grandTotal      : Decimal(18,2) default 0;
  status          : POStatus     default 'DRAFT';
  paymentTerms    : String(100);
  deliveryAddress : String(500);
  approvedBy      : Association to Users;
  approvalDate    : DateTime;
  remarks         : String(500);
  items           : Composition of many PurchaseOrderItems on items.purchaseOrder = $self;
  deliveries      : Composition of many Deliveries         on deliveries.purchaseOrder = $self;
}

entity PurchaseOrderItems : cuid {
  purchaseOrder : Association to PurchaseOrders  not null;
  lineNumber    : Integer;
  material      : Association to MaterialMaster  not null;
  description   : String(200);
  orderedQty    : Decimal(13,3) not null;
  uom           : String(10)   not null;
  unitPrice     : Decimal(18,4) not null;
  taxPercent    : Decimal(5,2)  default 18;
  taxAmount     : Decimal(18,2);
  totalAmount   : Decimal(18,2);
  deliveredQty  : Decimal(13,3) default 0;
  pendingQty    : Decimal(13,3);
  requestItem   : Association to MaterialRequestItems;
}

// ═══════════════════════════════════════════════════════════════
// DELIVERY
// ═══════════════════════════════════════════════════════════════

entity Deliveries : cuid, managed {
  deliveryNumber   : String(20)  not null;
  purchaseOrder    : Association to PurchaseOrders not null;
  vendor           : Association to VendorMaster   not null;
  scheduledDate    : Date         not null;
  actualDate       : Date;
  status           : DeliveryStatus default 'SCHEDULED';
  vehicleNumber    : String(20);
  driverName       : String(100);
  driverPhone      : String(20);
  eWayBillNumber   : String(30);
  invoiceReference : String(30);
  delayReason      : String(500);
  delayDays        : Integer      default 0;
  siteContact      : String(100);
  remarks          : String(500);
  items            : Composition of many DeliveryItems     on items.delivery    = $self;
  receipts         : Composition of many MaterialReceipts  on receipts.delivery = $self;
}

entity DeliveryItems : cuid {
  delivery      : Association to Deliveries           not null;
  lineNumber    : Integer;
  poItem        : Association to PurchaseOrderItems   not null;
  material      : Association to MaterialMaster       not null;
  description   : String(200);
  dispatchedQty : Decimal(13,3) not null;
  uom           : String(10)   not null;
}

// ═══════════════════════════════════════════════════════════════
// MATERIAL RECEIPT (GRN)
// ═══════════════════════════════════════════════════════════════

entity MaterialReceipts : cuid, managed {
  receiptNumber    : String(20)  not null;
  delivery         : Association to Deliveries      not null;
  purchaseOrder    : Association to PurchaseOrders  not null;
  receiptDate      : DateTime    not null;
  receivedBy       : Association to Users;
  status           : ReceiptStatus default 'PENDING';
  overallRemarks   : String(500);
  verifiedBy       : Association to Users;
  verificationDate : DateTime;
  items            : Composition of many MaterialReceiptItems on items.receipt       = $self;
  damagedItems     : Composition of many DamagedMaterials     on damagedItems.receipt = $self;
}

entity MaterialReceiptItems : cuid {
  receipt       : Association to MaterialReceipts    not null;
  lineNumber    : Integer;
  deliveryItem  : Association to DeliveryItems       not null;
  poItem        : Association to PurchaseOrderItems  not null;
  material      : Association to MaterialMaster      not null;
  description   : String(200);
  dispatchedQty : Decimal(13,3);
  receivedQty   : Decimal(13,3) not null;
  acceptedQty   : Decimal(13,3) not null;
  rejectedQty   : Decimal(13,3) default 0;
  uom           : String(10)   not null;
  condition     : MaterialCondition default 'GOOD';
  remarks       : String(200);
}

entity DamagedMaterials : cuid, managed {
  receipt        : Association to MaterialReceipts     not null;
  receiptItem    : Association to MaterialReceiptItems;
  material       : Association to MaterialMaster       not null;
  damagedQty     : Decimal(13,3) not null;
  uom            : String(10)   not null;
  damageType     : DamageType;
  description    : String(500);
  photoReference : String(200);
  claimStatus    : ClaimStatus  default 'PENDING';
  claimAmount    : Decimal(18,2);
  vendorResponse : String(500);
  resolvedDate   : Date;
}

// ═══════════════════════════════════════════════════════════════
// INVOICE
// ═══════════════════════════════════════════════════════════════

entity Invoices : cuid, managed {
  invoiceNumber     : String(30)   not null;
  vendorInvoiceNo   : String(30)   not null;
  vendor            : Association to VendorMaster    not null;
  purchaseOrder     : Association to PurchaseOrders  not null;
  receipt           : Association to MaterialReceipts;
  invoiceDate       : Date         not null;
  dueDate           : Date;
  currency          : String(5)    default 'INR';
  subtotal          : Decimal(18,2) default 0;
  taxAmount         : Decimal(18,2) default 0;
  totalAmount       : Decimal(18,2) default 0;
  status            : InvoiceStatus default 'DRAFT';
  submittedBy       : Association to Users;
  reviewedBy        : Association to Users;
  approvedBy        : Association to Users;
  approvalDate      : DateTime;
  paymentDate       : Date;
  paymentReference  : String(50);
  remarks           : String(500);
  rejectionReason   : String(500);
  items             : Composition of many InvoiceItems          on items.invoice          = $self;
  threeWayMatches   : Composition of many ThreeWayMatchResults  on threeWayMatches.invoice = $self;
}

entity InvoiceItems : cuid {
  invoice       : Association to Invoices           not null;
  lineNumber    : Integer;
  poItem        : Association to PurchaseOrderItems;
  receiptItem   : Association to MaterialReceiptItems;
  material      : Association to MaterialMaster     not null;
  description   : String(200);
  invoicedQty   : Decimal(13,3) not null;
  uom           : String(10)   not null;
  unitPrice     : Decimal(18,4) not null;
  taxPercent    : Decimal(5,2)  default 18;
  taxAmount     : Decimal(18,2);
  totalAmount   : Decimal(18,2);
}

entity ThreeWayMatchResults : cuid, managed {
  invoice          : Association to Invoices               not null;
  purchaseOrder    : Association to PurchaseOrders         not null;
  receipt          : Association to MaterialReceipts       not null;
  invoiceItem      : Association to InvoiceItems           not null;
  poItem           : Association to PurchaseOrderItems     not null;
  receiptItem      : Association to MaterialReceiptItems   not null;
  material         : Association to MaterialMaster         not null;
  poQty            : Decimal(13,3);
  receivedQty      : Decimal(13,3);
  invoicedQty      : Decimal(13,3);
  poUnitPrice      : Decimal(18,4);
  invoiceUnitPrice : Decimal(18,4);
  quantityMatch    : MatchStatus;
  priceMatch       : MatchStatus;
  overallStatus    : MatchStatus;
  qtyVariance      : Decimal(13,3);
  priceVariance    : Decimal(18,4);
  valueVariance    : Decimal(18,2);
  remarks          : String(500);
}

// ═══════════════════════════════════════════════════════════════
// VENDOR PERFORMANCE
// ═══════════════════════════════════════════════════════════════

entity VendorPerformanceLog : cuid, managed {
  vendor          : Association to VendorMaster  not null;
  purchaseOrder   : Association to PurchaseOrders;
  evaluationDate  : Date          not null;
  deliveryScore   : Decimal(3,1);
  qualityScore    : Decimal(3,1);
  pricingScore    : Decimal(3,1);
  responseScore   : Decimal(3,1);
  overallScore    : Decimal(5,2);
  onTimeDelivery  : Boolean;
  damageReported  : Boolean;
  invoiceAccuracy : Boolean;
  comments        : String(500);
  evaluatedBy     : Association to Users;
}
