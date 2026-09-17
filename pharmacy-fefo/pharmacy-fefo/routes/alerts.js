const express = require('express');
const db = require('../db/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/alerts/expiring?days=30 -> batches expiring within N days (still in-date)
router.get('/expiring', requireAuth, (req, res) => {
  const days = Math.max(parseInt(req.query.days) || 30, 1);
  const rows = db
    .prepare(
      `SELECT b.*, m.name AS medicine_name
       FROM batches b JOIN medicines m ON m.id = b.medicine_id
       WHERE b.quantity > 0
         AND b.expiry_date >= date('now')
         AND b.expiry_date <= date('now', '+' || ? || ' days')
       ORDER BY b.expiry_date ASC`
    )
    .all(days);
  res.json({ days, data: rows });
});

// GET /api/alerts/expired -> batches already expired but still have stock on record
router.get('/expired', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT b.*, m.name AS medicine_name
       FROM batches b JOIN medicines m ON m.id = b.medicine_id
       WHERE b.quantity > 0 AND b.expiry_date < date('now')
       ORDER BY b.expiry_date ASC`
    )
    .all();
  res.json({ data: rows });
});

// GET /api/alerts/low-stock -> medicines whose in-date stock is at/below reorder level
router.get('/low-stock', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM (
         SELECT m.*,
           COALESCE((
             SELECT SUM(b.quantity) FROM batches b
             WHERE b.medicine_id = m.id AND b.expiry_date >= date('now') AND b.quantity > 0
           ), 0) AS in_date_stock
         FROM medicines m
       )
       WHERE in_date_stock <= reorder_level
       ORDER BY in_date_stock ASC`
    )
    .all();
  res.json({ data: rows });
});

module.exports = router;
