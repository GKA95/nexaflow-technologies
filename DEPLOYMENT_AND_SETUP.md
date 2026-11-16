# NexaFlow Technologies — Setup, Security, Hosting & Deployment Guide

This platform is a portable TypeScript full-stack application (Express API + React/Vite frontend + MongoDB Atlas + Paystack). It is designed to run inside Google AI Studio and deploy cleanly to any standard Node.js cloud host from GitHub.

---

## 1. Environment Variables (Server-Side Secrets Only)

Configure these variables in your hosting provider's Secrets / Environment Variables panel (never paste secrets into frontend code or commit `.env` to GitHub):

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | Yes | Public canonical URL of your deployed site (e.g. `https://nexaflowtechnologies.com`). Used for sitemaps, canonicals, and Paystack callback URLs. |
| `NODE_ENV` | Yes | Set to `production` in live environments. |
| `MONGODB_URI` | Yes | MongoDB Atlas SRV connection string (`mongodb+srv://...`). |
| `JWT_SECRET` | Yes | Strong random 64-character secret for signing HTTP-only authentication cookies. |
| `ADMIN_SETUP_TOKEN` | First setup | One-time secret token required to create the first `super_admin` at `/portal-admin`. |
| `PAYSTACK_MODE` | Payments | `test` or `live`. |
| `PAYSTACK_SECRET_KEY` | Payments | Server-side Paystack secret (`sk_test_...` or `sk_live_...`). Never expose in frontend! |
| `PAYSTACK_PUBLIC_KEY` | Optional | Paystack public key (`pk_test_...` or `pk_live_...`). |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth 2.0 Web Client ID for Google Sign-In (Admin & Learner). |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth 2.0 Client Secret (server-side only). |
| `EMAIL_PROVIDER` | Optional | `resend` or `sendgrid` for transactional & password reset emails. |
| `EMAIL_API_KEY` | Optional | API key for the selected email provider. |
| `EMAIL_FROM` | Optional | Verified sender address (e.g. `NexaFlow Technologies <no-reply@yourdomain.com>`). |
| `GA_MEASUREMENT_ID` | Optional | Google Analytics 4 ID (`G-XXXXXXXXXX`), or configure in Admin SEO Settings. |
| `GSC_VERIFICATION_TAG` | Optional | Google Search Console HTML meta tag token, or configure in Admin SEO Settings. |

---

## 2. MongoDB Atlas Setup

1. Create a MongoDB Atlas account and provision a cluster (M0 free tier works for initial staging; upgrade to M10+ dedicated tier with automated backups for commercial production).
2. Under **Database Access**, create a dedicated database user with read/write permissions to your database.
3. Under **Network Access**, allow access from your hosting provider's outbound IPs (or `0.0.0.0/0` only when paired with strong Atlas credentials and TLS).
4. Copy the Node.js SRV connection string into `MONGODB_URI`.
5. On first connection, NexaFlow automatically initializes structural defaults (the 4 core Service pages, `GridMind AI` neutral product entry, empty-contact Business Settings, Legal policy templates, and Page SEO defaults) without creating any fake users, leads, courses, or payments.

### Backup & Recovery Recommendations
- Enable Atlas Continuous Backups / Cloud Snapshots on production clusters.
- Export leads regularly via **Admin Portal → Lead CRM → Export CSV**.

---

## 3. Separate Administrator Portal, Google Sign-In & Password Reset

- The Admin Portal lives exclusively at `/portal-admin` and is **never linked in public navigation or the footer**.
- After configuring `MONGODB_URI`:
  1. Navigate directly to `https://your-domain.com/portal-admin`.
  2. Set your own **Full Name**, **Primary Login Email**, optional **Additional Emails** (for Google Sign-In / password resets), and **Password (10+ characters)**. (In production, also provide `ADMIN_SETUP_TOKEN`).
  3. Once created, `/api/admin/setup` permanently locks (`403 Forbidden`).
  4. Inside the Admin Portal, open **My Emails & Password** anytime to change your primary email, add or remove authorised login emails, or update your password in MongoDB.
- **Google Sign-In**:
  1. Create an OAuth 2.0 Web Client in Google Cloud Console.
  2. Add `<YOUR_APP_URL>/api/auth/google/callback` to Authorized Redirect URIs.
  3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in environment secrets.
  4. Only MongoDB administrator accounts whose primary or additional email matches the Google account can sign in to `/portal-admin`.
