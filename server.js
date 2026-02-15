require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
// Accept JSON and form submissions
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend + uploads
app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// DB pool (promise API)
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: Number(process.env.MYSQLPORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  ssl: {
    rejectUnauthorized: false
  }
}).promise();

db.getConnection()
  .then(conn => { 
    console.log('✅ Database connected'); 
    conn.release(); 
  })
  .catch(err => { 
    console.error('❌ DB connection error:', err); 
  });

// Uploads config
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

// JWT auth
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
function authMiddleware(req, res, next) {
  const hdr = req.headers.authorization;
  if (!hdr) return res.status(401).json({ error: 'Missing token' });
  const token = hdr.split(' ')[1];
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/* ---------------- PUBLIC ROUTES ---------------- */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'index.html')));

// GET properties
app.get('/properties', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM properties ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /properties error', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// GET single property
app.get('/properties/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM properties WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /properties/:id error', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// POST inquiry (public)
app.post('/inquiries', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      preferred_contact,
      message,
      propertyId,
      property_name
    } = req.body;

    let house = property_name || null;
    if (!house && propertyId) {
      try {
        const [pRows] = await db.query('SELECT title FROM properties WHERE id = ?', [propertyId]);
        if (pRows && pRows.length) house = pRows[0].title;
      } catch (e) {}
    }

    const sql = `INSERT INTO inquiries (name, email, phone, house, preferred_contact, message, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'NEW')`;

    const [result] = await db.query(sql, [
      name || null,
      email || null,
      phone || null,
      house || null,
      preferred_contact || null,
      message || null
    ]);

    return res.json({ message: 'Inquiry saved successfully', inquiryId: result.insertId });
  } catch (err) {
    console.error('POST /inquiries error:', err);
    return res.status(500).json({ message: 'Database error' });
  }
});

/* ---------------- AUTH (admin login) ---------------- */
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await db.query('SELECT * FROM admin_users WHERE username = ?', [username]);
    const admin = rows[0];
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    let valid = false;
    try { valid = await bcrypt.compare(password, admin.password); } catch (e) { valid = (password === admin.password); }
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (err) {
    console.error('POST /admin/login error', err);
    res.status(500).json({ error: 'DB error' });
  }
});

/* ---------------- ADMIN: properties add/update/delete ---------------- */
app.post('/properties', authMiddleware, upload.array('images', 10), async (req, res) => {
  try {
    const {
      title, location, price, description,
      room_type, student_types, funding_options,
      deposit_type, deposit_amount, rooms_available
    } = req.body;

    const filenames = (req.files || []).map(f => `/uploads/${f.filename}`).join(',');

    const [result] = await db.query(
      `INSERT INTO properties
      (title, location, price, description, images, room_type, student_types, funding_options,
       deposit_type, deposit_amount, rooms_available)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title || null,
        location || null,
        (price && price !== '') ? price : null,
        description || null,
        filenames || null,
        room_type || null,
        student_types || null,
        funding_options || null,
        deposit_type || 'NO',
        deposit_type === 'YES' ? deposit_amount : null,
        rooms_available || null
      ]
    );

    res.json({ message: 'Property added', propertyId: result.insertId });
  } catch (err) {
    console.error('POST /properties error', err);
    res.status(500).json({ message: 'Database error' });
  }
});

app.put('/properties/:id', authMiddleware, upload.array('images', 10), async (req, res) => {
  try {
    const id = req.params.id;
    const [existingRows] = await db.query('SELECT * FROM properties WHERE id = ?', [id]);
    if (!existingRows.length) return res.status(404).json({ message: 'Property not found' });
    const existing = existingRows[0];

    const {
      title, location, price, description,
      room_type, student_types, funding_options,
      deposit_type, deposit_amount, rooms_available
    } = req.body;

    const newFiles = (req.files || []).map(f => `/uploads/${f.filename}`).join(',');
    const imagesToSave = newFiles ? newFiles : existing.images;

    await db.query(
      `UPDATE properties SET
        title=?, location=?, price=?, description=?, images=?,
        room_type=?, student_types=?, funding_options=?,
        deposit_type=?, deposit_amount=?, rooms_available=?
       WHERE id = ?`,
      [
        title || existing.title,
        location || existing.location,
        (price && price !== '') ? price : existing.price,
        description || existing.description,
        imagesToSave || null,
        room_type || existing.room_type,
        student_types || existing.student_types,
        funding_options || existing.funding_options,
        deposit_type || existing.deposit_type,
        deposit_type === 'YES' ? deposit_amount : null,
        rooms_available || existing.rooms_available,
        id
      ]
    );

    res.json({ message: 'Property updated' });
  } catch (err) {
    console.error('PUT /properties/:id error', err);
    res.status(500).json({ message: 'Database error' });
  }
});

app.delete('/properties/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.query('SELECT images FROM properties WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Property not found' });
    const images = rows[0].images;
    if (images) {
      images.split(',').forEach(rel => {
        try { const p = path.join(__dirname, rel.replace(/^\//, '')); if (fs.existsSync(p)) fs.unlinkSync(p); } catch(e) {}
      });
    }
    await db.query('DELETE FROM properties WHERE id = ?', [id]);
    res.json({ message: 'Property deleted' });
  } catch (err) {
    console.error('DELETE /properties/:id error', err);
    res.status(500).json({ message: 'Database error' });
  }
});

/* ---------------- ADMIN: inquiries ---------------- */
app.get('/admin/inquiries', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM inquiries ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /admin/inquiries error', err);
    res.status(500).json({ message: 'Database error' });
  }
});

app.put('/admin/inquiries/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    await db.query('UPDATE inquiries SET status = ? WHERE id = ?', [status, id]);
    res.json({ message: 'Status updated' });
  } catch (err) {
    console.error('PUT /admin/inquiries/:id error', err);
    res.status(500).json({ message: 'Database error' });
  }
});

/* ✅ ADDED DELETE ROUTE FOR INQUIRIES */
app.delete('/admin/inquiries/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;

    const [result] = await db.query(
      'DELETE FROM inquiries WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Inquiry not found' });
    }

    res.json({ message: 'Inquiry deleted successfully' });
  } catch (err) {
    console.error('DELETE /admin/inquiries/:id error', err);
    res.status(500).json({ message: 'Database error' });
  }
});

// fallback
app.use((req, res) => res.status(404).send('Not found'));

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
