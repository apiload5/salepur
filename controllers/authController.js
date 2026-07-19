// 
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, getRedis } from '../server.js';
import { sendEmail, generateOTP } from '../utils/email.js';
import { validationResult } from 'express-validator';

// ============================================================
// REGISTER
// ============================================================
export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, phone, city } = req.body;

    // Check if user exists
    const existing = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const result = await query(
      `INSERT INTO users (id, name, email, password, phone, city, role, email_verified)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, phone, city, role, email_verified`,
      [name, email, hashedPassword, phone, city, 'user', false]
    );

    const user = result.rows[0];

    // Generate OTP
    const otp = generateOTP();
    const redis = getRedis();
    await redis.setEx(`otp:${email}`, 600, otp); // 10 minutes

    // Send OTP email
    await sendEmail({
      to: email,
      subject: 'Welcome to SalePur! Verify Your Email',
      html: `
        <h1>Welcome to SalePur!</h1>
        <p>Hi ${name},</p>
        <p>Your verification code is: <strong>${otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>Enter this code to verify your email address.</p>
      `
    });

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user,
      message: 'Registration successful! Please check your email for OTP.'
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// LOGIN
// ============================================================
export const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Get user
    const result = await query(
      `SELECT id, name, email, password, phone, city, role, email_verified, is_active
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ msg: 'Account is deactivated' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Log failed attempt
      await query(
        `INSERT INTO login_attempts (user_id, success, ip, user_agent)
         VALUES ($1, $2, $3, $4)`,
        [user.id, false, req.ip, req.headers['user-agent']]
      );
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Log success
    await query(
      `INSERT INTO login_attempts (user_id, success, ip, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [user.id, true, req.ip, req.headers['user-agent']]
    );

    // Update last login
    await query(
      `UPDATE users SET last_login = NOW() WHERE id = $1`,
      [user.id]
    );

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );

    // Store refresh token in Redis
    const redis = getRedis();
    await redis.setEx(`refresh:${user.id}`, 30 * 24 * 60 * 60, refreshToken);

    // Remove password from response
    delete user.password;

    res.json({
      success: true,
      token,
      refreshToken,
      user
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// VERIFY EMAIL (OTP)
// ============================================================
export const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Get OTP from Redis
    const redis = getRedis();
    const storedOtp = await redis.get(`otp:${email}`);

    if (!storedOtp) {
      return res.status(400).json({ msg: 'OTP expired. Request a new one.' });
    }

    if (storedOtp !== otp) {
      return res.status(400).json({ msg: 'Invalid OTP' });
    }

    // Verify user
    await query(
      `UPDATE users SET email_verified = true WHERE email = $1`,
      [email]
    );

    // Delete OTP from Redis
    await redis.del(`otp:${email}`);

    res.json({
      success: true,
      message: 'Email verified successfully!'
    });

  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// RESEND OTP
// ============================================================
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const result = await query(
      'SELECT id, name FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const user = result.rows[0];

    // Generate new OTP
    const otp = generateOTP();
    const redis = getRedis();
    await redis.setEx(`otp:${email}`, 600, otp);

    // Send OTP email
    await sendEmail({
      to: email,
      subject: 'SalePur - Resend Verification Code',
      html: `
        <h1>Verify Your Email</h1>
        <p>Hi ${user.name},</p>
        <p>Your new verification code is: <strong>${otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
      `
    });

    res.json({
      success: true,
      message: 'New OTP sent to your email!'
    });

  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// FORGOT PASSWORD
// ============================================================
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await query(
      'SELECT id, name FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Store in Redis
    const redis = getRedis();
    await redis.setEx(`reset:${user.id}`, 3600, resetToken);

    // Send reset email
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: email,
      subject: 'Reset Your SalePur Password',
      html: `
        <h1>Reset Your Password</h1>
        <p>Hi ${user.name},</p>
        <p>Click the link below to reset your password:</p>
        <a href="${resetLink}" style="background:#dc2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });

    res.json({
      success: true,
      message: 'Password reset link sent to your email!'
    });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// RESET PASSWORD
// ============================================================
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ msg: 'Invalid or expired token' });
    }

    // Check if token exists in Redis
    const redis = getRedis();
    const storedToken = await redis.get(`reset:${decoded.id}`);

    if (!storedToken || storedToken !== token) {
      return res.status(400).json({ msg: 'Invalid or expired token' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await query(
      `UPDATE users SET password = $1 WHERE id = $2`,
      [hashedPassword, decoded.id]
    );

    // Delete reset token from Redis
    await redis.del(`reset:${decoded.id}`);

    res.json({
      success: true,
      message: 'Password reset successfully!'
    });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// REFRESH TOKEN
// ============================================================
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ msg: 'No refresh token' });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ msg: 'Invalid refresh token' });
    }

    // Check if token exists in Redis
    const redis = getRedis();
    const storedToken = await redis.get(`refresh:${decoded.id}`);

    if (!storedToken || storedToken !== refreshToken) {
      return res.status(401).json({ msg: 'Invalid refresh token' });
    }

    // Get user
    const result = await query(
      'SELECT id, email, role FROM users WHERE id = $1 AND is_active = true',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ msg: 'User not found' });
    }

    const user = result.rows[0];

    // Generate new token
    const newToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token: newToken
    });

  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// LOGOUT
// ============================================================
export const logout = async (req, res) => {
  try {
    const token = req.header('x-auth-token');
    const redis = getRedis();

    // Blacklist token
    await redis.setEx(`blacklist:${token}`, 7 * 24 * 60 * 60, 'blacklisted');

    // Remove refresh token
    await redis.del(`refresh:${req.user.id}`);

    res.json({
      success: true,
      message: 'Logged out successfully!'
    });

  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// GET CURRENT USER
// ============================================================
export const getMe = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, phone, city, role, email_verified, 
              is_active, created_at, last_login
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};
