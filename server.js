require("dotenv").config();
const fs   = require("fs");
const path = require("path");

// ── Env check ──────────────────────────────────────────────
console.log("🔥 ENV CHECK", {
  cloudinary_name:   process.env.CLOUDINARY_CLOUD_NAME   || "MISSING",
  cloudinary_key:    process.env.CLOUDINARY_API_KEY      || "MISSING",
  cloudinary_secret: process.env.CLOUDINARY_API_SECRET   ? "SET" : "MISSING",
  jwt_secret:        process.env.JWT_SECRET               ? "SET" : "MISSING ⚠️",
  db_host:           process.env.MYSQLHOST               || "MISSING",
});

// ── Crash if critical env vars are missing ─────────────────
if (!process.env.JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET env var is not set. Set it in Railway variables.");
  process.exit(1);
}

// ── Ensure tmp dir exists ──────────────────────────────────
if (!fs.existsSync("tmp")) fs.mkdirSync("tmp");

const upload     = require("./upload");
const cloudinary = require("./cloudinary");
const express    = require("express");
const cors       = require("cors");
const mysql      = require("mysql2");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const rateLimit  = require("express-rate-limit");

// ══════════════════════════════════════════════════════════
//  SECURITY — RATE LIMITERS
// ══════════════════════════════════════════════════════════

// Track login failures per IP for progressive blocking
const loginFailures = new Map(); // ip -> { count, blockedUntil }

function getLoginBlock(ip) {
  const record = loginFailures.get(ip) || { count: 0, blockedUntil: null };
  if (record.blockedUntil && Date.now() < record.blockedUntil) {
    const minutesLeft = Math.ceil((record.blockedUntil - Date.now()) / 60000);
    return { blocked: true, minutesLeft };
  }
  return { blocked: false, count: record.count };
}

function recordLoginFailure(ip) {
  const record = loginFailures.get(ip) || { count: 0, blockedUntil: null };
  // Reset count if previous block has expired
  if (record.blockedUntil && Date.now() >= record.blockedUntil) {
    record.count = 0;
    record.blockedUntil = null;
  }
  record.count += 1;

  // Progressive blocking: 3 fails = 1hr, 6 fails = 2hr, 9 fails = 24hr
  if (record.count >= 9) {
    record.blockedUntil = Date.now() + 24 * 60 * 60 * 1000;
    console.warn(`🚫 Login blocked 24hr for IP: ${ip}`);
  } else if (record.count >= 6) {
    record.blockedUntil = Date.now() + 2 * 60 * 60 * 1000;
    console.warn(`🚫 Login blocked 2hr for IP: ${ip}`);
  } else if (record.count >= 3) {
    record.blockedUntil = Date.now() + 60 * 60 * 1000;
    console.warn(`🚫 Login blocked 1hr for IP: ${ip}`);
  }
  loginFailures.set(ip, record);
}

function recordLoginSuccess(ip) {
  loginFailures.delete(ip); // Clear on successful login
}

// Inquiry rate limit — max 10 per IP per 24 hours
const inquiryLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many inquiries submitted. Please try again tomorrow." }
});

// ══════════════════════════════════════════════════════════
//  SECURITY — XSS SANITIZER
// ══════════════════════════════════════════════════════════
function sanitize(val) {
  if (!val) return val;
  return String(val)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
    .trim();
}

// ══════════════════════════════════════════════════════════
//  SECURITY — TOKEN BLACKLIST (logout invalidation)
// ══════════════════════════════════════════════════════════
const tokenBlacklist = new Set();

// Clean expired tokens every hour so Set doesn't grow forever
setInterval(() => {
  const now = Date.now() / 1000;
  for (const token of tokenBlacklist) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || decoded.exp < now) tokenBlacklist.delete(token);
    } catch { tokenBlacklist.delete(token); }
  }
}, 60 * 60 * 1000);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "frontend")));

// ── DB pool ────────────────────────────────────────────────
const db = mysql.createPool({
  host:             process.env.MYSQLHOST,
  user:             process.env.MYSQLUSER,
  password:         process.env.MYSQLPASSWORD,
  database:         process.env.MYSQLDATABASE,
  port:             Number(process.env.MYSQLPORT || 3306),
  waitForConnections: true,
  connectionLimit:  10,
  connectTimeout:   10000,
  ssl: { rejectUnauthorized: false }
}).promise();

