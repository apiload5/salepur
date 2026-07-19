// middleware/auth.js
import jwt from 'jsonwebtoken';
import { getRedis } from '../server.js';

export const auth = async (req, res, next) => {
  try {
    const token = req.header('x-auth-token');
    
    if (!token) {
      return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Check if token is blacklisted
    const redis = getRedis();
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ msg: 'Token revoked' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ msg: 'Token expired' });
    }
    res.status(401).json({ msg: 'Invalid token' });
  }
};

export const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ msg: 'Admin access required' });
      }
      next();
    });
  } catch (err) {
    res.status(403).json({ msg: 'Access denied' });
  }
};
