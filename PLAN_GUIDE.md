# Truvora plan guide — Free, Starter, and Pro

This guide explains what each plan includes and how to use every feature in
the app. The limits below are the seeded plan definitions in
`scripts/plans.ts`. They apply once those plans have been seeded and your
account has an active subscription row.

> **Currency:** all amounts are in Indian Rupees (INR). New expenses, income,
> and subscriptions must be entered in INR.

---

## 1. Plans at a glance

| | **Free** | **Starter** | **Pro** (seeded name: "Stroka Pro") |
|---|---|---|---|
| Price | ₹0 / month | ₹129 / month | ₹299 / month |
| Active subscriptions (all ledgers) | 10 | 50 | Unlimited |
| Exports per month (CSV + PDF share one quota) | 10 | 100 | 1,000 |
| CSV export | ✅ | ✅ | ✅ |
| PDF export | ❌ | ✅ Basic | ✅ Advanced |
| Spending-over-time chart | ❌ | ✅ | ✅ |
| Custom categories | ❌ | ✅ | ✅ |
| Email renewal reminders | ✅ 1, 3, and 7 days ahead | ✅ 1, 3, and 7 days ahead | ✅ 1, 3, and 7 days ahead |
| Tax summary tagged-row cap | 50 rows | 500 rows | Unlimited |
| Personal + business ledgers | ✅ | ✅ | ✅ |
| XLSX export, saved views, outgoing webhooks | ❌ | ❌ | ❌ (coming soon / not built) |

**Good to know**

- New accounts are automatically put on the cheapest active plan (normally
  **Free**) when the Clerk webhook creates the user.
- Paid checkout uses Razorpay and is enabled only when the deployment has
  `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` configured. Without those keys the
  **Upgrade** buttons stay disabled and paid plans are assigned by seeding the
  plans and updating the user's subscription (admin/ops task).
- A checkout buys **one billing period**. There is no automatic renewal,
  cancellation, refund, or proration flow yet, so a paid plan expires at the end
  of its period and the account falls back to the cheapest free plan.
- If the `plans` table is empty, a user is created without a subscription row.
  Every plan-gated feature then denies access until a plan is assigned.

### Check which plan you are on

1. Open the account menu at the bottom of the sidebar (your avatar).
2. Select **Billing**.
3. The page shows your current plan, price, status, renewal date, and every
   available plan.

---

## 2. Setup that applies to every plan

### Create an account

1. Open the app and select **Sign in** or **Sign up**.
2. Sign up with email and password (minimum 8 characters), Google, or GitHub.
3. Verify your email if your Clerk instance requires it.

### First-run onboarding

1. Choose whether you will track **personal**, **business**, or **both**.
2. If you choose business or both, enter a business name (1–40 characters).
3. Optionally add a first expense or subscription from the setup screen.
4. You can skip setup and go straight to the dashboard.

### Switch between personal and business records

Use the ledger selector at the top of the app.

- Each ledger keeps its own expenses, income, subscriptions, transactions,
  charts, and tax summary.
- If you chose personal only, open the ledger selector and select
  **Add business** to create a business ledger later.
- One active personal ledger and at most one active business ledger per user.
- Check the selected ledger before adding or reviewing records.

---

## 3. Free plan — how to use everything included

The Free plan is for everyday personal tracking and a small set of recurring
subscriptions.

### 3.1 Dashboard

Open **Dashboard** in the sidebar.

- **Total spending this month** covers expenses and subscriptions in the
  selected ledger.
- **Section cards** show monthly spend, income, active subscriptions, and
  upcoming renewals.
- **Recent transactions** lists the latest activity.
- **Spending by category** is a pie chart of recent expenses. It is available
  on every plan.
- **Expenses & Subscriptions over time** is **not included** on Free. You will
  see: “Charts aren't included in your plan.”
- On a business ledger, the **Tax summary** card appears (see 3.7).

### 3.2 Expenses and income

1. Open **Expenses**.
2. Select **Create**.
3. Choose the **Expenses** or **Income** tab.
4. Enter a title, amount, date, and category. A note is optional.
5. Select **Add expense** or **Add income**.

Rules:

- Amount must be greater than zero, with at most 2 decimal places.
- Maximum amount is ₹99,999,999.99.
- Currency is INR.