// ── DB connection check + auto-reconnect ──────────────────
async function checkDbConnection() {
  try {
    const conn = await db.getConnection();
    console.log("✅ Database connected");
    conn.release();
  } catch (err) {
    console.error("❌ DB connection error:", err.message);
    // Retry after 5 seconds
    setTimeout(checkDbConnection, 5000);
  }
}
checkDbConnection();

// Keep DB alive — ping every 4 minutes to prevent connection timeout
setInterval(async () => {
  try {
    await db.query("SELECT 1");
  } catch (err) {
    console.error("❌ DB keepalive failed:", err.message);
  }
}, 4 * 60 * 1000);

// ── JWT ────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  const hdr = req.headers.authorization;
  if (!hdr) return res.status(401).json({ error: "Missing token" });
  const token = hdr.split(" ")[1];
  // Check blacklist first
  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ error: "Token has been invalidated. Please log in again." });
  }
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    req.token = token; // store for logout
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Helpers ────────────────────────────────────────────────
function normalize(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val.join(", ");
  return val;
}

// Clean up any tmp files left behind on error
function cleanTmpFiles(files) {
  if (!files?.length) return;
  files.forEach(f => { try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch {} });
}

// ══════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ══════════════════════════════════════════════════════════

app.get("/", (req, res) => {
  try {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
  } catch (err) {
    console.error("GET / ERROR:", err.message);
    res.status(500).send("Site is temporarily unavailable");
  }
});

// Health check for UptimeRobot
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

// GET all properties
app.get("/properties", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM properties ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("GET /properties ERROR:", err.message);
    res.status(500).json({ message: "Failed to load properties" });
  }
});

// GET single property
app.get("/properties/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM properties WHERE id = ?", [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Property not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("GET /properties/:id ERROR:", err.message);
    res.status(500).json({ message: "Failed to load property" });
  }
});

// ══════════════════════════════════════════════════════════
//  INQUIRIES
// ══════════════════════════════════════════════════════════

app.post("/inquiries", inquiryLimiter, async (req, res) => {
  try {
    const raw = req.body;

    // XSS sanitize all text inputs
    const name              = sanitize(raw.name);
    const email             = sanitize(raw.email);
    const phone             = sanitize(raw.phone);
    const preferred_contact = sanitize(raw.preferred_contact);
    const message           = sanitize(raw.message);
    const property_name     = sanitize(raw.property_name);
    const propertyId        = raw.propertyId;

    if (!name) return res.status(400).json({ message: "Name is required" });

    // Resolve property name
    let house = property_name || null;
    if (!house && propertyId) {
      const [p] = await db.query("SELECT title FROM properties WHERE id = ?", [propertyId]);
      if (p.length) house = p[0].title;
    }

    // Duplicate check — same email OR phone for same property
    if (house && (email || phone)) {
      const [existing] = await db.query(
        `SELECT id FROM inquiries
         WHERE house = ?
           AND ((email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone = ?))
         LIMIT 1`,
        [house, email || null, phone || null]
      );
      if (existing.length) {
        return res.status(409).json({
          message: "You have already submitted an inquiry for this property. Our team will contact you soon!"
        });
      }
    }

    const [result] = await db.query(
      `INSERT INTO inquiries (name, email, phone, house, preferred_contact, message, status)
       VALUES (?, ?, ?, ?, ?, ?, 'NEW')`,
      [name, email || null, phone || null, house, preferred_contact || null, message || null]
    );

    res.json({ message: "Inquiry saved", inquiryId: result.insertId });

  } catch (err) {
    console.error("POST /inquiries ERROR:", err.message);
    res.status(500).json({ message: "Failed to save inquiry. Please try again." });
  }
});

// GET inquiries (admin)
app.get("/admin/inquiries", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM inquiries ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("GET /admin/inquiries ERROR:", err.message);
    res.status(500).json({ message: "Failed to load inquiries" });
  }
});

// UPDATE inquiry status
app.put("/admin/inquiries/:id", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["NEW", "CONTACTED", "VIEWING SCHEDULED", "PLACED", "LOST"];
    if (!allowed.includes(status)) return res.status(400).json({ message: "Invalid status" });
    await db.query("UPDATE inquiries SET status=? WHERE id=?", [status, req.params.id]);
    res.json({ message: "Status updated" });
  } catch (err) {
    console.error("PUT /admin/inquiries/:id ERROR:", err.message);
    res.status(500).json({ message: "Failed to update status" });
  }
});

