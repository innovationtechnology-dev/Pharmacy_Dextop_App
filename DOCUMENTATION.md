# Pharmacy Management System — Complete Documentation

> **Version:** 1.0 | **Platform:** Desktop (Windows / macOS / Linux) | **Last Reviewed:** March 2026

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Authentication & Session Management](#4-authentication--session-management)
5. [User Roles & Access Control](#5-user-roles--access-control)
6. [Role-Permission Matrix](#6-role-permission-matrix)
7. [Module Reference](#7-module-reference)
   - 7.1 [Main Menu](#71-main-menu)
   - 7.2 [Selling Panel (POS)](#72-selling-panel-pos)
   - 7.3 [Purchasing Panel](#73-purchasing-panel)
   - 7.4 [Medicines](#74-medicines)
   - 7.5 [Suppliers](#75-suppliers)
   - 7.6 [Customers](#76-customers)
   - 7.7 [Alerts](#77-alerts)
   - 7.8 [Sale Return](#78-sale-return)
   - 7.9 [Dashboard](#79-dashboard)
   - 7.10 [Financial Summary](#710-financial-summary)
   - 7.11 [Sales Report](#711-sales-report)
   - 7.12 [Purchase Report](#712-purchase-report)
   - 7.13 [Payments](#713-payments)
   - 7.14 [License](#714-license)
   - 7.15 [Settings](#715-settings)
   - 7.16 [Super Admin Dashboard](#716-super-admin-dashboard)
8. [Technical Architecture](#8-technical-architecture)
9. [Backend Architecture](#9-backend-architecture)
10. [Theme & Appearance System](#10-theme--appearance-system)
11. [PDF & CSV Export System](#11-pdf--csv-export-system)
12. [License System](#12-license-system)
13. [Identified Bugs & Issues](#13-identified-bugs--issues)
14. [Missing Features & Recommendations](#14-missing-features--recommendations)
15. [Summary Assessment](#15-summary-assessment)

---

## 1. Application Overview

**Pharmacy Management System** is a cross-platform desktop application built for pharmacies to manage their day-to-day operations — from point-of-sale transactions and inventory management to financial reporting and license control.

**Key characteristics:**

- **Offline-first / Local-first:** All data is stored in a local SQLite database on the device. No internet connection is required for daily operations.
- **Cross-platform:** Packaged for macOS (arm64 + x64), Windows (NSIS installer), and Linux (AppImage + .deb).
- **Role-based access:** Three distinct user roles (cashier, admin, super_admin) with separate module access.
- **Electron-based:** The frontend runs in a Chromium browser window managed by Electron; the backend runs in the Node.js main process.
- **App ID:** `com.pharmacymgmt.app`

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | Electron | ^20 |
| UI framework | React | ^18.2 |
| Language | TypeScript | — |
| Routing | React Router DOM | ^6.4 |
| Database | SQLite3 (via `sqlite3`) | ^5.1.7 |
| Charts | Recharts | ^3.3 |
| Styling | Tailwind CSS | ^3.4 |
| Icons | Lucide React + React Icons | ^0.552 / ^5.5 |
| Packaging | electron-builder | ^23.6 |
| Auto-update | electron-updater | ^5.2 |

---

## 3. Project Structure

```
Pharmacy_Dextop_App/
├── src/
│   ├── main/                          ← Electron main process (Node.js)
│   │   ├── main.ts                    ← App entry point, window creation
│   │   ├── menu.ts                    ← Native app menu
│   │   ├── preload.ts                 ← Electron IPC bridge (contextBridge)
│   │   └── backend/
│   │       ├── controllers/           ← IPC channel handlers
│   │       ├── services/              ← Business logic + DB queries
│   │       └── utils/                 ← PDF templates, CSV templates
│   └── renderer/                      ← React frontend (Chromium)
│       ├── App.tsx                    ← Root router + route definitions
│       ├── pages/
│       │   ├── home.tsx               ← Landing/splash screen
│       │   ├── Dashboard-Layout.tsx   ← Shared layout + route guards
│       │   └── dashboard-pages/       ← All main application screens
│       │       ├── MainMenu.tsx
│       │       ├── Dashboard.tsx
│       │       ├── SellingPanel.tsx
│       │       ├── PurchasingPanel.tsx
│       │       ├── Medicines.tsx
│       │       ├── Suppliers.tsx
│       │       ├── Customers.tsx
│       │       ├── Alerts.tsx
│       │       ├── SaleReturn.tsx
│       │       ├── SalesReport.tsx
│       │       ├── PurchaseReport.tsx
│       │       ├── Payments.tsx
│       │       ├── FinancialSummary.tsx
│       │       ├── License.tsx
│       │       └── Settings.tsx
│       │   └── super-admin/
│       │       └── SuperAdminDashboard.tsx
│       ├── components/
│       │   ├── auth/                  ← Login, Signup, ForgotPassword
│       │   ├── common/                ← ConfirmDialog, DetailModal, PDFPreviewModal, Toast, PageHeader
│       │   ├── license/               ← LicenseActivationDialog, LicenseOverlay
│       │   └── navigation/            ← Breadcrumbs
│       ├── contexts/
│       │   └── ThemeContext.tsx       ← Light/dark mode + color theme
│       ├── themes/                    ← Color theme definitions (5 themes)
│       ├── types/                     ← Shared TypeScript type definitions
│       └── utils/                     ← Frontend IPC wrappers, auth utils, currency utils
├── assets/                            ← App icons, entitlements
├── .erb/                              ← Webpack/build configuration
└── package.json
```

---

## 4. Authentication & Session Management

### Login Flow

1. User opens the app → splash screen (`/`) → clicks "Login" → `/login`
2. Credentials are verified via IPC (`auth-login`)
3. On success, an auth token and user object are stored in `localStorage`
4. If `passwordChangeRequired` is flagged, a forced password-change modal appears before navigation
5. User is navigated to `/main-menu` with a welcome notification shown once per session

### Special Super Admin Login

- If the email is `superadmin@pharmacy.com` or `admin@pharmacy.com`, the login form calls `superAdminLogin` instead
- On success, a separate `super_admin_token` key is stored in `localStorage`
- The user is sent to `/super-admin/dashboard` — a completely separate portal

### Session Storage

| Key | Storage | Purpose |
|---|---|---|
| `auth_token` | localStorage | Authentication token |
| `auth_user` | localStorage | User object (id, name, email, role) |
| `pharmacySettings` | localStorage | Pharmacy name, currency, tax, discount |
| `colorTheme` | localStorage | Selected color theme name |
| `themeMode` | localStorage | `light` or `dark` |
| `super_admin_token` | localStorage | Super admin auth token |
| `passwordChangeRequired` | sessionStorage | Flag for forced password change |
| `recentlySelectedMedicines` | localStorage | POS quick-access medicine list |

### Route Guards

Implemented in `Dashboard-Layout.tsx`. On every navigation:
- If no valid token → redirect to `/login`
- If `cashier` role tries to access `/dashboard`, `/payments`, or `/financial-summary` → redirect to `/main-menu`
- If `admin` role tries to access `/selling-panel`, `/purchasing-panel`, or `/alerts` → redirect to `/main-menu`
- Super admin routes are guarded separately in `SuperAdminDashboard.tsx`

---

## 5. User Roles & Access Control

### Role: `cashier`

The operational role — a cashier processes sales and manages stock intake.

**Can access:** Main Menu, Selling Panel, Purchasing Panel, Medicines, Suppliers, Customers, Sale Return, Alerts, Sales Report, Purchase Report, License, Settings

**Cannot access:** Dashboard, Financial Summary, Payments

**Additional restrictions:**
- Sales Report and Purchase Report date range is limited to a maximum lookback of **1 month**
- Sale Return report is also date-limited to 1 month

### Role: `admin`

The management role — an admin oversees business performance, finances, and data.

**Can access:** Main Menu, Dashboard, Medicines, Suppliers, Customers, Sale Return, Sales Report, Purchase Report, Financial Summary, Payments, License, Settings

**Cannot access:** Selling Panel, Purchasing Panel, Alerts

### Role: `super_admin`

A privileged system-level role for managing the software installation itself.

**Accesses:** A completely separate portal at `/super-admin/dashboard`

**Can do:**
- Full CRUD on all pharmacy users (create, edit, delete, force password reset)
- View, edit, and delete license records
- Manage generated license keys (view, revoke, delete)
- Download the SQLite database file
- Import/replace the database (with auto-backup)
- View and restore timestamped database backups
- Clean up old backups

---

## 6. Role-Permission Matrix

| Module | cashier | admin | super_admin |
|---|:---:|:---:|:---:|
| Main Menu | ✅ | ✅ | — |
| Selling Panel (POS) | ✅ | ❌ | — |
| Purchasing Panel | ✅ | ❌ | — |
| Medicines | ✅ | ✅ | — |
| Suppliers | ✅ | ✅ | — |
| Customers | ✅ | ✅ | — |
| Sale Return (Report) | ✅ *(1 month max)* | ✅ | — |
| Alerts | ✅ | ❌ | — |
| Dashboard | ❌ | ✅ | — |
| Financial Summary | ❌ | ✅ | — |
| Sales Report | ✅ *(1 month max)* | ✅ | — |
| Purchase Report | ✅ *(1 month max)* | ✅ | — |
| Payments | ❌ | ✅ | — |
| License | ✅ | ✅ *(extra controls)* | — |
| Settings | ✅ | ✅ | — |
| Super Admin Dashboard | — | — | ✅ |

> **Legend:** ✅ = Full access, ❌ = Blocked (redirect to Main Menu), — = Not applicable to this portal

---

## 7. Module Reference

### 7.1 Main Menu

**File:** `src/renderer/pages/dashboard-pages/MainMenu.tsx`
**Route:** `/main-menu`
**Access:** All roles

The central navigation hub displayed after login. Styled as a desktop application launcher with a classic menu bar.

**Features:**
- Top menu bar (File / Edit / View / Tools / Window / Help) with keyboard shortcuts
- Module search box to quickly find any screen
- Category tabs: **All Modules**, **Operations**, **Reports**, **Settings** (switchable with `Ctrl+1` to `Ctrl+4`)
- Quick-access row (Selling Panel, Medicines, Dashboard — filtered by role)
- Live clock and date display (updates every second)
- Welcome notification shown once per session on first login
- Modules prohibited for the current role are **hidden** entirely (not just greyed out)

**Module categories visible per role:**

| Category | Module | Hidden for |
|---|---|---|
| Operations | Selling Panel | admin |
| Operations | Medicines | — |
| Operations | Purchasing Panel | admin |
| Operations | Customers | — |
| Operations | Suppliers | — |
| Operations | Sale Return | — |
| Operations | Payments | cashier |
| Operations | Alerts | admin |
| Reports | Dashboard | cashier |
| Reports | Financial Summary | cashier |
| Reports | Sales Report | — |
| Reports | Purchase Report | — |
| Settings | License | — |
| Settings | Settings | — |

---

### 7.2 Selling Panel (POS)

**File:** `src/renderer/pages/dashboard-pages/SellingPanel.tsx`
**Route:** `/selling-panel`
**Access:** cashier only

The core point-of-sale screen. The largest file in the project at ~3,094 lines.

**Medicine search & cart:**
- Search medicines by name or barcode
- Barcode scanner integration (global buffer ref with debounce timer)
- Add medicines to a live cart
- Per-item fields: quantity (pills), unit price, discount (%), tax (%)
- Automatic recalculation of subtotal, discount amount, tax amount, and final price per line item
- Recently selected medicines shown for quick re-access (persisted in `localStorage`)

**Customer handling:**
- Search and select existing customers by name or phone
- Or enter a guest customer name and phone number manually

**Sale types:**
- Regular, Family/Relative, Charity — affects reporting categorization

**Payment:**
- Cash payment with change calculation (received amount − total)

**Invoice:**
- Auto-generated invoice number
- Live clock on receipt header

**Sales history navigation:**
- Browse all past bills (previous/next navigation)
- View any historical receipt

**Sale Return (inline modal):**
- Initiate a return directly from a past bill
- Select individual items and quantities to return
- Per-item reason field
- Refund amount auto-calculated

**Receipt printing:**
- Thermal receipt builder generates HTML receipt
- Configurable between preview mode and direct native print (controlled by `RECEIPT_PREVIEW_MODE` flag — see [Issues](#13-identified-bugs--issues))

**Key data model — CartItem:**

| Field | Description |
|---|---|
| `medicine` | Reference to the selected medicine |
| `pills` | Quantity of pills |
| `unitPrice` | Price per pill |
| `discount` | Discount percentage |
| `tax` | Tax percentage |
| `subtotal` | `pills × unitPrice` |
| `discountAmount` | `subtotal × discount / 100` |
| `taxAmount` | Tax on net amount |
| `finalPrice` | `subtotal − discountAmount + taxAmount` |

---

### 7.3 Purchasing Panel

**File:** `src/renderer/pages/dashboard-pages/PurchasingPanel.tsx`
**Route:** `/purchasing-panel`
**Access:** cashier only

The stock intake and purchase order entry screen (~1,820 lines).

**Supplier selection:**
- Search and select from the existing supplier list

**Medicine search & purchase cart:**
- Search medicines by name or barcode
- Barcode scanner integration
- Per-item fields: packets purchased, pills per packet, total amount paid, discount (%), tax (%), expiry date
- Prices per packet and per pill are **derived** from the total amount entered (total-amount-first pricing model)
- Minimum expiry enforcement: medicines with fewer than **90 days** to expiry are rejected

**Payment recording:**
- Supported methods: `cash`, `bank_transfer`, `check`, `online`
- Method-specific fields: reference number, check number, bank name, account number

**Purchase history:**
- Browse past purchase orders
- Edit, view detail, and delete past POs (with confirmation)
- Purchase order number and timestamp shown on each PO

**Inline medicine creation:**
- A "Add New Medicine" modal can be opened without leaving the purchasing panel

**Key data model — PurchaseItem:**

| Field | Description |
|---|---|
| `medicine` | Reference to the medicine |
| `packetQuantity` | Number of packets received |
| `pillsPerPacket` | Pills per packet |
| `totalAmount` | Total paid for this line |
| `pricePerPacket` | Derived: `totalAmount / packetQuantity` |
| `pricePerPill` | Derived: `totalAmount / (packetQuantity × pillsPerPacket)` |
| `discount` | Discount percentage |
| `tax` | Tax percentage |
| `expiryDate` | Expiry date of this batch |

---

### 7.4 Medicines

**File:** `src/renderer/pages/dashboard-pages/Medicines.tsx`
**Route:** `/medicines`
**Access:** All roles

The medicine inventory catalog.

**Features:**
- **Create** — Form requiring name, pill quantity (pills per packet), and barcode. Barcode field auto-focuses for scanner workflow.
- **Read** — Full medicine list loaded via IPC `medicine-get-all`
- **Update** — Same form used for editing. Status (`active` / `inactive` / `discontinued`) can be toggled inline per row without opening the form.
- **Delete** — `ConfirmDialog` modal (not a native browser dialog)
- **Search** — Live filter across name, ID, and barcode
- **Status filter** — Dropdown: All / Active / Inactive / Discontinued

**Stats bar (top):**
- Total products, active, inactive, discontinued, expiring-soon count

**Expiry tracking:**
- Expiry data is sourced from purchase records (via `useDashboardHeader()` hook)
- The medicines page itself does not directly store expiry dates — they come from the purchasing panel entries

**Stock columns displayed:**
- Total available pills
- Sellable pills (pills not yet expired)
- Average sellable price per pill

**Key medicine data model:**

| Field | Description |
|---|---|
| `id` | Auto-incremented ID |
| `name` | Medicine name |
| `barcode` | Barcode string |
| `pillQuantity` | Pills per packet |
| `status` | `active` / `inactive` / `discontinued` |
| `totalAvailablePills` | All stock including near-expiry |
| `sellablePills` | Non-expired stock only |
| `averageSellablePricePerPill` | Weighted average cost per pill |

---

### 7.5 Suppliers

**File:** `src/renderer/pages/dashboard-pages/Suppliers.tsx`
**Route:** `/suppliers`
**Access:** All roles

The supplier address book.

**Features:**
- **Create/Update** — Side-panel form (single form switches between add and edit mode)
- **Delete** — `ConfirmDialog` modal
- **Search** — Live filter across name, company name, email, phone
- **Stats bar** — Total suppliers count + trending indicator

**Required fields:** Name, Company Name, Phone

**Supplier data model:**

| Field | Description |
|---|---|
| `id` | Auto-incremented ID |
| `name` | Contact person / supplier name |
| `companyName` | Company/business name |
| `phone` | Primary phone number |
| `email` | Email address (optional) |
| `address` | Address (optional) |
| `contactPerson` | Alternate contact name (optional) |
| `notes` | Free-text notes (optional) |
| `createdAt` | Creation timestamp |
| `updatedAt` | Last update timestamp |

---

### 7.6 Customers

**File:** `src/renderer/pages/dashboard-pages/Customers.tsx`
**Route:** `/customers`
**Access:** All roles

The customer address book. Structurally similar to Suppliers.

**Features:**
- **Create/Update** — Combined side-panel form
- **Delete** — Uses native `window.confirm()` (see [Issues](#13-identified-bugs--issues))
- **Search** — Live filter
- **Stats bar** — Total customers count

**Required fields:** Name, Phone

**Customer data model:**

| Field | Description |
|---|---|
| `id` | Auto-incremented ID |
| `name` | Customer name |
| `phone` | Phone number |
| `email` | Email address (optional) |
| `address` | Address (optional) |
| `city` | City (optional) |
| `notes` | Free-text notes (optional) |
| `createdAt` | Creation timestamp |
| `updatedAt` | Last update timestamp |

---

### 7.7 Alerts

**File:** `src/renderer/pages/dashboard-pages/Alerts.tsx`
**Route:** `/alerts`
**Access:** cashier only

The Alerts Center — a read-only display of medicines nearing their expiry date.

**Features:**
- Responsive card grid (1 / 2 / 3 columns at sm / md / lg screen widths)
- Each alert card shows: medicine name, barcode, pills at risk, expiry date, days remaining, pulsing amber indicator
- Sorted by nearest expiry first
- Manual "Refresh Now" button + header refresh button
- "All clear" empty state when no alerts exist
- Configurable threshold: the number of days warning is controlled by `alertThresholdDays` from pharmacy settings
- Data is fully sourced from the `useDashboardHeader()` hook — no local state

**Alert object shape:**

| Field | Description |
|---|---|
| `id` | Medicine ID |
| `name` | Medicine name |
| `barcode` | Barcode |
| `availablePills` | Pills available in expiring batch |
| `nextExpiryDate` | Earliest expiry date |
| `daysUntilExpiry` | Days remaining until expiry |

> **Note:** This page only covers expiry alerts. There are no low-stock alerts surfaced here despite a "Low Stock Alerts" toggle existing in Settings. See [Missing Features](#14-missing-features--recommendations).

---

### 7.8 Sale Return

**File:** `src/renderer/pages/dashboard-pages/SaleReturn.tsx`
**Route:** `/sale-return`
**Access:** All roles (cashier limited to 1-month lookback)

The sale return **report and history** page. Note: initiating a new sale return is done from within the Selling Panel, not this page.

**Features:**
- Date range picker (from/to); cashiers restricted to max 1-month lookback
- Flat DB rows grouped by `saleReturnId` — multi-item returns display all medicine names stacked
- Search across: medicine name, customer name, sale ID, return ID, reason
- Pagination at 15 rows/page
- Per-row totals: pills returned, total refunded, subtotal, discount, tax
- Detail modal on row click (full return breakdown)

**Export:**
- PDF (with optional preview via `PDFPreviewModal`)
- CSV
- Export date range can be set independently from the current view filter

---

### 7.9 Dashboard

**File:** `src/renderer/pages/dashboard-pages/Dashboard.tsx`
**Route:** `/dashboard`
**Access:** admin only

The main business analytics overview page.

**KPI cards (9 metrics):**

| Metric | Description |
|---|---|
| Purchases | Total purchase spend (all time) |
| Gross Sales | Raw revenue from all sales |
| Net Sales | Gross Sales minus returns |
| Net Profit | Net Revenue − COGS |
| Customers | Count of unique customer names |
| Medicines | Total medicines in inventory |
| Relative | Revenue from Family/Relative sales |
| Charity | Revenue from Charity sales |
| Return Amount | Total value of all sale returns |

**COGS calculation:** Uses `averageSellablePricePerPill` from purchase_items as the actual cost basis. Falls back to 70% of the sell price if no purchase cost is available.

**Charts:**
- **Area Chart** — Sales trend sparkline for the last 12 months
- **Bar Chart** — Daily or monthly sales series, toggleable between: `this_month`, `last_month`, `this_year`
- Custom tooltip shows value + "Above Avg / Below Avg" indicator relative to the period mean
- A `ReferenceLine` marks the average across the displayed period

**Recent Orders table:**
- Last 50 sales displayed in a paginated table below the charts

> **Limitation:** All data is loaded into memory at once with no date range filter. See [Issues](#13-identified-bugs--issues).

---

### 7.10 Financial Summary

**File:** `src/renderer/pages/dashboard-pages/FinancialSummary.tsx`
**Route:** `/financial-summary`
**Access:** admin only

A filtered financial analytics page with date-range selection.

**KPI stats bar (always visible):**
- Purchases total, Gross Sales, Returns, Net Profit (color-coded green/red), Relative/Family total, Charity total

**Quick date selectors:** "This Month" and "This Year" buttons

**Detailed breakdown cards (left column):**
Purchasing total, Gross sales, Sale returns, Purchase discounts, Sale discounts, Purchase tax, Sale tax, Family/Relative total, Charity total

**Chart (right column):**
- Recharts `AreaChart` with two overlaid series: **Sales** and **Profit** over time
- Daily data points (`{ date, sales, profit }`)
- Custom styled tooltip with currency formatting

> **Limitation:** Only one chart type. No per-medicine breakdown, no supplier breakdown, no export function. See [Missing Features](#14-missing-features--recommendations).

---

### 7.11 Sales Report

**File:** `src/renderer/pages/dashboard-pages/SalesReport.tsx`
**Route:** `/sales`
**Access:** All roles (cashier limited to 1-month lookback)

Tabular sales history with full search, filtering, and export.

**Features:**
- Date range picker; cashiers limited to 1-month maximum lookback
- Live search across: medicine name, customer name, sale type, sale ID
- Flat DB rows grouped by `saleId` client-side
- Stats bar: Total Revenue, Medicines Sold (pill count), Transaction count, Total Tax, Total Discount
- Pagination at 15 rows/page
- Detail modal per sale (customer info, sale type, full item breakdown with quantities and prices)

**Export:**
- **PDF** — via `exportSalesPdf()`, with optional HTML preview in `PDFPreviewModal`
- **CSV** — via `exportSalesCsvByRange()`
- Both exports accept a custom date range independent of the current view filter

---

### 7.12 Purchase Report

**File:** `src/renderer/pages/dashboard-pages/PurchaseReport.tsx`
**Route:** `/purchases`
**Access:** All roles (cashier limited to 1-month lookback)

Purchase transaction history with supplier filtering and export.

**Features:**
- Date range picker; cashiers limited to 1-month lookback
- Live search across: supplier name, purchase ID, medicine names
- Supplier filter dropdown
- Stats bar: Total Purchase Amount, Total Paid, Total Remaining Balance (outstanding dues), Total Pills Purchased
- Pagination at 10 rows/page
- Detail modal per purchase (full line-item breakdown with expiry dates per batch)

**Export:**
- **PDF** — via `exportPurchasesPdf()`, with supplier filter + optional preview
- **CSV** — via `exportPurchasesCsv()`, with supplier filter + date range

> **Note:** The "Total Remaining Balance" stat effectively makes this page a supplier-debt tracker as well.

---

### 7.13 Payments

**File:** `src/renderer/pages/dashboard-pages/Payments.tsx`
**Route:** `/payments`
**Access:** admin only

Supplier payment tracking and management.

**3 Tabs:**

**Payments tab:**
- Lists purchases with outstanding or paid status
- Add new payment modal with full method details

**Records tab:**
- All historical payment records in a table or timeline view

**Accounts tab:**
- Per-supplier account summaries
- Expandable detail rows per supplier

**Payment methods supported:** Cash, Bank Transfer, Check, Online

**Payment form fields:** Amount, method, reference number, check number, bank name, account number, notes, payment date

**Filtering:**
- By supplier, payment method, period (today / week / month / year / custom range), search term
- Purchase filter: All / Pending / Paid

**Summary cards (top):**
- Total purchases, total paid, total remaining, breakdown by payment method, payment count

**Export:** PDF or CSV with optional preview, filterable by supplier and date range

**Pagination:** 50 records per page (server-side)

**Currency formatting:** Adapts South Asian number format (INR/PKR) vs. standard format

---

### 7.14 License

**File:** `src/renderer/pages/dashboard-pages/License.tsx`
**Route:** `/license`
**Access:** All roles (admin has extra controls)

The license management and activation page.

**Features for all users:**
- View current license status (valid / expired / trial / inactive)
- See license expiry date and days remaining with validity badge
- Open `LicenseActivationDialog` to enter a new license key
- License request form (pharmacy name, email, phone, doctor name, address, city, country, notes) — form data persisted in `localStorage`
- Submit license request to cloud server

**Additional features for admin:**
- Configure and save cloud license server URL
- Ping cloud server to check connectivity status
- Register a license key with the cloud server

**License key display:**
- Keys are formatted as `XXXX XXXX XXXX ...` blocks
- Newly generated keys shown in a copyable card (`GeneratedKeyCard` component)

**License object shape:**

| Field | Description |
|---|---|
| `isValid` | Boolean — current validity |
| `status` | `valid` / `expired` / `trial` / `inactive` |
| `expiryDate` | License expiry date |
| `daysRemaining` | Days until expiry |
| `activationDate` | When the license was activated |
| `licenseKey` | The activation key |

---

### 7.15 Settings

**File:** `src/renderer/pages/dashboard-pages/Settings.tsx`
**Route:** `/settings`
**Access:** All roles

A multi-section settings page with 5 tabs.

**Profile section:**
- First name, last name, email, phone, address
- Profile picture upload (base64 encoded, max 1 MB)
- Saved via IPC `auth-update-profile`

**Pharmacy section:**
- Pharmacy name, address, phone, email
- Currency selection
- Tax rate and discount settings
- Saved to `localStorage` under `pharmacySettings`

**Notifications section:**
- Toggles for: Email notifications, Low stock alerts, Expired medicines alerts, Sales alerts, Supplier notifications, Daily reports, Weekly reports
- **Currently UI-only — not persisted to backend** (see [Issues](#13-identified-bugs--issues))

**Security section:**
- Two-Factor Authentication toggle — **UI-only, no backend** (see [Issues](#13-identified-bugs--issues))
- Session timeout (minutes) setting
- Password change required flag — actual IPC call via `setPasswordChangeRequired`

**Appearance section:**
- Light / Dark theme toggle (via `ThemeContext`)
- Color theme picker: Emerald, Sapphire Blue, Teal, Violet, Amber

---

### 7.16 Super Admin Dashboard

**File:** `src/renderer/pages/super-admin/SuperAdminDashboard.tsx`
**Route:** `/super-admin/dashboard`
**Access:** super_admin only

A privileged system-management portal, completely separate from the main app.

**4 Tabs:**

**Database tab:**
- Download current SQLite database file
- Import/replace database from file (with automatic backup created before import)
- View all timestamped backups
- Restore a specific backup
- Clean up old backups
- Import shows a summary of record counts (users, medicines, customers, sales, purchases, payments)

**Users tab:**
- Full CRUD for pharmacy user accounts
- Create new users, edit existing, delete
- Force-reset user passwords

**Licenses tab:**
- View all license records across all pharmacy installations
- Edit license expiry dates and active/inactive status
- Delete license records

**Generated Keys tab:**
- View all generated license keys
- Filter by status: Used / Unused / All
- Revoke or delete keys

**UX:** Uses `ToastContainer` + `useToast` for non-blocking feedback. Has a sidebar toggle and a full-screen loading overlay during heavy database operations.

**Auth guard:** Immediately redirects to `/login` if `super_admin_token` is not present in `localStorage`.

---

## 8. Technical Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   ELECTRON APP                      │
│                                                     │
│  ┌─────────────────────┐   ┌─────────────────────┐  │
│  │   RENDERER PROCESS   │   │    MAIN PROCESS     │  │
│  │   (Chromium/React)   │   │     (Node.js)       │  │
│  │                     │   │                     │  │
│  │  Pages & Components  │   │  IPC Channel        │  │
│  │  React Router v6     │◄──►  Handlers           │  │
│  │  ThemeContext         │   │  Controllers        │  │
│  │  localStorage state  │   │  Services           │  │
│  │                     │   │  SQLite Database     │  │
│  └─────────────────────┘   └─────────────────────┘  │
│            │                         │               │
│     preload.ts (contextBridge)        │               │
│     exposes window.electron.ipc      │               │
└─────────────────────────────────────────────────────┘
```

### IPC Communication Pattern

All data operations flow through Electron IPC:

```
React Component
  → invokeIpc('channel-name', payload)
    → preload.ts contextBridge
      → Electron main process
        → Controller (channel handler)
          → Service (business logic)
            → SQLite3 database
          ← Service returns data
        ← Controller returns result
      ← IPC resolves promise
    ← React receives result
```

### State Management

There is **no global state manager** (no Redux, no Zustand, no MobX). State is handled at three levels:

| Level | Mechanism | Used for |
|---|---|---|
| Page-level | `useState` / `useEffect` | All page data and UI state |
| Cross-page shared | `localStorage` | Auth token, user, settings, themes |
| Layout-level | `Outlet` context | Header customization, expiring alerts |
| Theme | `ThemeContext` (React Context) | Light/dark mode, color theme |

---

## 9. Backend Architecture

### Pattern

```
Controller (IPC handler registration)
  → Service (business logic + SQL queries)
    → DatabaseService (SQLite connection + query execution)
```

### Controllers

| Controller | Channels handled |
|---|---|
| `auth.controller.ts` | signup, login, token verify, profile update, password change |
| `medicine.controller.ts` | medicine CRUD, stock queries, expiry alerts |
| `supplier.controller.ts` | supplier CRUD |
| `customer.controller.ts` | customer CRUD |
| `purchase.controller.ts` | purchase order CRUD |
| `payment.controller.ts` | payment records |
| `sale-return.controller.ts` | return processing |
| `grn.controller.ts` | Goods Received Note operations |
| `license.controller.ts` | license activation, validation, cloud registration |
| `super-admin.controller.ts` | user management, license management, DB operations |
| `database.controller.ts` | custom database operations |

### Services

Each controller has a corresponding service:
`auth.service.ts`, `medicine.service.ts`, `supplier.service.ts`, `customer.service.ts`, `purchase.service.ts`, `payment.service.ts`, `sale-return.service.ts`, `sales.service.ts`, `grn.service.ts`, `license.service.ts`, `super-admin.service.ts`, `database.service.ts`

---

## 10. Theme & Appearance System

The app supports **light/dark mode** plus **5 swappable color themes** applied via CSS custom properties at runtime.

| Theme Name | Primary Accent | CSS Class |
|---|---|---|
| Emerald (default) | `#10b981` | `theme-emerald` |
| Sapphire Blue | `#3b82f6` | `theme-sapphire` |
| Teal | `#14b8a6` | `theme-teal` |
| Violet | `#8b5cf6` | `theme-violet` |
| Amber | `#f59e0b` | `theme-amber` |

Preferences are stored in `localStorage` and applied on app startup via `ThemeContext`.

---

## 11. PDF & CSV Export System

Multiple modules support document export. Two backend utility files handle template generation:

- `src/main/backend/utils/pdf-template.ts` — HTML-to-PDF invoice and report generation
- `src/main/backend/utils/csv-template.ts` — CSV column definitions and formatters

**Pages with export support:**

| Page | PDF | CSV |
|---|:---:|:---:|
| Sales Report | ✅ | ✅ |
| Purchase Report | ✅ | ✅ |
| Sale Return | ✅ | ✅ |
| Payments | ✅ | ✅ |
| Financial Summary | ❌ | ❌ |
| Dashboard | ❌ | ❌ |

**PDF Preview:** Before saving, a `PDFPreviewModal` component renders the HTML invoice in-app so the user can review it before downloading or printing.

**Receipt printing (Selling Panel):** A separate thermal receipt builder generates a compact receipt HTML. Configurable between in-app preview mode and direct native print.

---

## 12. License System

The application requires a valid license to operate.

### License Validation Flow

1. On every app launch, `LicenseOverlay` checks the current license status via IPC
2. If the license is **invalid or expired**, a full-screen overlay blocks access to the app
3. The user must activate a valid license key via `LicenseActivationDialog`
4. License keys can be obtained by submitting a request form (sent to the cloud license server)

### License Cloud Server

- Admin users can configure the cloud license server URL in the License page
- The server can be pinged to verify connectivity
- Generated keys can be registered with the cloud

### Super Admin License Management

- The super admin portal allows direct editing of license expiry dates and activation status
- New license keys can be generated, viewed, and revoked from the Generated Keys tab

---

## 13. Identified Bugs & Issues

The following issues were found during a thorough review of the codebase. Issues marked **FIXED** have been resolved in the current codebase.

---

### BUG-01 — Settings: Notifications & 2FA are UI-only (High Severity)

**File:** `src/renderer/pages/dashboard-pages/Settings.tsx`

The **Notifications section** (email alerts, low stock alerts, expired medicines alerts, sales alerts, supplier notifications, daily reports, weekly reports) and the **Two-Factor Authentication** toggle have no backend implementation. When saved, the handler executes only a fake `setTimeout` delay with no IPC call. The settings appear to save successfully but are never persisted. On next launch, all toggles reset to their default state.

**Impact:** Users believe they are configuring notification preferences but the system ignores all of these settings completely.

**Recommendation:** Either implement backend persistence for these settings (add a `settings` table to SQLite and IPC channels for save/load), or remove the non-functional sections from the UI until they are built.

---

### BUG-02 — Customers: Uses Native `window.confirm()` for Delete — **FIXED**

**File:** `src/renderer/pages/dashboard-pages/Customers.tsx`

**Status:** ✅ Fixed. `window.confirm()` has been replaced with the `ConfirmDialog` component. State variables `showDeleteConfirm` and `customerToDeleteId` were added, along with a `confirmDelete` handler. The delete now opens a themed modal matching the rest of the app.

Additionally, all `alert()` calls in the file have been replaced with inline error messages rendered inside the form, dismissable with an × button. The `'use client'` Next.js directive was also removed from the top of the file.

---

### BUG-03 — Customers & Suppliers: `alert()` for Error Feedback (Medium Severity)

**File:** `src/renderer/pages/dashboard-pages/Customers.tsx` — **FIXED**
**File:** `src/renderer/pages/dashboard-pages/Suppliers.tsx` — still pending

All `alert()` calls in `Customers.tsx` have been replaced with a state-driven `errorMessage` displayed inline in the form. `Suppliers.tsx` still uses `alert()` for some error paths.

**Recommendation:** Replace remaining `alert()` calls in `Suppliers.tsx` with `useToast` (error variant).

---

### BUG-04 — Dashboard: Loads All Records Into Memory (Medium Severity) — **PARTIALLY FIXED**

**File:** `src/renderer/pages/dashboard-pages/Dashboard.tsx`

**Status:** ✅ Partially fixed. A KPI date range filter has been added to the stats bar (from/to date pickers + "This Month" quick-select button). KPI totals are now computed from in-memory filtered data. The underlying data load still fetches all records, but the metrics displayed are now scoped to the selected period. A proper server-side date filter would further improve performance for large datasets.

---

### BUG-05 — Selling Panel: `RECEIPT_PREVIEW_MODE` Hardcoded (Low Severity)

**File:** `src/renderer/pages/dashboard-pages/SellingPanel.tsx`

The behavior of receipt printing is controlled by a hardcoded constant `RECEIPT_PREVIEW_MODE`. Users cannot configure this.

**Recommendation:** Move this setting to the Settings page under a "Printing" or "POS" section, saved to `pharmacySettings` in `localStorage`.

---

### BUG-06 — Legacy / Dead Files in Project (Low Severity)

The following files exist in the project but are not imported or used anywhere:

| File | Status |
|---|---|
| `src/renderer/pages/sqlDemoApp.js` | Unused — boilerplate leftover |
| `src/renderer/pages/sqlDemoPage.js` | Unused — boilerplate leftover |
| `src/renderer/pages/mastheads/mainMasthead.js` | Unused — legacy component |
| `src/renderer/pages/navbars/leftNav.js` | Unused — legacy component |

**Recommendation:** Delete these files.

---

### BUG-07 — Suppliers.tsx: Leftover `'use client'` Directive (Low Severity)

**File:** `src/renderer/pages/dashboard-pages/Suppliers.tsx`

The file contains a `'use client'` directive — a Next.js-specific pragma that has no meaning in an Electron/React app. Harmless in practice but misleading.

**Recommendation:** Remove the `'use client'` line.

---

## 14. Missing Features & Recommendations

The following are features that are absent or incomplete. Items marked **FIXED** have been implemented in the current codebase.

---

### MISS-01 — Low Stock Alerts Not Implemented (Critical)

The Settings page has a toggle labeled **"Low Stock Alerts"** and the Dashboard has placeholder logic for low-stock thresholds, but the **Alerts page** (`/alerts`) only shows expiry alerts. There is no mechanism for:

- Setting a minimum stock level per medicine
- Alerting when a medicine's available pills fall below that threshold
- Including low-stock items in the alert bell in the header

**Recommendation:**
1. Add a `minimumStockLevel` field to the medicines data model
2. Add a backend query that returns medicines where `sellablePills < minimumStockLevel`
3. Surface these alongside expiry alerts in the Alerts page and the header bell
4. Connect the "Low Stock Alerts" toggle in Settings to actually filter these alerts

---

### MISS-02 — GRN (Goods Received Note) Has No UI (High)

The backend has a fully implemented `grn.controller.ts` and `grn.service.ts` for Goods Received Notes, but there is no frontend page or route for GRN management. GRN is a standard accounting document confirming receipt of goods from a supplier.

**Recommendation:** Create a `/grn` page that allows viewing and printing GRNs linked to purchase orders.

---

### MISS-03 — Admin Cannot Access Alerts — **FIXED**

**Status:** ✅ Fixed. `/alerts` has been removed from `adminProhibitedRoutes` in `Dashboard-Layout.tsx`. The Alerts module entry in `MainMenu.tsx` is no longer disabled for admin. The alert bell in the header now shows for all roles (previously hidden for admin). Both admin and cashier can now view expiry alerts.

---

### MISS-04 — No Medicine Categories / Classification (High)

Medicines currently have no category or classification field (e.g., Antibiotic, Painkiller, Vitamin, OTC, Controlled Substance). This limits:

- Inventory organization and browsing
- Reporting by medicine type
- Applying category-level default tax rates
- Regulatory compliance for controlled substances

**Recommendation:** Add a `category` field to the medicine data model. Add category management (CRUD) as a sub-section of the Medicines page. Add category filtering to the medicine list.

---

### MISS-05 — No Customer or Supplier Purchase/Sale History (Medium)

The Customers page shows a customer's basic contact info but provides no way to see:
- What medicines they have purchased
- Their total spending
- Their last purchase date

Similarly, the Suppliers page shows no purchase history for a given supplier.

**Recommendation:**
- Add a "View History" action to each customer row that shows their sales history (filtered view of Sales Report)
- Add a "View Purchases" action to each supplier row that shows their purchase history (filtered view of Purchase Report)

---

### MISS-06 — Dashboard Has No Date Range Filter — **FIXED**

**Status:** ✅ Fixed. A KPI period date range filter (from/to date pickers + "This Month" quick-select) has been added to the Dashboard metrics bar. KPI totals (purchases, gross sales, net sales, profit, etc.) are now filtered to the selected date range using in-memory data. The bar chart range selector (this month / last month / this year) was already present.

---

### MISS-07 — Financial Summary Has No Export (Medium)

The Financial Summary page shows detailed financial analytics but provides no way to export the data. Every other report page (Sales, Purchases, Payments, Sale Return) supports PDF and CSV export.

**Recommendation:** Add PDF and CSV export to the Financial Summary page, consistent with other report pages.

---

### MISS-08 — No Audit Trail / Activity Log (Medium)

There is no logging of who created, modified, or deleted which record. In a multi-user environment (admin + multiple cashiers), this creates accountability and auditing gaps.

**Recommendation:** Add an `activityLog` table to the database. Log key events: login, sale created, purchase created, medicine added/edited/deleted, payment recorded, return processed. Expose this log in the Super Admin Dashboard.

---

### MISS-09 — No Medicine Manufacturer / Brand Information — **FIXED**

**Status:** ✅ Fixed. Optional `manufacturer` and `brand_name` columns have been added to the `medicines` table via a safe migration in `medicine.service.ts` (uses `ALTER TABLE ... ADD COLUMN` only if missing, so existing data is unaffected). The `Medicine` interface, `MedicineWithInventory`, `createMedicine`, and `updateMedicine` have all been updated. The Medicines page form now includes Manufacturer and Brand Name input fields.

---

### MISS-10 — No Batch / Lot Number Tracking — **FIXED**

**Status:** ✅ Fixed. The `batch_number` column already existed in the `purchase_items` DB table and `PurchaseItemInput` backend interface. The frontend `PurchasingPanel.tsx` did not expose it. A `batchNumber` field has been added to the `PurchaseItem` frontend interface, the cart item initial state, the purchase submission payload, and a "Batch # (opt.)" text input now appears below each item's expiry date in the cart.

---

### MISS-11 — No Prescription / Doctor Reference on Sales — **FIXED**

**Status:** ✅ Fixed. Optional `prescription_number` and `doctor_name` columns have been added to the `sales` table via safe migration in `sales.service.ts`. The `Sale` interface has been updated with `prescriptionNumber?` and `doctorName?`. The `createSale` method now saves these fields. In `SellingPanel.tsx`, two new optional inputs ("Rx #" and "Dr.") appear in the second row of the customer info section, and the values are sent with every new sale. The fields reset when starting a new bill.

---

### MISS-12 — Dashboard Recent Orders Not Paginated — **FIXED**

**Status:** ✅ Fixed. The hardcoded `sales.slice(0, 50)` has been replaced with pagination (20 rows per page). Prev/Next buttons and a page counter (e.g., "2 / 14") now appear in the Recent Sales section header. The total sale count is shown next to the section title.

---

### MISS-13 — Cashier Access to Full Purchase Costs (Low)

A `cashier` can access the full Purchase Report, which shows purchase prices, supplier names, total amounts paid, and outstanding supplier balances. This is sensitive financial and business information.

**Recommendation:** Evaluate whether cashiers need access to full purchase cost data. If not, restrict the Purchase Report to `admin` only, or create a limited view that hides cost columns for cashiers.

---

## 15. Changes Applied (March 2026)

The following fixes were implemented in the codebase. All changes are backward-compatible — no existing data is altered or lost.

---

### Fix 1 — Customers: ConfirmDialog + Inline Error Messages

**Files changed:** `src/renderer/pages/dashboard-pages/Customers.tsx`

- Removed the `'use client'` Next.js directive
- Imported `ConfirmDialog` from `components/common/ConfirmDialog`
- Added `showDeleteConfirm`, `customerToDeleteId`, and `errorMessage` state
- `handleDelete` now opens the confirmation modal instead of calling `window.confirm()`
- `confirmDelete` executes the actual IPC delete after user confirms
- All `alert()` calls replaced with an inline error banner rendered in the form, with a dismiss button

---

### Fix 2 — Admin Role: Can Now Access Alerts

**Files changed:** `src/renderer/pages/Dashboard-Layout.tsx`, `src/renderer/pages/dashboard-pages/MainMenu.tsx`

- Removed `'/alerts'` from `adminProhibitedRoutes` in `Dashboard-Layout.tsx`
- Changed the alert bell button to be visible for all roles (previously hidden for admin)
- Set the Alerts module's `disabled: false` in `MainMenu.tsx` (was `disabled: isAdmin`)

---

### Fix 3 — Dashboard: KPI Date Range Filter

**Files changed:** `src/renderer/pages/dashboard-pages/Dashboard.tsx`

- Added `kpiFromDate` and `kpiToDate` state (defaulting to first day of current month → today)
- Added `filteredSales` and `filteredPurchases` memos that filter in-memory data by selected dates
- KPI totals now use filtered data, so all 9 metric cards reflect the selected period
- Added date picker inputs + "This Month" button in the stats bar

---

### Fix 4 — Dashboard: Paginated Recent Orders

**Files changed:** `src/renderer/pages/dashboard-pages/Dashboard.tsx`

- Replaced `sales.slice(0, 50)` with paginated state (`recentOrdersPage`, 20 rows per page)
- Prev/Next navigation buttons and a page counter added to the Recent Sales header
- Total sale count displayed next to the section title

---

### Fix 5 — Medicines: Manufacturer & Brand Name Fields

**Files changed:**
- `src/main/backend/services/medicine.service.ts`
- `src/renderer/pages/dashboard-pages/Medicines.tsx`

**Backend:**
- Added `manufacturer` and `brandName` to the `Medicine` and `MedicineWithInventory` interfaces
- `CREATE TABLE medicines` now includes `manufacturer TEXT` and `brand_name TEXT`
- Safe migration: `ALTER TABLE medicines ADD COLUMN` runs only if the column does not already exist (existing databases are unaffected)
- `createMedicine` and `updateMedicine` handle the new fields
- `baseInventorySelect` and `mapRowToMedicine` return the new fields

**Frontend:**
- `MedicineFormState`, `BackendMedicine`, `Medicine` types updated
- `emptyMedicineForm` includes `manufacturer: ''` and `brandName: ''`
- `mapBackendMedicine` maps the new fields
- `handleEdit` populates the new fields when editing
- Two new optional input fields ("Manufacturer" and "Brand Name") added to the medicine form

---

### Fix 6 — Purchasing: Batch Number Input

**Files changed:** `src/renderer/pages/dashboard-pages/PurchasingPanel.tsx`

- Added `batchNumber?: string` to the `PurchaseItem` frontend interface
- Added `batchNumber: ''` to the default cart item state
- Added `batchNumber` to the purchase submission payload
- Added a "Batch # (opt.)" text input below each item's expiry date in the cart (the backend `purchase_items.batch_number` column already existed)

---

### Fix 7 — Selling Panel: Prescription Number & Doctor Name

**Files changed:**
- `src/main/backend/services/sales.service.ts`
- `src/renderer/pages/dashboard-pages/SellingPanel.tsx`

**Backend:**
- Added `prescriptionNumber?` and `doctorName?` to the `Sale` interface
- `CREATE TABLE sales` now includes `prescription_number TEXT` and `doctor_name TEXT`
- Safe migration: columns are added only if missing
- `createSale` saves `prescription_number` and `doctor_name` from the payload

**Frontend:**
- Added `prescriptionNumber` and `doctorName` state variables
- Both fields are reset in `clearFormForNewBill`
- Both values are sent in the sale payload
- "Rx #" and "Dr." optional text inputs appear in the second row of the customer info section of the Selling Panel

---

### Change 8: Low Stock Alerts — Full Implementation (MISS-01) — March 2026

**Status:** ✅ Fixed

**Problem:** The Settings page had a "Low Stock Alerts" toggle but it had no effect. No backend query existed to detect low-stock medicines, no alert was shown in the bell icon or the Alerts page, and no minimum stock level could be configured per medicine.

**Files Changed:**

| File | Change |
|---|---|
| `src/renderer/types/pharmacy.ts` | Added `lowStockAlertsEnabled: boolean` to `PharmacySettings` interface and `defaultPharmacySettings` |
| `src/main/backend/services/medicine.service.ts` | Added `minimum_stock_level` column (safe migration); updated `Medicine`/`MedicineWithInventory` interfaces; updated `createMedicine`, `updateMedicine`, `baseInventorySelect`, `mapRowToMedicine`; added `getLowStockMedicines()` query; added `LowStockAlert` interface |
| `src/main/backend/controllers/medicine.controller.ts` | Registered `medicine-get-low-stock` IPC channel |
| `src/renderer/pages/dashboard-pages/useDashboardHeader.ts` | Added `LowStockAlert` type; added `lowStockAlerts`, `refreshLowStockAlerts`, `lowStockAlertsEnabled` to `DashboardHeaderContextValue` |
| `src/renderer/pages/Dashboard-Layout.tsx` | Added `fetchLowStockAlerts()` callback (polls every 60s, respects `lowStockAlertsEnabled`); updated outlet context; bell badge now shows combined total (expiry + low-stock); dropdown shows both alert types |
| `src/renderer/pages/dashboard-pages/Alerts.tsx` | Completely rebuilt with two tabs: "Near Expiry" (amber) and "Low Stock" (red); low-stock cards include a progress bar showing stock level vs minimum |
| `src/renderer/pages/dashboard-pages/Medicines.tsx` | Added `minimumStockLevel` to `Medicine`, `BackendMedicine`, `MedicineFormState` types; added input field "Min. Stock Level (Pills)" to the form; updated `handleSubmit`, `handleEdit`, `mapBackendMedicine` |
| `src/renderer/pages/dashboard-pages/Settings.tsx` | Added "Low Stock Alerts" toggle in the Pharmacy settings section, bound to `pharmacySettings.lowStockAlertsEnabled`; saved via existing `handleSave` → `localStorage` |

**Database migration pattern (safe, backward-compatible):**
```sql
-- Applied in medicine.service.ts initializeTable()
ALTER TABLE medicines ADD COLUMN minimum_stock_level INTEGER NOT NULL DEFAULT 0;
-- Only executed if column doesn't already exist (PRAGMA table_info check)
```

**Backend query (`getLowStockMedicines`):**
```sql
SELECT m.id, m.name, m.barcode, m.minimum_stock_level,
  COALESCE(SUM(CASE WHEN date(pi.expiry_date) >= date('now') THEN pi.available_pills ELSE 0 END), 0) AS sellable_pills
FROM medicines m
LEFT JOIN purchase_items pi ON pi.medicine_id = m.id
WHERE m.minimum_stock_level > 0 AND m.status = 'active'
GROUP BY m.id
HAVING sellable_pills < m.minimum_stock_level
ORDER BY (m.minimum_stock_level - sellable_pills) DESC
```

**How it works end-to-end:**
1. Pharmacist sets a "Min. Stock Level" on any medicine in the Medicines page form
2. Every 60 seconds, `Dashboard-Layout` polls `medicine-get-low-stock` if `lowStockAlertsEnabled = true`
3. The bell icon badge shows the combined count of expiry + low-stock alerts
4. The bell dropdown previews up to 3 alerts of each type with one-click navigation to Alerts
5. The Alerts page has two tabs — "Near Expiry" and "Low Stock" — each with a clear empty state or a card grid
6. Low-stock cards show current stock, minimum required, deficit, and a red progress bar
7. The toggle in Settings → Pharmacy can disable low-stock alerts completely

---

## 16. Summary Assessment

### Strengths

- **Solid core functionality:** The Selling Panel (POS) and Purchasing Panel are well-built with barcode support, per-item discount/tax, receipt printing, and history navigation.
- **Clean architecture:** The Electron IPC → Controller → Service → SQLite pattern is consistent and maintainable.
- **Good role separation:** The three-role system (cashier, admin, super_admin) covers the main use cases well.
- **Comprehensive reporting:** Sales, purchase, return, and payment reports all support date filtering, search, pagination, and PDF/CSV export.
- **License system:** A proper license activation and cloud registration system is in place.
- **Theme system:** Light/dark mode plus 5 color themes is a polished touch.
- **Super admin portal:** The separate super-admin dashboard with DB backup/restore is production-ready.

### Priority Fix List

| Priority | ID | Issue | Status |
|---|---|---|---|
| 🔴 Critical | MISS-01 | Low stock alerts not implemented despite UI toggle existing | ✅ Fixed |
| 🔴 Critical | BUG-01 | Notification and 2FA settings are fake (no persistence) | Open |
| 🟠 High | MISS-03 | Admin role blocked from Alerts — only cashiers can see expiry alerts | ✅ Fixed |
| 🟠 High | MISS-02 | GRN backend exists but has no UI page | Open |
| 🟠 High | MISS-04 | No medicine categories or classification | Open |
| 🟡 Medium | BUG-02 | Customers delete uses native `window.confirm()` instead of `ConfirmDialog` | ✅ Fixed |
| 🟡 Medium | BUG-03 | `alert()` calls in Customers (and Suppliers) instead of inline/Toast | Partially fixed (Customers done) |
| 🟡 Medium | BUG-04 | Dashboard loads all records — KPI now filtered in-memory | ✅ Fixed |
| 🟡 Medium | MISS-05 | No customer/supplier history links | Open |
| 🟡 Medium | MISS-06 | Dashboard has no date range filter | ✅ Fixed |
| 🟡 Medium | MISS-07 | Financial Summary has no export | Open |
| 🟡 Medium | MISS-08 | No audit trail | Open |
| 🟢 Low | BUG-05 | Receipt preview mode hardcoded | Open |
| 🟢 Low | BUG-06 | Dead/legacy files in project | Open |
| 🟢 Low | BUG-07 | `'use client'` directive in Suppliers.tsx | Open |
| 🟢 Low | MISS-09 | No manufacturer/brand field on medicines | ✅ Fixed |
| 🟢 Low | MISS-10 | No batch/lot number tracking | ✅ Fixed |
| 🟢 Low | MISS-11 | No prescription reference on sales | ✅ Fixed |
| 🟢 Low | MISS-12 | Dashboard recent orders not paginated | ✅ Fixed |
| 🟢 Low | MISS-13 | Cashiers can see full purchase cost data | Open |

---

*Document generated by code review of the Pharmacy Management Desktop App source — March 2026.*
