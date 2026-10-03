# ADT & SEGW Integration Guide — SolarSage EPC P2P

When your RAP object (ADT) and SEGW services are published and live,
the CAP layer connects to them via the stubs already configured in `.cdsrc.json`.
**No UI changes are needed** — only the credentials/paths below need updating.

---

## 1. Material Receipt Screen — RAP (ADT)

**UI Screen:** `GRNList` / `GRNObjectPage`  
**Current backend:** CAP `ReceiptService` at `/receipt/`  
**Target backend after RAP publish:** `ZMaterialReceipt` RAP BO on SAP BTP / S/4HANA

### What changes when RAP is live

In `.cdsrc.json`, update the `RAP_SERVICE` credentials:

```json
"RAP_SERVICE": {
  "kind": "odata-v4",
  "credentials": {
    "destination": "SOLAR_EPC_RAP",
    "path": "/sap/opu/odata4/sap/zrap_material_receipt/srvd_a2x/sap/zrap_material_receipt/0001/"
  }
}
```

- **`destination`** → the BTP destination name pointing to your S/4HANA system.  
  Create it in BTP cockpit → Connectivity → Destinations (type: HTTP, auth: BasicAuthentication or OAuth2).
- **`path`** → the OData V4 service root URL. Copy it from ADT:  
  `ADT → Service Bindings → ZRAP_MAT_RECEIPT_SRV → right-click → Copy Service URL`

### What to implement in ADT (already documented in SECURITY_ENHANCEMENTS.md)

```
BDEF  : Z_I_MAT_RECEIPT   (managed; no implementation class needed)
CDS   : Z_I_MAT_RECEIPT    (interface view — table zp2p_mat_receipt)
CDS   : Z_C_MAT_RECEIPT    (projection/consumption view — @OData.publish: true)
SrvD  : ZRAP_MAT_RECEIPT_SRV
SrvB  : ZRAP_MAT_RECEIPT_BINDING  (OData V4, UI)
```

### How ExternalServices.js connects after RAP is live

`srv/integration/ExternalServices.js` already has:

```js
async function fetchGRNFromRAP(poNumber) { ... }
```

Once the RAP service is published and the BTP destination is set, this function
returns real GRN data for the three-way match in `invoice-service.js`.

Until then, it gracefully fails and falls back to CAP receipt data.

---

## 2. Delivery Tracking Screen — SEGW (SAP Gateway)

**UI Screen:** `DeliveryList` / `DeliveryObjectPage`  
**Current backend:** CAP `ProcurementService` at `/procurement/Deliveries`  
**Target backend after SEGW publish:** `ZSOLAR_DELIVERY_SRV` on SAP Gateway

### What changes when SEGW is live

In `.cdsrc.json`, update the `SEGW_DELIVERY_SRV` credentials:

```json
"SEGW_DELIVERY_SRV": {
  "kind": "odata-v2",
  "credentials": {
    "destination": "SOLAR_EPC_SEGW",
    "path": "/sap/opu/odata/sap/ZSOLAR_DELIVERY_SRV/"
  }
}
```

- **`destination`** → BTP destination pointing to your SAP Gateway (ABAP) system.
- **`path`** → exact Gateway service path. Find it in:  
  `Gateway Client (transaction /IWFND/GW_CLIENT) → Service Catalog → ZSOLAR_DELIVERY_SRV`

### What to implement in SEGW (SAP Gateway Service Builder)

| Object | Type | Description |
|---|---|---|
| `ZSOLAR_DELIVERY_SRV` | OData V2 Service | Root service in SEGW |
| `ZSolarDelivery` | Entity Type | Maps to Z-table `ZSOLAR_DELIVERY_HDR` |
| `ZSolarDeliverySet` | Entity Set | Collection of deliveries |
| `ZSolarDeliveryItem` | Entity Type | Maps to `ZSOLAR_DELIVERY_ITM` |
| `MarkInTransit` | Function Import | HTTP POST, sets status = IN_TRANSIT |
| `MarkDelivered` | Function Import | HTTP POST, sets status = DELIVERED, sets actualDate |
| `MarkDelayed` | Function Import | HTTP POST, sets delayReason + newScheduledDate |

**Z-table DDL sketch (SE11):**
```abap
ZSOLAR_DELIVERY_HDR:
  DELIVERY_ID    CHAR(36)  KEY   " UUID
  PO_NUMBER      CHAR(20)
  VENDOR_ID      CHAR(36)
  STATUS         CHAR(20)        " PENDING / IN_TRANSIT / DELIVERED / DELAYED
  SCHEDULED_DATE DATS
  ACTUAL_DATE    DATS
  DELAY_DAYS     INT4
  DELAY_REASON   CHAR(200)
  VEHICLE_NUMBER CHAR(20)
  DRIVER_NAME    CHAR(100)
  DRIVER_PHONE   CHAR(20)
  EWAY_BILL      CHAR(50)
  CREATED_AT     TIMESTAMPL
```