// DELETE inquiry
app.delete("/admin/inquiries/:id", authMiddleware, async (req, res) => {
  try {
    await db.query("DELETE FROM inquiries WHERE id=?", [req.params.id]);
    res.json({ message: "Inquiry deleted" });
  } catch (err) {
    console.error("DELETE /admin/inquiries/:id ERROR:", err.message);
    res.status(500).json({ message: "Failed to delete inquiry" });
  }
});

// ══════════════════════════════════════════════════════════
//  ADMIN AUTH
// ══════════════════════════════════════════════════════════

app.post("/admin/login", async (req, res) => {
  try {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });

    // Progressive block check
    const block = getLoginBlock(ip);
    if (block.blocked) {
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${block.minutesLeft} minute${block.minutesLeft === 1 ? "" : "s"}.`
      });
    }

    const [rows] = await db.query(
      "SELECT * FROM admin_users WHERE username = ?", [username]
    );
    if (!rows.length) {
      recordLoginFailure(ip);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) {
      recordLoginFailure(ip);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Success — clear failure record
    recordLoginSuccess(ip);

    const token = jwt.sign(
      { id: rows[0].id, username: rows[0].username },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ token });

  } catch (err) {
    console.error("POST /admin/login ERROR:", err.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// LOGOUT — blacklist the token immediately
app.post("/admin/logout", authMiddleware, (req, res) => {
  try {
    tokenBlacklist.add(req.token);
    console.log("✅ Token blacklisted on logout");
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: "Logout failed" });
  }
});

// CHANGE PASSWORD
app.post("/admin/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: "Both fields are required" });
    if (newPassword.length < 8)
      return res.status(400).json({ error: "New password must be at least 8 characters" });

    const [rows] = await db.query(
      "SELECT * FROM admin_users WHERE id = ?", [req.admin.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Admin user not found" });

    const valid = await bcrypt.compare(currentPassword, rows[0].password);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE admin_users SET password=? WHERE id=?", [hashed, req.admin.id]);
    res.json({ message: "Password updated successfully" });

  } catch (err) {
    console.error("POST /admin/change-password ERROR:", err.message);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// ══════════════════════════════════════════════════════════
//  PROPERTIES (ADMIN)
// ══════════════════════════════════════════════════════════

// Duplicate check
app.post("/admin/properties/check-duplicate", authMiddleware, async (req, res) => {
  try {
    const { title, location } = req.body;
    const [dup] = await db.query(
      `SELECT id FROM properties
       WHERE LOWER(TRIM(title))=LOWER(TRIM(?)) AND LOWER(TRIM(location))=LOWER(TRIM(?))`,
      [title?.trim(), location?.trim()]
    );
    res.json({ exists: dup.length > 0 });
  } catch (err) {
    console.error("POST /admin/properties/check-duplicate ERROR:", err.message);
    res.status(500).json({ exists: false });
  }
});

// ADD PROPERTY
app.post("/properties", authMiddleware, upload.array("images", 10), async (req, res) => {
  try {
    const {
      title, location, price, description,
      room_type, student_types, funding_options,
      deposit_type, deposit_amount, rooms_available,
      distance_km, walking_time,
      transport_options, security_features,
      amenities, utilities,
      lease_term, room_includes
    } = req.body;

    if (!title || !location) {
      cleanTmpFiles(req.files);
      return res.status(400).json({ message: "Title and location are required" });
    }

    // Duplicate check
    const [dup] = await db.query(
      `SELECT id FROM properties
       WHERE LOWER(TRIM(title))=LOWER(TRIM(?)) AND LOWER(TRIM(location))=LOWER(TRIM(?))`,
      [title.trim(), location.trim()]
    );
    if (dup.length) {
      cleanTmpFiles(req.files);
      return res.status(409).json({ message: "A property with this title and location already exists." });
    }

    // Upload images
    let imageUrls = [];
    if (req.files?.length) {
      for (const file of req.files) {
        try {
          const result = await cloudinary.uploader.upload(file.path, { folder: "properties" });
          imageUrls.push(result.secure_url);
        } finally {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        }
      }
    }

    await db.query(
      `INSERT INTO properties
       (title, location, price, description, images, room_type, student_types,
        funding_options, deposit_type, deposit_amount, rooms_available,
        distance_from_campus, walking_time, transport_options, security_features,
        amenities, utilities, lease_terms, room_includes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title || null, location || null, price || null, description || null,
        imageUrls.length ? imageUrls.join(",") : null,
        room_type || null, student_types || null, funding_options || null,
        deposit_type || "NO",
        deposit_type === "YES" ? (deposit_amount || null) : null,
        rooms_available || null, distance_km || null, walking_time || null,
        normalize(transport_options), normalize(security_features),
        normalize(amenities), normalize(utilities),
        lease_term || null, room_includes || null
      ]
    );

    res.json({ message: "Property added" });

  } catch (err) {
    cleanTmpFiles(req.files);
    console.error("POST /properties ERROR:", err.message);
    res.status(500).json({ message: "Failed to add property", error: err.message });
  }
});

