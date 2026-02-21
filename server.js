require("dotenv").config();
const fs = require("fs");

console.log("🔥 RAILWAY ENV CHECK", {
  name: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET ? "SET" : "MISSING"
});

// Ensure tmp directory exists (important for Railway)
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

// Serve frontend
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

// ---------------- PUBLIC ----------------
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
);

app.get('/properties', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM properties ORDER BY id DESC');
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Database error' });
  }
});

app.get('/properties/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM properties WHERE id = ?', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ message: 'Database error' });
  }
});

// ---------------- INQUIRIES ----------------
app.post('/inquiries', async (req, res) => {
  try {
    const {
      name, email, phone,
      preferred_contact, message,
      propertyId, property_name
    } = req.body;

    let house = property_name || null;
    if (!house && propertyId) {
      const [p] = await db.query(
        'SELECT title FROM properties WHERE id = ?', [propertyId]
      );
      if (p.length) house = p[0].title;
    }

    const [result] = await db.query(
      `INSERT INTO inquiries
       (name, email, phone, house, preferred_contact, message, status)
       VALUES (?, ?, ?, ?, ?, ?, 'NEW')`,
      [name, email, phone, house, preferred_contact, message]
    );

    res.json({ message: 'Inquiry saved', inquiryId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ---------------- ADMIN LOGIN ----------------
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await db.query(
      'SELECT * FROM admin_users WHERE username = ?', [username]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = rows[0];
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ---------------- PROPERTIES (ALIGNED IMAGE HANDLING) ----------------

// ADD PROPERTY
app.post('/properties', authMiddleware, upload.array('images', 10), async (req, res) => {
  try {
    let imageUrls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: 'properties'
          });

          imageUrls.push(result.secure_url);

          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (uploadErr) {
          console.error('Image upload failed:', uploadErr);

          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }

          return res.status(500).json({
            message: 'Image upload failed. Property not saved.'
          });
        }
      }
    }

    const {
      title, location, price, description,
      room_type, student_types, funding_options,
      deposit_type, deposit_amount, rooms_available
    } = req.body;

    const [result] = await db.query(
      `INSERT INTO properties
      (title, location, price, description, images, room_type, student_types,
       funding_options, deposit_type, deposit_amount, rooms_available)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title || null,
        location || null,
        (price && price !== '') ? price : null,
        description || null,
        imageUrls.join(',') || null,
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
    console.error(err);
    res.status(500).json({ message: 'Database error' });
  }
});

// UPDATE PROPERTY
app.put('/properties/:id', authMiddleware, upload.array('images', 10), async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.query(
      'SELECT * FROM properties WHERE id = ?', [id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const existing = rows[0];
    let imageUrls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'properties'
        });

        imageUrls.push(result.secure_url);

        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    const imagesToSave = imageUrls.length
      ? imageUrls.join(',')
      : existing.images;

    await db.query(
      `UPDATE properties SET
        title=?, location=?, price=?, description=?, images=?,
        room_type=?, student_types=?, funding_options=?,
        deposit_type=?, deposit_amount=?, rooms_available=?
       WHERE id=?`,
      [
        req.body.title || existing.title,
        req.body.location || existing.location,
        (req.body.price && req.body.price !== '') ? req.body.price : existing.price,
        req.body.description || existing.description,
        imagesToSave,
        req.body.room_type || existing.room_type,
        req.body.student_types || existing.student_types,
        req.body.funding_options || existing.funding_options,
        req.body.deposit_type || existing.deposit_type,
        req.body.deposit_type === 'YES'
          ? req.body.deposit_amount
          : null,
        req.body.rooms_available || existing.rooms_available,
        id
      ]
    );

    res.json({ message: 'Property updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Database error' });
  }
});

// ---------------- ADMIN INQUIRIES ----------------
app.get('/admin/inquiries', authMiddleware, async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM inquiries ORDER BY id DESC'
  );
  res.json(rows);
});

app.put('/admin/inquiries/:id', authMiddleware, async (req, res) => {
  await db.query(
    'UPDATE inquiries SET status=? WHERE id=?',
    [req.body.status, req.params.id]
  );
  res.json({ message: 'Status updated' });
});

app.delete('/admin/inquiries/:id', authMiddleware, async (req, res) => {
  await db.query(
    'DELETE FROM inquiries WHERE id=?',
    [req.params.id]
  );
  res.json({ message: 'Inquiry deleted' });
});

// ---------------- FALLBACK ----------------
app.use((req, res) => res.status(404).send('Not found'));

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () =>
  console.log(`🚀 Server listening on ${PORT}`)
);