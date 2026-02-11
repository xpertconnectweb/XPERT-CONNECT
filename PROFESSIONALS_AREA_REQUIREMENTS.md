# Professionals Area - Requirements (English)

## Goal
Build a secure Professionals Area with role-based access for **lawyers** and **clinics**, enabling referral management, map-based clinic discovery, and automated notifications.

## 1) Secure Access
- The website will include a Professionals Area with **username/password login**.
- Accounts are **created and assigned by the internal team**.
- Each user has a role: **clinic** or **lawyer**.

## 2) Professionals Dashboard
- After login, users land on a **main panel**.
- The **first view** is an **interactive map**.

## 3) Lawyer Features
- Lawyers can **search clinics by location** on the map (e.g., clinics in Miami).
- The system shows **nearest available clinics** to the client.
- From the map, the lawyer can **select a clinic and send a referral**.
- Each referral includes the **patient information** to be referred.

## 4) Clinic Features
- Clinics can log in and **view received referrals**.
- They can see **who sent each referral** (lawyer or law firm).
- They can view the **status of each referral** (e.g., received, in process, attended, etc.).

## 5) Notifications & Control
- Every time a lawyer sends a referral, the **clinic automatically receives the information**.
- Additionally, the internal team receives an **email confirmation**.
- The email must indicate **who sent the referral**.
- The email must indicate **which clinic received it**.
- The email must indicate **date/time of the referral**.

## Outcome
This system provides a **clear, organized, and transparent** flow of referrals between lawyers and clinics.

## Completed Items (formerly Pending)
- **Map search by location**: Search bar filters clinics by name, address, or specialty. Sidebar list shows results sorted by proximity.
- **Nearest clinics**: Haversine distance calculation from map center. Clinics sorted by distance (nearest first). Distance shown in popup and sidebar.
- **Clinic availability**: `available` boolean flag on each clinic. Visual indicators (green/gray) on markers and sidebar. "Available only" filter toggle. Unavailable clinics cannot receive referrals.
- **Internal team email**: `internalNotificationEmail()` sent on every referral creation to INTERNAL_EMAIL env var (with console fallback).
- **Email details**: Internal email includes sender (lawyer name + firm), clinic name, patient name, case type, and date/time (ET timezone).
- **Law firm attribution**: `firmName` stored on user, `lawyerFirm` stored on referral. Shown in clinic referral table and included in all email notifications.