// UPDATE PROPERTY
app.put("/properties/:id", authMiddleware, upload.array("images", 10), async (req, res) => {
  try {
    const id = req.params.id;
    const {
      title, location, price, description,
      room_type, student_types, funding_options,
      deposit_type, deposit_amount, rooms_available,
      distance_km, walking_time,
      transport_options, security_features,
      amenities, utilities,
      lease_term, room_includes
    } = req.body;

    // Upload new images if provided
    let imageSql  = "";
    let imageVals = [];
    if (req.files?.length) {
      let urls = [];
      for (const file of req.files) {
        try {
          const result = await cloudinary.uploader.upload(file.path, { folder: "properties" });
          urls.push(result.secure_url);
        } finally {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        }
      }
      if (urls.length) {
        imageSql = ", images=?";
        imageVals.push(urls.join(","));
      }
    }

    const values = [
      title || null, location || null, price || null, description || null,
      room_type || null, student_types || null, funding_options || null,
      deposit_type || "NO",
      deposit_type === "YES" ? (deposit_amount || null) : null,
      rooms_available || null, distance_km || null, walking_time || null,
      normalize(transport_options), normalize(security_features),
      normalize(amenities), normalize(utilities),
      lease_term || null, room_includes || null,
      ...imageVals,
      id
    ];

    await db.query(
      `UPDATE properties SET
        title=?, location=?, price=?, description=?,
        room_type=?, student_types=?, funding_options=?,
        deposit_type=?, deposit_amount=?,
        rooms_available=?, distance_from_campus=?, walking_time=?,
        transport_options=?, security_features=?,
        amenities=?, utilities=?,
        lease_terms=?, room_includes=?
        ${imageSql}
       WHERE id=?`,
      values
    );

    res.json({ message: "Property updated" });

  } catch (err) {
    cleanTmpFiles(req.files);
    console.error("PUT /properties/:id ERROR:", err.message);
    res.status(500).json({ message: "Failed to update property", error: err.message });
  }
});

// DELETE PROPERTY
app.delete("/properties/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.query("SELECT images FROM properties WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: "Property not found" });

    // Delete images from Cloudinary
    if (rows[0].images) {
      const urls = rows[0].images.split(",");
      for (const url of urls) {
        try {
          const publicId = "properties/" + url.trim().split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(publicId);
        } catch (e) {
          console.warn("Cloudinary delete warning:", e.message);
        }
      }
    }

    await db.query("DELETE FROM properties WHERE id = ?", [id]);
    res.json({ message: "Property deleted" });

  } catch (err) {
    console.error("DELETE /properties/:id ERROR:", err.message);
    res.status(500).json({ message: "Failed to delete property" });
  }
});

// ══════════════════════════════════════════════════════════
//  GLOBAL ERROR HANDLER — catches anything that slips through
// ══════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  // Multer file size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "Image too large. Maximum size is 5MB per image." });
  }
  // Multer file type error
  if (err.message === "Only image files are allowed") {
    return res.status(400).json({ message: "Only image files are allowed." });
  }
  // Multer too many files
  if (err.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({ message: "Maximum 10 images allowed." });
  }
  console.error("🔥 UNHANDLED ERROR:", err.message);
  res.status(500).json({ message: "An unexpected error occurred" });
});

// 404
app.use((req, res) => res.status(404).send("Not found"));

// ── Uncaught exception safety net — logs but keeps server alive
process.on("uncaughtException",  err => console.error("💥 uncaughtException:",  err.message));
process.on("unhandledRejection", err => console.error("💥 unhandledRejection:", err));

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));