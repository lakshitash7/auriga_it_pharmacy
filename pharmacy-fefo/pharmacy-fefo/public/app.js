const mainEl = document.getElementById('mainContent');
const modalRoot = document.getElementById('modalRoot');

// ---------- Auth guard ----------
async function checkAuth() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) { window.location.href = '/login.html'; return null; }
  const user = await res.json();
  document.getElementById('userName').textContent = user.name;
  return user;
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// ---------- Sidebar navigation ----------
document.querySelectorAll('.sidebar button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    renderView(btn.dataset.view);
  });
});

function renderView(view) {
  if (view === 'medicines') renderMedicines();
  else if (view === 'dispense') renderDispense();
  else if (view === 'alerts') renderAlerts();
  else if (view === 'history') renderHistory();
}

// ---------- Medicines view ----------
const medState = { search: '', page: 1, limit: 10, sort: 'name', dir: 'asc' };

async function fetchMedicines() {
  const params = new URLSearchParams({
    search: medState.search, page: medState.page, limit: medState.limit,
    sort: medState.sort, dir: medState.dir,
  });
  const res = await fetch(`/api/medicines?${params}`);
  return res.json();
}

async function renderMedicines() {
  mainEl.innerHTML = `
    <div class="toolbar">
      <input type="text" id="searchInput" placeholder="Search by name, generic name or category..." value="${medState.search}" />
      <button class="btn-primary" id="addMedBtn">+ Add Medicine</button>
    </div>
    <div id="medTableWrap"></div>
  `;
  document.getElementById('addMedBtn').addEventListener('click', openAddMedicineModal);

  let debounceTimer;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      medState.search = e.target.value;
      medState.page = 1;
      loadMedTable();
    }, 300);
  });

  loadMedTable();
}

function sortIndicator(field) {
  if (medState.sort !== field) return '';
  return medState.dir === 'asc' ? ' ▲' : ' ▼';
}

