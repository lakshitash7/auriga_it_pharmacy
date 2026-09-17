const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

require('./db/init'); // ensures schema + seed exist

const authRoutes = require('./routes/auth');
const medicineRoutes = require('./routes/medicines');
const dispenseRoutes = require('./routes/dispense');
const alertRoutes = require('./routes/alerts');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/dispense', dispenseRoutes);
app.use('/api/alerts', alertRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Pharmacy FEFO server running on http://localhost:${PORT}`);
});