To change or remove a record, use **Edit** or **Delete** on its card. Deleting
cannot be undone and also removes the matching ledger entry.

### 3.3 Subscriptions

1. Open **Subscriptions** and select **Create**.
2. Enter the name, price, start date, billing cycle (monthly or yearly), and
   category.
3. Optionally add a note and an end date. Leave the end date empty if the
   subscription has no planned end.
4. Save.

- Free allows up to **10 active subscriptions across all your ledgers**.
- The **Create** button disables when the active limit is reached. The tooltip
  reads: “Your active subscription limit has been reached.”
- Inactive subscriptions are excluded from active totals.
- **Delete** removes the subscription and its related ledger entries. This
  cannot be undone.
- Renewals are recorded in your transaction history by the daily renewal job.
  Truvora does not charge the subscription or contact the provider.

### 3.4 Transactions, search, and filters

1. Open **Transactions** to see income, expenses, and subscription events.
2. Select **Sort Date** to switch between newest-first and oldest-first.
3. Use the filter bar to search and filter by:
   - record type (expense, income, subscription)
   - category
   - currency
   - date range
   - amount range
4. Select **Clear filters** to reset everything.

- Lists show up to 100 records per page.
- Text search scans up to 5,000 filtered rows and tells you if the result was
  truncated.
- Search text is limited to 100 characters.
- Up to 20 categories can be selected at once.

### 3.5 Exports

On **Expenses**, **Subscriptions**, and **Transactions**, use **Export CSV**
where available.

- Free includes **10 exports per month**, shared across all export types.
- PDF buttons are not available on Free. Calling the PDF endpoint directly
  returns “PDF export is not included in your plan.”
- Exports respect the current search and filters on Expenses and Transactions.
  Subscription exports contain every subscription in the ledger.
- CSV and PDF files omit notes/descriptions.
- PDF is capped at 2,000 rows and notes when results are truncated.
- Download files to a secure location; once downloaded they are outside the
  app's access controls.

### 3.6 Custom categories

Not included on Free. Built-in categories still work, and you can assign them
normally in forms. The custom-category option is hidden/locked.

### 3.7 Tax summary (business ledgers only)

Free supports tax tagging, with a **50 tagged-row cap** per summary.

1. Switch to your business ledger.
2. When adding or editing an expense, income, or subscription, choose a tax
   treatment:
   - Expenses and subscriptions: **Tax-deductible** or **Tax paid**
   - Income: **Taxable income** or **Tax refund**
3. Open **Dashboard** and find the **Tax summary** card.
4. Choose the tax year (current year plus the previous three; April–March).

The card shows deductible, taxable income, tax paid, tax refunds, and net tax
paid, plus a month-by-month chart. If the year has more tagged rows than the
plan allows, a truncation note appears.

Tax tagging organizes your records. Truvora does not calculate tax liability
or provide tax advice.

### 3.8 Renewal reminders

All plans, including Free, receive email reminders for subscriptions renewing
in **1, 3, or 7 days**. Reminders go to the email on your account and include
the ledger name. Delivery depends on the deployment's email and cron
configuration.

### 3.9 Settings and account deletion

1. Open **Settings**.
2. Select **Delete my account** and confirm.
3. If cleanup is still running, return to Settings and select
   **Check deletion status**.

Deletion permanently removes your account, financial records, and usage data.
Limited billing totals may be retained where required. This cannot be undone.

### 3.10 Appearance

Use the theme control to choose **Light**, **Dark**, or **System**. This is a
display preference only and does not affect your data or plan.

---

## 4. Starter plan — what is added and how to use it

Starter includes everything in Free, plus more capacity, charts, custom
categories, and PDF exports.

### 4.1 What changes

| Feature | Free | Starter |
|---|---|---|
| Active subscriptions | 10 | **50** |
| Exports per month | 10 | **100** |
| PDF export | ❌ | **✅ Basic** |
| Spending-over-time chart | ❌ | **✅** |
| Custom categories | ❌ | **✅** |
| Tax summary rows | 50 | **500** |

### 4.2 Spending-over-time chart

1. Open **Dashboard**.
2. Find **Expenses & Subscriptions**.
3. Choose the series:
   - **All spending**
   - **Expenses**
   - **Subscriptions**
4. Choose the range: **Last 7 days**, **Last 30 days**, or **Last 3 months**.