async function loadMedTable() {
  const wrap = document.getElementById('medTableWrap');
  wrap.innerHTML = '<p class="empty-state">Loading...</p>';
  const { data, page, totalPages, total } = await fetchMedicines();

  if (!data.length) {
    wrap.innerHTML = '<p class="empty-state">No medicines found.</p>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="sortable" data-field="name">Name${sortIndicator('name')}</th>
          <th class="sortable" data-field="category">Category${sortIndicator('category')}</th>
          <th>Generic name</th>
          <th>Unit</th>
          <th>In-date stock</th>
          <th>Status</th>
          <th>Batches</th>
        </tr>
      </thead>
      <tbody>
        ${data.map((m) => `
          <tr>
            <td>${escapeHtml(m.name)}</td>
            <td>${escapeHtml(m.category || '-')}</td>
            <td>${escapeHtml(m.generic_name || '-')}</td>
            <td>${escapeHtml(m.unit)}</td>
            <td>${m.in_date_stock}</td>
            <td>${stockBadge(m.in_date_stock, m.reorder_level)}</td>
            <td><button class="btn-secondary" data-batches="${m.id}" data-name="${escapeHtml(m.name)}">View / Add</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="pagination">
      <button id="prevPage" ${page <= 1 ? 'disabled' : ''}>Prev</button>
      <span>Page ${page} of ${totalPages} (${total} medicines)</span>
      <button id="nextPage" ${page >= totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;

  wrap.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.field;
      if (medState.sort === field) medState.dir = medState.dir === 'asc' ? 'desc' : 'asc';
      else { medState.sort = field; medState.dir = 'asc'; }
      loadMedTable();
    });
  });

  document.getElementById('prevPage')?.addEventListener('click', () => { medState.page--; loadMedTable(); });
  document.getElementById('nextPage')?.addEventListener('click', () => { medState.page++; loadMedTable(); });

  wrap.querySelectorAll('[data-batches]').forEach((btn) => {
    btn.addEventListener('click', () => openBatchesModal(btn.dataset.batches, btn.dataset.name));
  });
}

function stockBadge(stock, reorder) {
  if (stock <= 0) return '<span class="badge expired">Out of stock</span>';
  if (stock <= reorder) return '<span class="badge low">Low stock</span>';
  return '<span class="badge ok">In stock</span>';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- Add medicine modal ----------
function openAddMedicineModal() {
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>Add Medicine</h3>
        <form id="addMedForm">
          <input type="text" id="m_name" placeholder="Name (e.g. Paracetamol 500mg)" required />
          <input type="text" id="m_generic" placeholder="Generic name" />
          <input type="text" id="m_category" placeholder="Category" />
          <input type="text" id="m_unit" placeholder="Unit (tablets, bottles...)" value="tablets" />
          <input type="number" id="m_reorder" placeholder="Reorder level" value="10" min="0" />
          <div class="error-msg" id="m_err"></div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" id="cancelBtn">Cancel</button>
            <button type="submit" class="btn-primary">Add</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('addMedForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: document.getElementById('m_name').value,
      generic_name: document.getElementById('m_generic').value,
      category: document.getElementById('m_category').value,
      unit: document.getElementById('m_unit').value,
      reorder_level: Number(document.getElementById('m_reorder').value) || 10,
    };
    const res = await fetch('/api/medicines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { document.getElementById('m_err').textContent = data.error; return; }
    closeModal();
    loadMedTable();
  });
}

function closeModal() { modalRoot.innerHTML = ''; }

// ---------- Batches modal ----------
async function openBatchesModal(medicineId, medicineName) {
  const res = await fetch(`/api/medicines/${medicineId}/batches?limit=50&sort=expiry_date&dir=asc`);
  const { data } = await res.json();

  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal" style="width:520px;">
        <h3>${escapeHtml(medicineName)} — Batches</h3>
        <table>
          <thead><tr><th>Batch</th><th>Expiry</th><th>Qty</th><th></th></tr></thead>
          <tbody>
            ${data.map((b) => `
              <tr>
                <td>${escapeHtml(b.batch_no)}</td>
                <td>${b.expiry_date}</td>
                <td>${b.quantity}</td>
                <td>${b.is_expired ? '<span class="badge expired">Expired</span>' : '<span class="badge ok">In-date</span>'}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="empty-state">No batches yet</td></tr>'}
          </tbody>
        </table>
        <h4>Add new batch</h4>
        <form id="addBatchForm">
          <input type="text" id="b_no" placeholder="Batch number" required />
          <input type="date" id="b_mfg" placeholder="Mfg date" />
          <input type="date" id="b_exp" placeholder="Expiry date" required />
          <input type="number" id="b_qty" placeholder="Quantity" min="0" required />
          <input type="number" id="b_cost" placeholder="Cost price (optional)" min="0" step="0.01" />
          <div class="error-msg" id="b_err"></div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" id="closeBatchBtn">Close</button>
            <button type="submit" class="btn-primary">Add Batch</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.getElementById('closeBatchBtn').addEventListener('click', closeModal);
  document.getElementById('addBatchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      batch_no: document.getElementById('b_no').value,
      mfg_date: document.getElementById('b_mfg').value || null,
      expiry_date: document.getElementById('b_exp').value,
      quantity: Number(document.getElementById('b_qty').value),
      cost_price: Number(document.getElementById('b_cost').value) || 0,
    };
    const res2 = await fetch(`/api/medicines/${medicineId}/batches`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data2 = await res2.json();
    if (!res2.ok) { document.getElementById('b_err').textContent = data2.error; return; }
    closeModal();
    loadMedTable();
    openBatchesModal(medicineId, medicineName);
  });
}

// ---------- Dispense view ----------
async function renderDispense() {
  const { data: medicines } = await (await fetch('/api/medicines?limit=100')).json();
  mainEl.innerHTML = `
    <h2>Dispense (FEFO)</h2>
    <p style="color:#64748b;max-width:560px;">Pick a medicine and a quantity. Stock is deducted from the
    batch expiring soonest first; if that batch runs out, the remainder is taken from the next-soonest batch.</p>
    <form id="dispenseForm" style="max-width:400px;display:flex;flex-direction:column;gap:10px;">
      <select id="d_medicine" required>
        <option value="">Select medicine...</option>
        ${medicines.map((m) => `<option value="${m.id}">${escapeHtml(m.name)} (in-date: ${m.in_date_stock})</option>`).join('')}
      </select>
      <input type="number" id="d_qty" placeholder="Quantity to dispense" min="1" required />
      <div class="error-msg" id="d_err"></div>
      <button type="submit" class="btn-primary">Dispense</button>
    </form>
    <div id="dispenseResult" style="margin-top:20px;"></div>
  `;
  document.getElementById('dispenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const medicine_id = Number(document.getElementById('d_medicine').value);
    const quantity = Number(document.getElementById('d_qty').value);
    const errEl = document.getElementById('d_err');
    errEl.textContent = '';
    const res = await fetch('/api/dispense', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medicine_id, quantity }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }

    document.getElementById('dispenseResult').innerHTML = `
      <div class="card" style="background:#ecfdf5;border-color:#10b981;">
        <h3>Dispensed ${data.quantity_dispensed} of ${escapeHtml(data.medicine_name)}</h3>
        <p>Remaining in-date stock: <strong>${data.remaining_in_date_stock}</strong></p>
        <table>
          <thead><tr><th>Batch</th><th>Expiry</th><th>Qty taken</th></tr></thead>
          <tbody>
            ${data.fefo_breakdown.map((b) => `
              <tr><td>${escapeHtml(b.batch_no)}</td><td>${b.expiry_date}</td><td>${b.quantity_taken}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    renderDispense(); // refresh dropdown stock counts
  });
}