- **Forgot & Reset Password**:
  - Hashed 30-minute reset tokens are stored in MongoDB (`PasswordResetToken` collection) and emailed when `EMAIL_PROVIDER`/`EMAIL_API_KEY`/`EMAIL_FROM` are configured. Administrators can also use `ADMIN_SETUP_TOKEN` recovery on `/portal-admin`.

---

## 4. Paystack Payment Gateway Setup (Test & Live Modes)

- Default course currency is **GHS** (configurable per course in the Course Manager).
- **Test Mode**:
  1. In your Paystack Dashboard (Test Mode), copy your Test Secret Key (`sk_test_...`) into `PAYSTACK_SECRET_KEY` and set `PAYSTACK_MODE="test"`.
  2. Set the Paystack Webhook URL to: `https://your-domain.com/api/payments/webhook`.
- **Live Mode**:
  1. Complete Paystack business compliance/KYC verification and verify GHS settlement eligibility.
  2. Switch `PAYSTACK_SECRET_KEY` to your Live Secret Key (`sk_live_...`) and set `PAYSTACK_MODE="live"`.
- **Security Guarantees**:
  - Course access is **never** activated from a redirect URL alone; `/api/payments/verify/:reference` verifies amount, currency, and course metadata against Paystack's server API, and `/api/payments/webhook` validates the `x-paystack-signature` HMAC-SHA512 header and tracks processed event IDs idempotently.

---

## 5. Email Notifications (Optional)

1. Verify your domain with **Resend** or **SendGrid**.
2. Set `EMAIL_PROVIDER` (`resend` or `sendgrid`), `EMAIL_API_KEY`, and `EMAIL_FROM`.
3. Notifications are delivered only when the provider returns HTTP 2xx; in-app notifications always work in MongoDB regardless of email configuration.

---

## 6. Google Search Console & Google Analytics 4

- **Google Search Console**:
  1. Open Google Search Console → Add Property (URL Prefix or Domain).
  2. Copy the `content` token from the HTML verification meta tag and paste it in **Admin Portal → SEO & Tracking** (or `GSC_VERIFICATION_TAG`).
  3. Once verified, submit `https://your-domain.com/sitemap.xml`. Private pages (`/portal-admin`, `/learner`, `/auth`) are automatically excluded from `sitemap.xml` and blocked in `/robots.txt` + `noindex` meta tags.
- **Google Analytics 4**:
  1. Create a GA4 Web Stream and copy the Measurement ID (`G-XXXXXXXXXX`).
  2. Paste it in **Admin Portal → SEO & Tracking** (or `GA_MEASUREMENT_ID`).
  3. GA4 scripts only load **after** the visitor clicks **Accept Analytics** on the cookie banner.

---

## 7. GitHub Export, Build & Commercial Hosting Suitability

### Build Commands
- Install dependencies: `npm install`
- Build frontend bundle: `npm run build`
- Start production server (serves API + built `dist/`): `npm start`

### Commercial Hosting Guidance (Important)
- This is a persistent full-stack Express + MongoDB + Paystack commercial platform.
- **Do not rely on free hobby hosting tiers for live commercial paid courses**:
  - Free serverless/hobby tiers often forbid or throttle commercial traffic, impose cold-start timeouts during Paystack webhook processing, sleep on inactivity, or lack SLA guarantees.
  - **Recommended Commercial Production Hosts**:
    - **Render (Starter/Standard Web Service)**, **Railway (Pro)**, **Fly.io**, **DigitalOcean App Platform**, or **Google Cloud Run** (always-on min-instances = 1) paired with **MongoDB Atlas M10+**.
    - If deploying to **Vercel**, note that Vercel Hobby is strictly non-commercial—a **Vercel Pro** plan is required for commercial use, and standard Node Express servers are generally cleaner and cheaper to run as a long-lived container on Cloud Run / Render / Railway.
- **Domain & DNS**:
  1. Point an `A` / `CNAME` record from your domain registrar to your hosting provider.
  2. Enable automatic HTTPS/TLS certificates.
  3. Set `APP_URL="https://yourdomain.com"`.
