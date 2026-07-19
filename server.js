import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from 'redis';
import pkg from 'pg';
const { Pool } = pkg;

// Import routes
import authRoutes from './routes/authRoutes.js';
import adRoutes from './routes/adRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// DATABASE CONNECTION - PostgreSQL (AWS RDS)
// ============================================================
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL error:', err);
});

// ============================================================
// REDIS CONNECTION (For OTP & Sessions)
// ============================================================
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD,
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

await redisClient.connect();

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { msg: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// ============================================================
// DATABASE HELPERS
// ============================================================
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn('Slow query:', { text, duration });
    }
    return res;
  } catch (err) {
    console.error('Query error:', { text, error: err.message });
    throw err;
  }
};

export const getRedis = () => redisClient;

// ============================================================
// ROUTES
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);

// ============================================================
// ERROR HANDLING
// ============================================================
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({ msg: 'Database connection error' });
  }
  
  res.status(err.status || 500).json({
    msg: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================================
// START SERVER
// ============================================================
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await redisClient.quit();
  await pool.end();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
