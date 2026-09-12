const express = require('express');
const PDFDocument = require('pdfkit');
const { getDb, save } = require('./database');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'pass@word1';

function adminOnly(req, res, next) {
  const auth = req.headers.authorization;
  if (auth !== 'Basic ' + Buffer.from(ADMIN_USER + ':' + ADMIN_PASS).toString('base64')) {
    return res.status(401).json({ error: 'Akses ditolak' });
  }
  next();
}

(async () => {
  await getDb();

  // ===== AUTH =====
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const token = Buffer.from(ADMIN_USER + ':' + ADMIN_PASS).toString('base64');
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: 'Username atau password salah' });
    }
  });

  // ===== DASHBOARD =====
  app.get('/api/dashboard', async (req, res) => {
    const db = await getDb();
    const assetCount = db.exec('SELECT COUNT(*) FROM assets');
    const totalStock = db.exec('SELECT COALESCE(SUM(stock),0) FROM assets');
    const activeRentals = db.exec("SELECT COUNT(*) FROM rentals WHERE status='active'");
    const totalRevenue = db.exec("SELECT COALESCE(SUM(total_cost),0) FROM rentals WHERE status='returned'");
    const totalAllRevenue = db.exec("SELECT COALESCE(SUM(total_cost),0) FROM rentals");
    const rt9Count = db.exec("SELECT COUNT(*) FROM rentals WHERE is_rt9=1");

    res.json({
      total_assets: assetCount[0]?.values[0][0] || 0,
      total_stock: totalStock[0]?.values[0][0] || 0,
      active_rentals: activeRentals[0]?.values[0][0] || 0,
      total_revenue: totalRevenue[0]?.values[0][0] || 0,
      total_all_revenue: totalAllRevenue[0]?.values[0][0] || 0,
      rt9_count: rt9Count[0]?.values[0][0] || 0
    });
  });

  // ===== ASSETS =====

  app.get('/api/assets', async (req, res) => {
    const db = await getDb();
    const rows = db.exec('SELECT * FROM assets ORDER BY id DESC');
    res.json(rows.length ? rows[0].values.map(r => ({
      id: r[0], name: r[1], stock: r[2], price_per_day: r[3], created_at: r[4]
    })) : []);
  });

  app.post('/api/assets', adminOnly, async (req, res) => {
    const { name, stock, price_per_day } = req.body;
    const db = await getDb();
    db.run('INSERT INTO assets (name, stock, price_per_day) VALUES (?, ?, ?)', [name, stock || 0, price_per_day || 0]);
    save();
    res.json({ success: true });
  });

  app.put('/api/assets/:id', adminOnly, async (req, res) => {
    const { name, stock, price_per_day } = req.body;
    const db = await getDb();
    db.run('UPDATE assets SET name=?, stock=?, price_per_day=? WHERE id=?', [name, stock, price_per_day, req.params.id]);
    save();
    res.json({ success: true });
  });

  app.delete('/api/assets/:id', adminOnly, async (req, res) => {
    const db = await getDb();
    db.run('DELETE FROM assets WHERE id=?', [req.params.id]);
    save();
    res.json({ success: true });
  });

  // ===== RENTALS =====

  app.get('/api/rentals', async (req, res) => {
    const db = await getDb();
    const rows = db.exec(`
      SELECT r.*, a.name as asset_name
      FROM rentals r
      LEFT JOIN assets a ON r.asset_id = a.id
      ORDER BY r.id DESC
    `);
    if (!rows.length) return res.json([]);
    res.json(rows[0].values.map(r => ({
      id: r[0], tenant_name: r[1], tenant_phone: r[2], asset_id: r[3],
      quantity: r[4], start_date: r[5], end_date: r[6], total_cost: r[7],
      is_rt9: r[8], status: r[9], created_at: r[10], asset_name: r[11]
    })));
  });

  app.post('/api/rentals', adminOnly, async (req, res) => {
    const { tenant_name, tenant_phone, asset_id, quantity, start_date, end_date, is_rt9, custom_cost } = req.body;
    const db = await getDb();

    const assetRows = db.exec('SELECT price_per_day, stock FROM assets WHERE id=?', [asset_id]);
    if (!assetRows.length) return res.status(400).json({ error: 'Aset tidak ditemukan' });

    const [price, stock] = assetRows[0].values[0];
    let total_cost;

    if (is_rt9) {
      total_cost = parseInt(custom_cost) || 0;
    } else {
      const days = Math.max(1, Math.ceil((new Date(end_date) - new Date(start_date)) / 86400000) + 1);
      total_cost = price * quantity * days;
    }

    if (quantity > stock) return res.status(400).json({ error: 'Stok tidak cukup' });

    db.run('INSERT INTO rentals (tenant_name, tenant_phone, asset_id, quantity, start_date, end_date, total_cost, is_rt9) VALUES (?,?,?,?,?,?,?,?)',
      [tenant_name, tenant_phone || '', asset_id, quantity, start_date, end_date, total_cost, is_rt9 ? 1 : 0]);
    db.run('UPDATE assets SET stock = stock - ? WHERE id = ?', [quantity, asset_id]);
    save();
    res.json({ success: true, total_cost });
  });

  app.put('/api/rentals/:id/return', adminOnly, async (req, res) => {
    const db = await getDb();
    const rows = db.exec('SELECT asset_id, quantity, status FROM rentals WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(400).json({ error: 'Sewa tidak ditemukan' });

    const [asset_id, quantity, status] = rows[0].values[0];
    if (status === 'returned') return res.status(400).json({ error: 'Sudah dikembalikan' });

    db.run("UPDATE rentals SET status='returned' WHERE id=?", [req.params.id]);
    db.run('UPDATE assets SET stock = stock + ? WHERE id = ?', [quantity, asset_id]);
    save();
    res.json({ success: true });
  });

  app.put('/api/rentals/:id/cost', adminOnly, async (req, res) => {
    const { total_cost } = req.body;
    const db = await getDb();
    db.run('UPDATE rentals SET total_cost=? WHERE id=?', [total_cost, req.params.id]);
    save();
    res.json({ success: true });
  });

  app.delete('/api/rentals/:id', adminOnly, async (req, res) => {
    const db = await getDb();
    const rows = db.exec('SELECT asset_id, quantity, status FROM rentals WHERE id=?', [req.params.id]);
    if (rows.length && rows[0].values[0][2] === 'active') {
      db.run('UPDATE assets SET stock = stock + ? WHERE id = ?', [rows[0].values[0][1], rows[0].values[0][0]]);
    }
    db.run('DELETE FROM rentals WHERE id=?', [req.params.id]);
    save();
    res.json({ success: true });
  });

  // ===== PDF REPORT =====

  app.get('/api/report/pdf', async (req, res) => {
    const db = await getDb();
    const { start, end } = req.query;

    let query = `
      SELECT r.tenant_name, r.tenant_phone, a.name as asset_name, r.quantity,
             r.start_date, r.end_date, r.total_cost, r.status, r.is_rt9
      FROM rentals r LEFT JOIN assets a ON r.asset_id = a.id
    `;
    const params = [];
    if (start && end) {
      query += ' WHERE r.start_date >= ? AND r.start_date <= ?';
      params.push(start, end);
    }
    query += ' ORDER BY r.start_date DESC';

    const rows = db.exec(query, params);
    const data = rows.length ? rows[0].values : [];

    const totalAll = data.reduce((s, r) => s + (r[6] || 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="laporan-sewa-rt.pdf"');
    doc.pipe(res);

    doc.fontSize(16).text('Laporan Sewaan RT', { align: 'center' });
    doc.moveDown(0.3);
    if (start && end) {
      doc.fontSize(10).text(`Periode: ${start} s/d ${end}`, { align: 'center' });
    }
    doc.moveDown(1);

    const headers = ['Penyewa', 'Aset', 'Qty', 'Tgl Sewa', 'Tgl Kembali', 'Biaya', 'Ket', 'Status'];
    const widths = [90, 70, 30, 65, 65, 70, 40, 50];

    let y = doc.y;
    let x = 40;
    doc.fontSize(9).font('Helvetica-Bold');
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: widths[i], align: 'left' });
      x += widths[i];
    });
    y += 18;
    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 5;

    doc.font('Helvetica');
    data.forEach(row => {
      if (y > 750) {
        doc.addPage();
        y = 40;
      }
      x = 40;
      const vals = [
        row[0] || '', row[2] || '', String(row[3] || ''),
        row[4] || '', row[5] || '',
        `Rp ${(row[6] || 0).toLocaleString('id-ID')}`,
        row[8] ? 'RT9' : '-',
        row[7] === 'active' ? 'Aktif' : 'Selesai'
      ];
      vals.forEach((v, i) => {
        doc.fontSize(8).text(v, x, y, { width: widths[i], align: 'left' });
        x += widths[i];
      });
      y += 18;
    });

    y += 10;
    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 8;
    doc.fontSize(10).font('Helvetica-Bold').text(`Total Pendapatan: Rp ${totalAll.toLocaleString('id-ID')}`, 40, y);

    doc.end();
  });

  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
  });
})();
