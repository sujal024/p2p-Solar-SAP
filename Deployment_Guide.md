# Cloud Foundry Deployment Guide
**Project:** Solar EPC Procure-to-Pay System
**Target Environment:** SAP Cloud Foundry (BTP)
**CI/CD:** GitHub Actions

---

## 1. Pre-Deployment: Codebase Preparation

Before deploying, the application must be transitioned from a local mock-environment to a BTP-ready enterprise architecture. 

### 1.1 Transition Database to SAP HANA
Run the following commands in your root directory to install HANA dependencies and update configurations:
```bash
npm install --save @sap/hana-client
cds add hana
```
*Note: This updates `package.json` to use SQLite for development and HANA for production.*

### 1.2 Implement XSUAA Security
Replace the mock UI login with enterprise SSO:
```bash
cds add xsuaa
```
This generates `xs-security.json`. Update this file to define your 7 roles (BDM, ENGINEER, PROJECT_MANAGER, PROCUREMENT_OFFICER, SITE_ENGINEER, FINANCE_OFFICER, MANAGEMENT) as BTP Role Templates.

### 1.3 Add AppRouter and HTML5 Deployer
To serve the Fiori Launchpad and route API calls securely:
```bash
cds add approuter
```
Configure the `xs-app.json` file in your AppRouter module to route `/odata/` to your CAP backend and `/` to your HTML5 repository.

### 1.4 Generate MTA Descriptor
Generate the Multi-Target Application descriptor:
```bash
cds add mta
```
Review the generated `mta.yaml`. Ensure it defines:
1. **Modules:** `maha_project-srv`, `maha_project-db-deployer`, `maha_project-approuter`
2. **Resources:** `maha_project-db` (HDI Container), `maha_project-auth` (XSUAA), `maha_project-destination`

---

## 2. SAP BTP Subaccount Preparation

Before GitHub Actions can deploy, your target SAP BTP Subaccount needs specific entitlements and services provisioned.

### 2.1 Entitlements Needed
- **SAP HANA Cloud:** 1 Instance
- **SAP HANA Schemas & HDI Containers:** 1 Instance
- **Authorization and Trust Management Service (XSUAA):** Application plan
- **Cloud Foundry Runtime:** Requisite memory quota (e.g., 2 GB)
- **Destination Service & HTML5 Repo Services**

### 2.2 Provision HANA Database
Ensure an SAP HANA Cloud instance is running in your space. An HDI container will automatically be created and bound during the `cf deploy` process, but the HANA DB itself must be active.

---

## 3. GitHub Actions Setup

To automate the deployment, we will use a GitHub Actions workflow that builds the `.mtar` archive using the `mbt` tool and deploys it using the `cf deploy` CLI plugin.

### 3.1 Configure GitHub Secrets
Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions**. Add the following repository secrets:

| Secret Name     | Description |
|-----------------|-------------|
| `CF_API`        | The API URL for your CF region (e.g., `https://api.cf.us10.hana.ondemand.com`) |
| `CF_ORG`        | Your Cloud Foundry Organization name |
| `CF_SPACE`      | Your Cloud Foundry Space name (e.g., `dev` or `prod`) |
| `CF_USERNAME`   | Your SAP BTP user email address |
| `CF_PASSWORD`   | Your SAP BTP password (or API Key) |

### 3.2 Create the Workflow File
Create the folder structure `.github/workflows/` in your repository and add a file named `cf-deploy.yml`.

```yaml
name: Build and Deploy to SAP Cloud Foundry

on:
  push:
    branches:
      - main  # Trigger deployment on push to the main branch
  workflow_dispatch: # Allow manual trigger from GitHub UI

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      # 1. Checkout Code
      - name: Checkout Code
        uses: actions/checkout@v3

      # 2. Setup Node.js
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      # 3. Install NPM Dependencies
      - name: Install dependencies
        run: npm ci

      # 4. Install Cloud MTA Build Tool (MBT)
      - name: Install MBT
        run: npm install -g mbt

      # 5. Build the MTA Archive
      - name: Build MTA
        run: mbt build -t ./gen

      # 6. Install Cloud Foundry CLI
      - name: Install CF CLI
        run: |
          wget -q -O - https://packages.cloudfoundry.org/debian/cli.cloudfoundry.org.key | sudo apt-key add -
          echo "deb https://packages.cloudfoundry.org/debian stable main" | sudo tee /etc/apt/sources.list.d/cloudfoundry-cli.list
          sudo apt-get update
          sudo apt-get install cf8-cli

      # 7. Install MultiApps Plugin (required for cf deploy)
      - name: Install CF MultiApps Plugin
        run: cf install-plugin multiapps -f

      # 8. Login to SAP Cloud Foundry
      - name: Login to CF
        run: |
          cf api ${{ secrets.CF_API }}
          cf auth "${{ secrets.CF_USERNAME }}" "${{ secrets.CF_PASSWORD }}"
          cf target -o "${{ secrets.CF_ORG }}" -s "${{ secrets.CF_SPACE }}"

      # 9. Deploy to CF
      - name: Deploy MTAR
        run: cf deploy ./gen/*.mtar -f
```

---

## 4. Post-Deployment Activities

Once the GitHub Action completes successfully, perform the following tasks:

### 4.1 Assign Role Collections
Because of XSUAA integration, users will no longer have access natively.
1. Open SAP BTP Cockpit.
2. Navigate to your Subaccount -> **Security** -> **Role Collections**.
3. The deployment will have created new Role Collections (e.g., `MahaProject_BDM`, `MahaProject_Engineer`).
4. Assign your email/user ID to the appropriate Role Collections to grant access.

### 4.2 Seed the Database
Local `.csv` files inside `/db/data/` are automatically deployed to the HANA database upon first push by the HDI deployer module. To update or modify data in production going forward, you can use the AppRouter frontend, or run `cds deploy --to hana` manually locally if connected to the cloud DB.

### 4.3 Configure Destinations (For Phase 2)
In your SAP BTP Cockpit, navigate to **Connectivity** -> **Destinations**. 
Create standard SAP destinations for your legacy ERP systems (SAP Gateway / SAP S/4HANA) mapping to the endpoints you plan to use for Purchase Orders and GR matching.

---

## Troubleshooting

* **`cf deploy` fails with "Service broker error":** Usually indicates insufficient memory or missing entitlements for SAP HANA Cloud or XSUAA in your subaccount space.
* **HDI Deployment fails:** Ensure your `mta.yaml` defines the correct `hana` service plan (`hdi-shared`) and that you have a running HANA instance.
* **HTTP 401/403 on Frontend:** Role Collections have not been assigned to your user, or the `xs-app.json` routes are not propagating the JWT token correctly (`authenticationMethod: "route"` missing).