const express = require('express');
const db = require('../db/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const SORTABLE = ['name', 'category', 'created_at'];

// GET /api/medicines?search=&page=&limit=&sort=&dir=
// Returns medicines with their in-date (non-expired) stock count.
router.get('/', requireAuth, (req, res) => {
  const search = (req.query.search || '').trim();
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
  const offset = (page - 1) * limit;
  let sort = req.query.sort || 'name';
  if (!SORTABLE.includes(sort)) sort = 'name';
  const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';

  const searchClause = search ? `WHERE m.name LIKE @s OR m.generic_name LIKE @s OR m.category LIKE @s` : '';
  const params = search ? { s: `%${search}%` } : {};

  const total = db
    .prepare(`SELECT COUNT(*) c FROM medicines m ${searchClause}`)
    .get(params).c;

  // in-date stock = sum of quantity in batches that have not expired yet (expiry_date >= today)
  const rows = db
    .prepare(
      `SELECT m.*,
        COALESCE((
          SELECT SUM(b.quantity) FROM batches b
          WHERE b.medicine_id = m.id AND b.expiry_date >= date('now') AND b.quantity > 0
        ), 0) AS in_date_stock
       FROM medicines m
       ${searchClause}
       ORDER BY m.${sort} ${dir}
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset });

  res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
});

router.get('/:id', requireAuth, (req, res) => {
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(req.params.id);
  if (!med) return res.status(404).json({ error: 'Medicine not found' });
  res.json(med);
});

router.post('/', requireAuth, (req, res) => {
  const { name, generic_name, category, unit, reorder_level } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db
    .prepare(
      `INSERT INTO medicines (name, generic_name, category, unit, reorder_level) VALUES (?,?,?,?,?)`
    )
    .run(name, generic_name || null, category || null, unit || 'tablets', reorder_level || 10);
  res.status(201).json(db.prepare('SELECT * FROM medicines WHERE id = ?').get(info.lastInsertRowid));
});

// GET /api/medicines/:id/stock  -> in-date stock count breakdown
router.get('/:id/stock', requireAuth, (req, res) => {
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(req.params.id);
  if (!med) return res.status(404).json({ error: 'Medicine not found' });

  const inDateStock = db
    .prepare(
      `SELECT COALESCE(SUM(quantity),0) c FROM batches
       WHERE medicine_id = ? AND expiry_date >= date('now') AND quantity > 0`
    )
    .get(req.params.id).c;

  const expiredStock = db
    .prepare(
      `SELECT COALESCE(SUM(quantity),0) c FROM batches
       WHERE medicine_id = ? AND expiry_date < date('now') AND quantity > 0`
    )
    .get(req.params.id).c;

  res.json({
    medicine_id: Number(req.params.id),
    medicine_name: med.name,
    in_date_stock: inDateStock,
    expired_stock: expiredStock,
    total_stock: inDateStock + expiredStock,
    low_stock: inDateStock <= med.reorder_level,
  });
});

// GET /api/medicines/:id/batches?page=&limit=&sort=
router.get('/:id/batches', requireAuth, (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
  const offset = (page - 1) * limit;
  const sortable = ['expiry_date', 'quantity', 'created_at'];
  let sort = req.query.sort || 'expiry_date';
  if (!sortable.includes(sort)) sort = 'expiry_date';
  const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';

  const total = db
    .prepare('SELECT COUNT(*) c FROM batches WHERE medicine_id = ?')
    .get(req.params.id).c;

  const rows = db
    .prepare(
      `SELECT *,
        CASE WHEN expiry_date < date('now') THEN 1 ELSE 0 END AS is_expired
       FROM batches WHERE medicine_id = ?
       ORDER BY ${sort} ${dir}
       LIMIT ? OFFSET ?`
    )
    .all(req.params.id, limit, offset);

  res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
});

// POST /api/medicines/:id/batches  -> add a new batch
router.post('/:id/batches', requireAuth, (req, res) => {
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(req.params.id);
  if (!med) return res.status(404).json({ error: 'Medicine not found' });

  const { batch_no, mfg_date, expiry_date, quantity, cost_price } = req.body;
  if (!batch_no || !expiry_date || quantity == null) {
    return res.status(400).json({ error: 'batch_no, expiry_date and quantity are required' });
  }
  if (Number(quantity) < 0) return res.status(400).json({ error: 'quantity cannot be negative' });

  const info = db
    .prepare(
      `INSERT INTO batches (medicine_id, batch_no, mfg_date, expiry_date, quantity, cost_price)
       VALUES (?,?,?,?,?,?)`
    )
    .run(req.params.id, batch_no, mfg_date || null, expiry_date, quantity, cost_price || 0);

  res.status(201).json(db.prepare('SELECT * FROM batches WHERE id = ?').get(info.lastInsertRowid));
});

module.exports = router;
