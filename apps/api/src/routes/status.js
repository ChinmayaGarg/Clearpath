/**
 * Live status board routes
 *
 * GET /api/status/:token         Get live book for today (token-protected)
 * GET /api/status/:token/board   Full HTML board (self-contained, no React)
 * POST /api/status/token         Generate a board token (admin only)
 */
import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { tenantQuery } from '../db/tenantPool.js';
import pool            from '../db/pool.js';
import crypto          from 'crypto';

const router = Router();

// ── POST /api/status/token — generate a shareable board token ────────────────
router.post('/token',
  requireAuth,
  requireRole('institution_admin', 'lead'),
  async (req, res, next) => {
    try {
      const token      = crypto.randomBytes(24).toString('hex');
      const schema     = req.tenantSchema;
      const institutionId = req.institutionId;

      // Store token in institution config
      await pool.query(
        `UPDATE public.institution
         SET config = COALESCE(config, '{}'::jsonb) ||
           jsonb_build_object('boardToken', $1::text,
                              'boardTokenCreatedAt', NOW()::text)
         WHERE id = $2`,
        [token, institutionId]
      );

      const boardUrl = `${req.headers.origin ?? ''}/board/${token}`;
      res.json({ ok: true, token, boardUrl });
    } catch (err) { next(err); }
  }
);

// ── Token validation middleware ───────────────────────────────────────────────
async function validateBoardToken(req, res, next) {
  try {
    const { token } = req.params;
    if (!token) return res.status(401).json({ ok: false, error: 'Token required' });

    const result = await pool.query(
      `SELECT id, slug, name, email_sender_name,
              config->>'boardToken' AS board_token
       FROM public.institution
       WHERE config->>'boardToken' = $1
         AND is_active = TRUE`,
      [token]
    );

    if (!result.rows.length) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    const inst = result.rows[0];
    req.tenantSchema = inst.slug;
    req.institutionId = inst.id;
    req.institutionName = inst.email_sender_name ?? inst.name;
    next();
  } catch (err) { next(err); }
}

// ── GET /api/status/:token — JSON data for the board ─────────────────────────
router.get('/:token', validateBoardToken, async (req, res, next) => {
  try {
    const date = new Date().toISOString().split('T')[0];
    const data = await getBoardData(req.tenantSchema, date);
    res.json({ ok: true, date, institution: req.institutionName, ...data });
  } catch (err) { next(err); }
});

