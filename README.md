# StudentAccomo

> The trusted student accommodation platform for VUT students — Vanderbijlpark, Gauteng.

Live site: [www.studentaccomo.co.za](https://www.studentaccomo.co.za)  
Status page: [studentaccomo.betteruptime.com](https://studentaccomo.betteruptime.com)

---

## What It Does

StudentAccomo connects VUT students with verified, affordable accommodation near campus. Landlords list their properties through a secure admin panel, and students can browse, filter, and send inquiries directly from the site.

---

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** MySQL (Railway)
- **Image Storage:** Cloudinary
- **Hosting:** Railway
- **Domain:** GoDaddy — studentaccomo.co.za
- **Monitoring:** Better Stack (uptime + status page)
- **Frontend:** Vanilla HTML, CSS, JavaScript

---

## Features

**Public Site**
- Browse all accommodation listings
- Filter by room type, funding, deposit, availability, price
- Search by location or accommodation name
- View full property details with photos, map, and room info
- Send an inquiry form directly to the landlord
- WhatsApp contact button on every property
- Fully mobile responsive

**Admin Panel** (`/admin-login.html`)
- Secure JWT login with progressive lockout after failed attempts
- Add, edit, and delete properties
- Upload multiple images per property (Cloudinary)
- View and manage student inquiries
- Dashboard with live stats

---

---

## Project Structure

```
/
├── server.js              # Express backend
├── package.json
├── frontend/
│   ├── index.html         # Homepage — listings
│   ├── property.html      # Single property details
│   ├── inquiry.html       # Inquiry form
│   ├── admin-login.html   # Admin login
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── script.js
│   ├── admin/
│   │   ├── dashboard.html
│   │   ├── properties.html
│   │   ├── inquiries.html
│   │   ├── settings.html
│   │   └── admin.js
│   └── icons/             # Favicon + web icons
```

---


Built for VUT Students — Vanderbijlpark, Gauteng, South Africa.