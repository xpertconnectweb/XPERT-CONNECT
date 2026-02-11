# Items Pending from Client - Xpert Connect

## 1) SMTP / Email Configuration
The system currently logs emails to the server console. To enable real email delivery, we need SMTP credentials.

**Free options (recommended):**
- **Resend** (resend.com) - Free tier: 3,000 emails/month, simple API. Recommended.
- **Brevo (ex-Sendinblue)** - Free tier: 300 emails/day.
- **Mailgun** - Free trial: 5,000 emails for 3 months.

**What we need from the client:**
- SMTP host, port, user, and password (or API key if using Resend/Brevo)
- "From" email address (e.g., `noreply@xpertconnect.com`)
- Internal team email address for referral notifications (e.g., `team@xpertconnect.com`)

**Environment variables to set:**
```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxx
SMTP_FROM=noreply@xpertconnect.com
INTERNAL_EMAIL=team@xpertconnect.com
```

---

## 2) Real User Accounts
Currently using 4 demo accounts. The client needs to define the real users:

- **For each lawyer:** Full name, username, password, email, law firm name
- **For each clinic:** Clinic name (as username label), username, password, email, linked clinic ID

**Note:** Passwords will be securely hashed (bcrypt). We recommend passwords of at least 12 characters.

**Current demo credentials (for testing only):**
- Lawyer: `martinez_law` / `XpertDemo2025!`
- Lawyer: `johnson_legal` / `XpertDemo2025!`
- Clinic: `miami_spine` / `XpertDemo2025!`
- Clinic: `coral_medical` / `XpertDemo2025!`

---

## 3) Branding Assets (optional)
- Company logo in SVG or high-resolution PNG (if different from current)
- Brand colors confirmation (currently using navy/gold/turquoise)
- Any specific email template branding requirements

---

## Summary Table

| Item | Priority | Status |
|------|----------|--------|
| SMTP / Email credentials | High | Pending from client |
| Internal team email address | High | Pending from client |
| Real user accounts (lawyers + clinics) | High | Pending from client |
| Branding assets | Low | Optional |

---

## Already Completed (no client action needed)

| Feature | Status |
|---------|--------|
| Real clinic data (307 clinics across all Florida) | Done |
| GPS coordinates geocoded for all clinics | Done |
| Location search (city/ZIP/address) with Nominatim | Done |
| Browser geolocation (nearest clinics to user) | Done |
| Clinic availability flags | Done |
| Internal team email notification logic | Done (needs SMTP to activate) |
| Law firm attribution in referrals | Done |
| Referral status management (received/in process/attended) | Done |
| Interactive map with distance calculation | Done |
| Role-based dashboard (lawyer vs clinic views) | Done |