// ── GET /api/status/:token/board — self-contained HTML board ─────────────────
router.get('/:token/board', validateBoardToken, async (req, res, next) => {
  try {
    const date = new Date().toISOString().split('T')[0];
    const data = await getBoardData(req.tenantSchema, date);
    const html = renderBoard({
      date,
      institution: req.institutionName,
      token: req.params.token,
      ...data,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

export default router;

// ── Data fetcher ──────────────────────────────────────────────────────────────
async function getBoardData(schema, date) {
  const dayResult = await tenantQuery(schema,
    `SELECT id FROM exam_day WHERE date = $1`, [date]
  );

  if (!dayResult.rows.length) {
    return { exams: [], stats: { total: 0, pending: 0, emailed: 0,
      received: 0, written: 0, pickedUp: 0 } };
  }

  const examDayId = dayResult.rows[0].id;

  const examsResult = await tenantQuery(schema,
    `SELECT
       e.id, e.course_code, e.cross_listed_code,
       e.status, e.rwg_flag, e.exam_type,
       COALESCE(
         json_agg(
           json_build_object(
             'room', er.room_name,
             'time', er.start_time,
             'count', er.student_count
           ) ORDER BY er.start_time
         ) FILTER (WHERE er.id IS NOT NULL),
         '[]'
       ) AS rooms,
       MIN(er.start_time) AS earliest_start
     FROM exam e
     LEFT JOIN exam_room er ON er.exam_id = e.id
     WHERE e.exam_day_id = $1
       AND e.status NOT IN ('cancelled', 'dropped')
     GROUP BY e.id
     ORDER BY MIN(er.start_time), e.course_code`,
    [examDayId]
  );

  const exams = examsResult.rows;
  const stats = {
    total:    exams.length,
    pending:  exams.filter(e => e.status === 'pending').length,
    emailed:  exams.filter(e => e.status === 'emailed').length,
    received: exams.filter(e => e.status === 'received').length,
    written:  exams.filter(e => e.status === 'written').length,
    pickedUp: exams.filter(e => e.status === 'picked_up').length,
  };

  return { exams, stats };
}

// ── HTML board renderer ───────────────────────────────────────────────────────
function renderBoard({ date, institution, token, exams, stats }) {
  const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  function fmt(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ap}`;
  }

  const statusMeta = {
    pending:   { label: 'Pending',   bg: '#f3f4f6', text: '#4b5563', bar: '#d1d5db' },
    emailed:   { label: 'Emailed',   bg: '#dbeafe', text: '#1d4ed8', bar: '#93c5fd' },
    received:  { label: 'Received',  bg: '#fef9c3', text: '#a16207', bar: '#fde047' },
    written:   { label: 'Written',   bg: '#ffedd5', text: '#c2410c', bar: '#fb923c' },
    picked_up: { label: 'Picked up', bg: '#dcfce7', text: '#15803d', bar: '#4ade80' },
  };

  const examCards = exams.map(e => {
    const m = statusMeta[e.status] ?? statusMeta.pending;
    const rooms = e.rooms.map(r =>
      `<span style="background:#ede9fe;color:#5b21b6;padding:2px 7px;
                    border-radius:4px;font-size:13px;white-space:nowrap;">
         ${r.room} ${fmt(r.time)} (${r.count})
       </span>`
    ).join(' ');

    return `
    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;
                padding:14px 16px;position:relative;overflow:hidden;">
      <!-- Status colour bar on left -->
      <div style="position:absolute;left:0;top:0;bottom:0;width:4px;
                  background:${m.bar};border-radius:12px 0 0 12px;"></div>
      <div style="padding-left:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <strong style="font-size:16px;color:#111;">${e.course_code}</strong>
            ${e.cross_listed_code
              ? `<span style="font-size:12px;color:#9ca3af;">/ ${e.cross_listed_code}</span>` : ''}
            ${e.rwg_flag
              ? `<span style="background:#fee2e2;color:#991b1b;font-size:11px;
                              font-weight:700;padding:1px 6px;border-radius:4px;">RWG</span>` : ''}
            ${e.exam_type !== 'paper'
              ? `<span style="background:#e0e7ff;color:#3730a3;font-size:11px;
                              padding:1px 6px;border-radius:4px;text-transform:capitalize;">
                   ${e.exam_type}</span>` : ''}
          </div>
          <span style="background:${m.bg};color:${m.text};font-size:12px;font-weight:600;
                       padding:3px 10px;border-radius:20px;">${m.label}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${rooms}</div>
      </div>
    </div>`;
  }).join('');

  const progressPct = stats.total > 0
    ? Math.round((stats.pickedUp / stats.total) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Live Board — ${dateStr}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system,'Helvetica Neue',sans-serif;
           background: #f8f7ff; color: #111; min-height: 100vh; }
    .header { background: #26215C; color: white; padding: 16px 24px;
              display: flex; justify-content: space-between; align-items: center;
              position: sticky; top: 0; z-index: 10; }
    .header h1 { font-size: 20px; font-weight: 700; }
    .header p  { font-size: 13px; opacity: 0.7; margin-top: 2px; }
    .clock { font-size: 28px; font-weight: 300; font-variant-numeric: tabular-nums; }
    .stats { display: flex; gap: 12px; padding: 16px 24px; flex-wrap: wrap; }
    .stat { background: white; border: 1px solid #e5e7eb; border-radius: 10px;
            padding: 10px 16px; text-align: center; min-width: 90px; }
    .stat-n { font-size: 26px; font-weight: 700; color: #26215C; }
    .stat-l { font-size: 11px; color: #6b7280; text-transform: uppercase;
              letter-spacing: .05em; margin-top: 1px; }
    .progress-bar { height: 6px; background: #e5e7eb; border-radius: 3px;
                    margin: 0 24px 16px; }
    .progress-fill { height: 100%; border-radius: 3px; background: #22c55e;
                     transition: width 1s ease; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px,1fr));
            gap: 10px; padding: 0 24px 24px; }
    .pulse { animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
    .refresh-indicator { position: fixed; bottom: 12px; right: 16px;
                         font-size: 11px; color: #9ca3af; }
  </style>
</head>
<body>

<div class="header">
  <div>
    <h1>${institution}</h1>
    <p>${dateStr}</p>
  </div>
  <div class="clock" id="clock">—</div>
</div>

<div class="stats">
  <div class="stat">
    <div class="stat-n">${stats.total}</div>
    <div class="stat-l">Exams</div>
  </div>
  <div class="stat" style="border-color:#d1d5db;">
    <div class="stat-n" style="color:#4b5563;">${stats.pending}</div>
    <div class="stat-l">Pending</div>
  </div>
  <div class="stat" style="border-color:#93c5fd;">
    <div class="stat-n" style="color:#1d4ed8;">${stats.emailed}</div>
    <div class="stat-l">Emailed</div>
  </div>
  <div class="stat" style="border-color:#fde047;">
    <div class="stat-n" style="color:#a16207;">${stats.received}</div>
    <div class="stat-l">Received</div>
  </div>
  <div class="stat" style="border-color:#fb923c;">
    <div class="stat-n" style="color:#c2410c;">${stats.written}</div>
    <div class="stat-l">Written</div>
  </div>
  <div class="stat" style="border-color:#4ade80;">
    <div class="stat-n" style="color:#15803d;">${stats.pickedUp}</div>
    <div class="stat-l">Done</div>
  </div>
</div>

<div class="progress-bar">
  <div class="progress-fill" style="width:${progressPct}%"></div>
</div>

<div class="grid" id="grid">
  ${examCards || `
    <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#9ca3af;">
      <div style="font-size:48px;margin-bottom:12px;">📋</div>
      <div style="font-size:18px;">No exams scheduled for today</div>
    </div>`}
</div>

<div class="refresh-indicator" id="countdown">
  Refreshes in 30s
</div>

<script>
  // Live clock
  function tick() {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    const ap = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    document.getElementById('clock').textContent =
      hr + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + ' ' + ap;
  }
  tick();
  setInterval(tick, 1000);

  // Auto-refresh countdown + reload
  let secs = 30;
  const cd = document.getElementById('countdown');
  setInterval(() => {
    secs--;
    if (secs <= 0) {
      window.location.reload();
    } else {
      cd.textContent = 'Refreshes in ' + secs + 's';
    }
  }, 1000);
</script>
</body>
</html>`;
}
