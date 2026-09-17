const express = require('express');
const db = require('../db/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/dispense  { medicine_id, quantity }
// FEFO: deduct from the batch with the EARLIEST expiry_date first (that is still
// in-date and has quantity > 0). If that batch can't cover the full request,
// spill over into the next-soonest-expiring batch, and so on.
// The whole operation is wrapped in a DB transaction so it's all-or-nothing.
router.post('/', requireAuth, (req, res) => {
  const { medicine_id, quantity } = req.body;
  const qtyRequested = Number(quantity);

  if (!medicine_id || !qtyRequested || qtyRequested <= 0) {
    return res.status(400).json({ error: 'medicine_id and a positive quantity are required' });
  }

  const medicine = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicine_id);
  if (!medicine) return res.status(404).json({ error: 'Medicine not found' });

  const dispenseTxn = db.transaction((medId, qty, userId) => {
    // Only in-date batches are eligible, ordered soonest-expiry first (FEFO)
    const eligibleBatches = db
      .prepare(
        `SELECT * FROM batches
         WHERE medicine_id = ? AND expiry_date >= date('now') AND quantity > 0
         ORDER BY expiry_date ASC, id ASC`
      )
      .all(medId);

    const totalAvailable = eligibleBatches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < qty) {
      const err = new Error(
        `Insufficient in-date stock. Requested ${qty}, only ${totalAvailable} available.`
      );
      err.code = 'INSUFFICIENT_STOCK';
      throw err;
    }

    let remaining = qty;
    const breakdown = [];
    const updateBatch = db.prepare('UPDATE batches SET quantity = quantity - ? WHERE id = ?');
    const logDispense = db.prepare(
      `INSERT INTO dispense_log (medicine_id, batch_id, quantity, dispensed_by) VALUES (?,?,?,?)`
    );

    for (const batch of eligibleBatches) {
      if (remaining <= 0) break;
      const takeFromThisBatch = Math.min(batch.quantity, remaining);

      updateBatch.run(takeFromThisBatch, batch.id);
      logDispense.run(medId, batch.id, takeFromThisBatch, userId || null);

      breakdown.push({
        batch_id: batch.id,
        batch_no: batch.batch_no,
        expiry_date: batch.expiry_date,
        quantity_taken: takeFromThisBatch,
      });

      remaining -= takeFromThisBatch;
    }

    return breakdown;
  });

  try {
    const breakdown = dispenseTxn(medicine_id, qtyRequested, req.user && req.user.id);
    const newStock = db
      .prepare(
        `SELECT COALESCE(SUM(quantity),0) c FROM batches
         WHERE medicine_id = ? AND expiry_date >= date('now') AND quantity > 0`
      )
      .get(medicine_id).c;

    res.json({
      medicine_id: Number(medicine_id),
      medicine_name: medicine.name,
      quantity_dispensed: qtyRequested,
      fefo_breakdown: breakdown,
      remaining_in_date_stock: newStock,
    });
  } catch (e) {
    if (e.code === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({ error: e.message });
    }
    console.error(e);
    res.status(500).json({ error: 'Failed to dispense' });
  }
});

// GET /api/dispense/history?medicine_id=&page=&limit=
router.get('/history', requireAuth, (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
  const offset = (page - 1) * limit;

  const where = req.query.medicine_id ? 'WHERE d.medicine_id = ?' : '';
  const params = req.query.medicine_id ? [req.query.medicine_id] : [];

  const total = db.prepare(`SELECT COUNT(*) c FROM dispense_log d ${where}`).get(...params).c;

  const rows = db
    .prepare(
      `SELECT d.*, m.name AS medicine_name, b.batch_no, b.expiry_date, u.name AS dispensed_by_name
       FROM dispense_log d
       JOIN medicines m ON m.id = d.medicine_id
       JOIN batches b ON b.id = d.batch_id
       LEFT JOIN users u ON u.id = d.dispensed_by
       ${where}
       ORDER BY d.dispensed_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
});

module.exports = router;