The chart is plan-gated on the server (`/api/dashboard/charts`), so it works
only on Starter and Pro.

### 4.3 Create custom categories

You can create custom expense and subscription categories.

1. Open **Expenses** or **Subscriptions** and start a new record.
2. In the category field, select the option to add a custom category.
3. Enter a name (1–40 characters) and save.
4. The new category becomes available in that ledger for that category type.

Notes:

- Custom categories are per ledger.
- Built-in categories are always available.
- The API also enforces the plan rule, so a Free account cannot create them
  even by calling the endpoint directly.

### 4.4 Export CSV and basic PDF

1. Apply any search or filters you want on **Expenses** or **Transactions**.
2. Select **Export CSV** or **Export PDF**.
3. On **Subscriptions**, export covers the whole subscription list.

- Starter includes **100 exports per month**, shared between CSV and PDF.
- **Basic PDF** contains the table of records only.
- Business-ledger PDFs do not include the advanced summary or tax column on
  Starter; those are Pro features.
- A PDF export that is blocked by plan does not consume the quota.

### 4.5 Tax summary with a 500-row cap

The workflow is the same as Free (business ledger → tag records → Dashboard →
Tax summary). Starter raises the tagged-row cap to **500** per summary.

### 4.6 Subscriptions and reminders

- Up to **50 active subscriptions** across all your ledgers.
- Email reminders still arrive 1, 3, and 7 days before renewal.
- Renewals are still recorded in transaction history by the scheduled job.

---

## 5. Pro plan — what is added and how to use it

Pro (seeded as **"Stroka Pro"**) is the highest tier and removes the main
capacity limits.

### 5.1 What changes

| Feature | Starter | Pro |
|---|---|---|
| Active subscriptions | 50 | **Unlimited** |
| Exports per month | 100 | **1,000** |
| PDF export | Basic | **Advanced** |
| Tax summary rows | 500 | **Unlimited** |
| Custom categories | ✅ | ✅ |
| Spending-over-time chart | ✅ | ✅ |

### 5.2 Unlimited subscriptions

- There is no active-subscription cap. The Create button stays available.
- All other subscription behavior is the same: renewals are recorded, inactive
  subscriptions are excluded, and deletion removes related ledger entries.

### 5.3 Advanced PDF exports

1. Open **Expenses**, **Transactions**, or **Subscriptions**.
2. Apply filters if you want a narrower export.
3. Select **Export PDF**.

Advanced PDF adds:

- A summary section with totals and spending by category.
- On **business ledgers**, a tax column showing the tax treatment of each
  record.

Limits:

- **1,000 exports per month**, shared between CSV and PDF.
- PDF includes at most 2,000 rows and notes when truncated.
- Notes/descriptions are not included.
- XLSX is not implemented on any plan.

### 5.4 Tax summary without a row cap

The workflow is unchanged. Pro removes the tagged-row cap, so a full tax year
can be summarised in one request. The API still limits a single request to a
range of 400 days (one tax year).

### 5.5 Charts

Pro is seeded with the **"advanced"** chart tier and Starter with
**"comparative"**. Both enable the same spending-over-time chart screen in the
current app; the difference is stored in the plan definition for future
advanced chart work.

### 5.6 Everything else

Pro includes all Free and Starter behavior: dashboards, expenses and income,
subscriptions, transaction filters, CSV/basic export mechanics, email
reminders, custom categories, business tax tagging, ledgers, theme, and
account deletion.

---

## 6. Feature-by-feature: where to go and what each plan sees

### Views and navigation

| View | How to open | Free | Starter | Pro |
|---|---|---|---|---|
| Dashboard | Sidebar → **Dashboard** | ✅ (no time-series chart) | ✅ full | ✅ full |
| Expenses & income | Sidebar → **Expenses** | ✅ | ✅ | ✅ |
| Subscriptions | Sidebar → **Subscriptions** | ✅ up to 10 | ✅ up to 50 | ✅ unlimited |
| Transactions | Sidebar → **Transactions** | ✅ | ✅ | ✅ |
| Reports & Insights | Sidebar → **Reports & Insights** | Coming soon | Coming soon | Coming soon |
| Settings | Sidebar → **Settings** | ✅ | ✅ | ✅ |
| Billing | Account menu → **Billing** | ✅ | ✅ | ✅ |
| Profile | Account menu → **Account** | Coming soon | Coming soon | Coming soon |
| Pricing | Public `/pricing` | ✅ | ✅ | ✅ |