### How ExternalServices.js connects

`srv/integration/ExternalServices.js` already has:

```js
async function fetchDeliveriesFromSEGW(poNumber) { ... }
async function patchDeliveryToInvoicedInSEGW(poNumber) { ... }
async function pushDeliveryScheduleToSEGW(po) { ... }
```

These are called from `procurement-service.js` after PO confirmation and from
`invoice-service.js` after invoice approval. They are fire-and-warn — if SEGW
is not reachable, a console warning is logged and the CAP operation continues.

---

## 3. Vendor Management — SEGW (optional migration)

**UI Screen:** `VendorList` / `VendorObjectPage`  
**Current backend:** CAP `VendorService` at `/vendor/` — **fully functional, no migration needed**

If you later want to source vendor master from SAP MDG or ERP:

1. Create `ZVENDOR_SRV` in SEGW with entity `VendorSet` (matching `VendorMaster` fields).
2. Add to `.cdsrc.json`:
   ```json
   "VENDOR_SRV": {
     "kind": "odata-v2",
     "credentials": { "destination": "SOLAR_EPC_SEGW", "path": "/sap/opu/odata/sap/ZVENDOR_SRV/" }
   }
   ```
3. In `vendor-service.js`, add a `READ` handler that calls `VENDOR_SRV.run(SELECT...)` and merges results.

---

## 4. BTP Destination Setup (for both RAP + SEGW)

In SAP BTP Cockpit → your subaccount → Connectivity → Destinations:

### Destination: `SOLAR_EPC_RAP`
```
Name           : SOLAR_EPC_RAP
Type           : HTTP
URL            : https://<your-s4-host>:<port>
Proxy Type     : OnPremise   (if behind Cloud Connector) or Internet
Authentication : BasicAuthentication
User           : <service user>
Password       : <password>
```
Additional Properties:
```
sap-client     : 100
WebIDEEnabled  : true
```

### Destination: `SOLAR_EPC_SEGW`
```
Name           : SOLAR_EPC_SEGW
Type           : HTTP
URL            : https://<your-gateway-host>:<port>
Proxy Type     : OnPremise
Authentication : BasicAuthentication
User           : <service user>
Password       : <password>
```

---

## 5. Testing the Integration (after publish)

### Test RAP endpoint directly
```bash
# Replace <host> and <credentials>
curl -u user:pass \
  "https://<s4-host>/sap/opu/odata4/sap/zrap_material_receipt/srvd_a2x/sap/zrap_material_receipt/0001/MatReceipt" \
  -H "Accept: application/json"
```

### Test SEGW endpoint directly
```bash
curl -u user:pass \
  "https://<gateway-host>/sap/opu/odata/sap/ZSOLAR_DELIVERY_SRV/ZSolarDeliverySet" \
  -H "Accept: application/json"
```

### Test through CAP (after destinations are set)
```bash
# From local — CAP will proxy through the BTP destination
curl -u mgmt1:pass "http://localhost:4004/procurement/Deliveries"
curl -u site1:pass  "http://localhost:4004/receipt/MaterialReceipts"
```

---

## 6. File Reference Map

| File | What to change |
|---|---|
| `.cdsrc.json` | Update `credentials.destination` and `credentials.path` for RAP_SERVICE and SEGW_DELIVERY_SRV |
| `srv/integration/ExternalServices.js` | Update entity set names if they differ from the draft (e.g. `ZSolarDeliverySet` → actual name) |
| `app/.../manifest.json` | No changes needed — UI is already wired |
| `app/.../RoleService.js` | No changes needed — route guards are in place |

---

## 7. Summary

| Screen | Template | Service | Ready Now | After Publish |
|---|---|---|---|---|
| GRN List/Detail | Fiori Elements LR + OP | CAP ReceiptService | ✅ Full CAP | Update `.cdsrc.json` RAP_SERVICE path |
| Delivery List/Detail | Fiori Elements LR + OP | CAP ProcurementService | ✅ Full CAP | Update `.cdsrc.json` SEGW_DELIVERY_SRV path |
| Purchase Orders | Fiori Elements ALP + OP | CAP ProcurementService | ✅ Full CAP | No change needed |
| Vendor Management | Fiori Elements LR + OP | CAP VendorService | ✅ Full CAP | Optional SEGW migration |
| Management Dashboard | Custom View | CAP DashboardService | ✅ Full CAP | No change needed |
