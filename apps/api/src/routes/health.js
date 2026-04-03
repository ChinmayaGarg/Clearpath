import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, status: 'unhealthy' });
  }
});

export default router;