On mobile, the bottom bar exposes **Home**, **Expenses**, **Reports**,
**History**, and a **More** sheet with **Subscriptions** and **Settings**.

### Dashboard cards

| Card | Plans | Notes |
|---|---|---|
| Total spending this month | All | Expenses + subscriptions in the selected ledger |
| Summary cards | All | Income, spend, active subscriptions, upcoming renewals |
| Recent transactions | All | Latest records |
| Spending by category | All | Pie chart from recent expense records |
| Expenses & Subscriptions over time | Starter, Pro | 7/30/90-day range and series filter |
| Tax summary | All (business ledger) | Row cap: 50 / 500 / unlimited |

### Data-entry limits (all plans)

| Limit | Value |
|---|---|
| Amount | Greater than 0, max 8 digits before the decimal, 2 decimals |
| Currency | INR for new records |
| Custom category name | 1–40 characters |
| Business ledger name | 1–40 characters |
| Search text | 100 characters |
| Categories per filter | 20 |
| List page size | 100 rows maximum |

### Platform request limits (all plans)

| Operation | Limit |
|---|---|
| Authenticated API | 100 requests/minute and 5,000/day per user |
| Export endpoint | 5 requests/minute and 50/day per user, plus the general API limit |
| Account deletion, checkout, upgrade | 5 requests/hour |
| Public plans/prices | 60 requests/minute and 1,000/day per IP |

Rate limits use Upstash Redis. If Redis is not configured, requests are
allowed and a warning is logged.

---

## 7. Not available on any plan

These appear in plan descriptions or navigation but are not built yet:

- **Reports & Insights** page (analytics, renewal/price-increase insights,
  report workspace).
- **Profile** page (display details, sign-in methods, sessions, devices).
- **XLSX exports.**
- **Saved views.**
- **Outgoing webhooks.**
- **Custom notification channels** beyond email.
- **Customizable reminder lead times** — reminders are fixed at 1, 3, and 7
  days ahead.
- **Bank or card connections** and automatic transaction import.
- **Automatic renewals, cancellation, refunds, proration** — each checkout buys
  a single billing period; there is no subscription mandate or self-serve
  cancel/refund flow.
- **GST calculations** — Pro's description mentions an "18% GST expense
  breakdown", but no GST calculation exists in the current app. Tax tagging and
  the tax summary are the implemented tax features.

---

## 8. Troubleshooting

| Symptom | Reason | What to do |
|---|---|---|
| A button is greyed out with “Upgrade plan to use …” | The feature is not in your plan | Check **Billing**; Starter/Pro unlock it |
| “Charts aren't included in your plan” | Free has no time-series chart tier | Upgrade to Starter or Pro |
| “PDF export is not included in your plan” | Free has no PDF | Use CSV or upgrade |
| “Your active subscription limit has been reached.” | Hit the plan's active-subscription cap | Deactivate/delete a subscription or upgrade |
| Export fails with a plan message | Monthly export quota used up | Wait for the new month or upgrade |
| Tax summary says totals may be incomplete | More tagged rows than the plan cap | Narrow the tax year or upgrade |
| Every gated feature is denied | Account has no active subscription row | Assign a plan (see note below) |
| Billing shows “no plan” | Plans were not seeded when the user was created | Seed plans and assign a plan |

### Assigning a plan (admin/ops)

```bash
npm run insert-plans                                   # seed Free/Starter/Pro
npm run update-user-plan -- <clerk-user-id> <plan-id>  # move a user to a plan
```

`update-user-plan` updates the user's single active/trialing subscription. It
does not create one, so the user must already have a subscription row (new
users normally get the Free plan automatically).

---

## 9. Privacy reminder

- Selected text and JSON fields are encrypted at rest with AES-256-GCM.
- Encryption does not cover every account or financial field.
- Encrypted fields cannot be searched in SQL; text search decrypts a bounded
  number of rows in the application.
- Changing `ENCRYPTION_PASSPHRASE` or `ENCRYPTION_SALT` can make existing data
  unreadable. There is no key rotation.
- Exports include names/titles, amounts, dates, categories, and types, but not
  notes/descriptions.