// ---------- Alerts view ----------
async function renderAlerts() {
  mainEl.innerHTML = '<p class="empty-state">Loading alerts...</p>';
  const [expiring, expired, lowStock] = await Promise.all([
    (await fetch('/api/alerts/expiring?days=30')).json(),
    (await fetch('/api/alerts/expired')).json(),
    (await fetch('/api/alerts/low-stock')).json(),
  ]);

  mainEl.innerHTML = `
    <h2>⚠️ Alerts</h2>

    <h3>Expiring within 30 days (${expiring.data.length})</h3>
    <div class="alert-list">
      ${expiring.data.map((b) => `
        <div class="alert-item">
          <strong>${escapeHtml(b.medicine_name)}</strong> — batch ${escapeHtml(b.batch_no)},
          ${b.quantity} units, expires ${b.expiry_date}
        </div>
      `).join('') || '<p class="empty-state">Nothing expiring soon.</p>'}
    </div>

    <h3 style="margin-top:24px;">Already expired, still on shelf (${expired.data.length})</h3>
    <div class="alert-list">
      ${expired.data.map((b) => `
        <div class="alert-item expired">
          <strong>${escapeHtml(b.medicine_name)}</strong> — batch ${escapeHtml(b.batch_no)},
          ${b.quantity} units, expired ${b.expiry_date}
        </div>
      `).join('') || '<p class="empty-state">No expired stock on record.</p>'}
    </div>

    <h3 style="margin-top:24px;">Low stock (${lowStock.data.length})</h3>
    <div class="alert-list">
      ${lowStock.data.map((m) => `
        <div class="alert-item low">
          <strong>${escapeHtml(m.name)}</strong> — in-date stock ${m.in_date_stock}, reorder level ${m.reorder_level}
        </div>
      `).join('') || '<p class="empty-state">Nothing below reorder level.</p>'}
    </div>
  `;
}

// ---------- History view ----------
const histState = { page: 1, limit: 10 };
async function renderHistory() {
  mainEl.innerHTML = '<div id="histWrap"></div>';
  loadHistory();
}
async function loadHistory() {
  const params = new URLSearchParams({ page: histState.page, limit: histState.limit });
  const res = await fetch(`/api/dispense/history?${params}`);
  const { data, page, totalPages, total } = await res.json();
  const wrap = document.getElementById('histWrap');

  wrap.innerHTML = `
    <h2>🧾 Dispense History</h2>
    <table>
      <thead><tr><th>When</th><th>Medicine</th><th>Batch</th><th>Qty</th><th>By</th></tr></thead>
      <tbody>
        ${data.map((d) => `
          <tr>
            <td>${d.dispensed_at}</td>
            <td>${escapeHtml(d.medicine_name)}</td>
            <td>${escapeHtml(d.batch_no)} (exp ${d.expiry_date})</td>
            <td>${d.quantity}</td>
            <td>${escapeHtml(d.dispensed_by_name || '-')}</td>
          </tr>
        `).join('') || '<tr><td colspan="5" class="empty-state">No dispenses yet</td></tr>'}
      </tbody>
    </table>
    <div class="pagination">
      <button id="hPrev" ${page <= 1 ? 'disabled' : ''}>Prev</button>
      <span>Page ${page} of ${totalPages} (${total} entries)</span>
      <button id="hNext" ${page >= totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;
  document.getElementById('hPrev')?.addEventListener('click', () => { histState.page--; loadHistory(); });
  document.getElementById('hNext')?.addEventListener('click', () => { histState.page++; loadHistory(); });
}

// ---------- Init ----------
(async () => {
  const user = await checkAuth();
  if (user) renderMedicines();
})();
