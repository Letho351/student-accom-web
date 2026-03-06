require("dotenv").config();
const fs = require("fs");

console.log("🔥 RAILWAY ENV CHECK", {
  name: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET ? "SET" : "MISSING"
});

if (!fs.existsSync("tmp")) {
  fs.mkdirSync("tmp");
}

const upload = require("./upload");
const cloudinary = require('./cloudinary');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'frontend')));

// ---------------- DB ----------------
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: Number(process.env.MYSQLPORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false }
}).promise();

db.getConnection()
  .then(conn => { console.log('✅ Database connected'); conn.release(); })
  .catch(err => console.error('❌ DB connection error:', err));

// ---------------- JWT ----------------
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

function authMiddleware(req, res, next) {
  const hdr = req.headers.authorization;
  if (!hdr) return res.status(401).json({ error: 'Missing token' });
  try {
    req.admin = jwt.verify(hdr.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---------------- HELPERS ----------------
function normalize(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val.join(', ');
  return val;
}

// ---------------- PUBLIC ROUTES ----------------
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
);

app.get('/properties', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM properties ORDER BY id DESC');
  res.json(rows);
});

app.get('/properties/:id', async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM properties WHERE id = ?', [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  res.json(rows[0]);
});

// ---------------- INQUIRIES ----------------
app.post('/inquiries', async (req, res) => {
  const {
    name, email, phone,
    preferred_contact, message,
    propertyId, property_name
  } = req.body;

  // ---- DUPLICATE CHECK: same email OR same phone for same property ----
  let house = property_name || null;
  if (!house && propertyId) {
    const [p] = await db.query(
      'SELECT title FROM properties WHERE id = ?', [propertyId]
    );
    if (p.length) house = p[0].title;
  }

  if (email || phone) {
    const [existing] = await db.query(
      `SELECT id FROM inquiries
       WHERE house = ?
         AND (
           (email IS NOT NULL AND email = ?) OR
           (phone IS NOT NULL AND phone = ?)
         )
       LIMIT 1`,
      [house, email || null, phone || null]
    );

    if (existing.length) {
      return res.status(409).json({
        message: 'You have already submitted an inquiry for this property. Our team will contact you soon!'
      });
    }
  }

  const [result] = await db.query(
    `INSERT INTO inquiries
     (name, email, phone, house, preferred_contact, message, status)
     VALUES (?, ?, ?, ?, ?, ?, 'NEW')`,
    [name, email, phone, house, preferred_contact, message]
  );

  res.json({ message: 'Inquiry saved', inquiryId: result.insertId });
});

// ---------------- GET INQUIRIES (Admin) ----------------
app.get('/admin/inquiries', authMiddleware, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM inquiries ORDER BY id DESC');
  res.json(rows);
});

// ---------------- UPDATE INQUIRY STATUS (Admin) ----------------
app.put('/admin/inquiries/:id', authMiddleware, async (req, res) => {
  const { status } = req.body;
  await db.query(
    'UPDATE inquiries SET status=? WHERE id=?',
    [status, req.params.id]
  );
  res.json({ message: 'Status updated' });
});

// ---------------- DELETE INQUIRY (Admin) ----------------
app.delete('/admin/inquiries/:id', authMiddleware, async (req, res) => {
  await db.query('DELETE FROM inquiries WHERE id=?', [req.params.id]);
  res.json({ message: 'Inquiry deleted' });
});

// ---------------- ADMIN LOGIN ----------------
app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await db.query(
    'SELECT * FROM admin_users WHERE username = ?', [username]
  );

  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, rows[0].password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: rows[0].id, username: rows[0].username },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token });
});

