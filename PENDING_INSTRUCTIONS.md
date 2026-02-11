# Pending Instructions - Professionals Area

This document lists what was missing and the current status.

## 1) Location Search (City/ZIP/Address) - DONE
- Added geocoding search input using Nominatim (OpenStreetMap, free).
- Debounced input (400ms) with autocomplete suggestions dropdown.
- On selection, map recenters and distances recalculate.
- Handles no-results gracefully. CSP updated for Nominatim API.

## 2) Nearest Clinics Based on User Location - DONE
- Added "My Location" button using browser geolocation API.
- If permission granted: map centers on user, distances update.
- If permission denied: silently falls back to current map center.
- Permissions-Policy updated to allow `geolocation=(self)`.

## 3) Internal Team Email Notification - DONE
- On referral creation, `internalNotificationEmail()` sends to `INTERNAL_EMAIL` env var.
- Includes: lawyer name, law firm, clinic name, patient name, case type, date/time (ET).
- Console fallback when SMTP not configured.

## 4) Referral Metadata: Law Firm - DONE
- `firmName` on user profile, `lawyerFirm` on referral records.
- Displayed in clinic referral table: lawyer name + firm name.
- Included in all email notifications.

## 5) Clinic Availability - DONE
- `available: boolean` on each clinic.
- Green/gray visual indicators on map markers and sidebar.
- "Available only" filter toggle.
- Unavailable clinics cannot receive referrals (button disabled with message).

## 6) Real Data Imports - PARTIALLY DONE
- **Clinics: DONE** - 307 real Florida clinics parsed from "Listado Mapa Clinicas FL.md", geocoded via Nominatim, stored in `data/clinics.json`.
- **Users: PENDING** - Still using 4 demo accounts. Need real lawyer/clinic credentials from client.

## 7) Email Provider (SMTP) - PENDING (needs client)
- Code is ready with Nodemailer + console fallback.
- Environment variables defined in `.env.local` (commented out).
- Client needs to provide SMTP credentials or choose a free provider (Resend recommended).
- See `CLIENT_PENDING.md` for details to share with client.