// ---------------- CHANGE PASSWORD (Admin) ----------------
// NEW: Added for Settings page password change functionality
app.post('/admin/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both fields are required' });

  if (newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const [rows] = await db.query(
    'SELECT * FROM admin_users WHERE id = ?', [req.admin.id]
  );

  if (!rows.length)
    return res.status(404).json({ error: 'Admin user not found' });

  const valid = await bcrypt.compare(currentPassword, rows[0].password);
  if (!valid)
    return res.status(401).json({ error: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(newPassword, 10);
  await db.query(
    'UPDATE admin_users SET password=? WHERE id=?',
    [hashed, req.admin.id]
  );

  res.json({ message: 'Password updated successfully' });
});

// ---------------- DUPLICATE CHECK ----------------
app.post('/admin/properties/check-duplicate', authMiddleware, async (req, res) => {
  const { title, location, rooms_available } = req.body;
  const [dup] = await db.query(
    `SELECT id FROM properties 
     WHERE LOWER(title)=LOWER(?) 
       AND LOWER(location)=LOWER(?) 
       AND rooms_available=?`,
    [title?.trim(), location?.trim(), rooms_available]
  );
  res.json({ exists: dup.length > 0 });
});

// ---------------- ADD PROPERTY ----------------
app.post('/properties', authMiddleware, upload.array('images', 10), async (req, res) => {
  const { title, location, rooms_available } = req.body;

  const [dup] = await db.query(
    `SELECT id FROM properties 
     WHERE LOWER(title)=LOWER(?) 
       AND LOWER(location)=LOWER(?) 
       AND rooms_available=?`,
    [title?.trim(), location?.trim(), rooms_available]
  );

  if (dup.length) {
    return res.status(409).json({ message: 'Property already exists' });
  }

  let imageUrls = [];
  if (req.files?.length) {
    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'properties'
      });
      imageUrls.push(result.secure_url);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
  }

  const {
    price, description,
    room_type, student_types, funding_options,
    deposit_type, deposit_amount,
    distance_from_campus, walking_time,
    transport_options, security_features,
    amenities, utilities,
    lease_terms, room_includes,
    max_lease_months
  } = req.body;

  await db.query(
    `INSERT INTO properties
     (title, location, price, description, images, room_type, student_types,
      funding_options, deposit_type, deposit_amount, rooms_available,
      distance_from_campus, walking_time, transport_options, security_features,
      amenities, utilities, lease_terms, room_includes, max_lease_months)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title || null,
      location || null,
      price || null,
      description || null,
      imageUrls.join(',') || null,
      room_type || null,
      student_types || null,
      funding_options || null,
      deposit_type || 'NO',
      deposit_type === 'YES' ? deposit_amount : null,
      rooms_available || null,
      distance_from_campus || null,
      walking_time || null,
      normalize(transport_options),
      normalize(security_features),
      normalize(amenities),
      normalize(utilities),
      lease_terms || null,
      room_includes || null,
      max_lease_months || null
    ]
  );

  res.json({ message: 'Property added' });
});

// ---------------- UPDATE PROPERTY ----------------
app.put('/properties/:id', authMiddleware, upload.array('images', 10), async (req, res) => {
  const id = req.params.id;

  const {
    title, location, price, description,
    room_type, student_types, funding_options,
    deposit_type, deposit_amount,
    rooms_available,
    distance_km, walking_time,
    transport, security,
    amenities, utilities,
    lease_term, room_includes,
    six_month_rooms
  } = req.body;

  let imageSql = '';
  let imageVals = [];

  if (req.files?.length) {
    let urls = [];
    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, { folder: 'properties' });
      urls.push(result.secure_url);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
    imageSql = ', images=?';
    imageVals.push(urls.join(','));
  }

  await db.query(
    `UPDATE properties SET
      title=?, location=?, price=?, description=?,
      room_type=?, student_types=?, funding_options=?,
      deposit_type=?, deposit_amount=?,
      rooms_available=?, distance_from_campus=?, walking_time=?,
      transport_options=?, security_features=?,
      amenities=?, utilities=?,
      lease_terms=?, room_includes=?, six_month_rooms=?
      ${imageSql}
     WHERE id=?`,
    [
      title || null, location || null, price || null, description || null,
      room_type || null, student_types || null, funding_options || null,
      deposit_type || 'NO',
      deposit_type === 'YES' ? deposit_amount : null,
      rooms_available || null, distance_km || null, walking_time || null,
      normalize(transport), normalize(security),
      normalize(amenities), normalize(utilities),
      lease_term || null, room_includes || null, six_month_rooms || null,
      ...imageVals,
      id
    ]
  );

  res.json({ message: 'Property updated' });
});

// ---------------- DELETE PROPERTY ----------------
app.delete('/properties/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;

  const [rows] = await db.query(
    'SELECT images FROM properties WHERE id = ?', [id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Property not found' });

  if (rows[0].images) {
    const images = rows[0].images.split(',');
    for (const url of images) {
      const publicId = url.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`properties/${publicId}`);
    }
  }

  await db.query('DELETE FROM properties WHERE id = ?', [id]);
  res.json({ message: 'Property deleted' });
});

// ---------------- 404 ----------------
app.use((req, res) => res.status(404).send('Not found'));

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));