// seed.js
import { query } from './server.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function seedAdmin() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@salepur.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';

    // Check if admin exists
    const existing = await query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );

    if (existing.rows.length > 0) {
      console.log('✅ Admin already exists');
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    // Create admin
    await query(
      `INSERT INTO users (id, name, email, password, phone, city, role, email_verified, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      ['Super Admin', adminEmail, hashedPassword, '0300-0000000', 'Karachi', 'super_admin', true, true]
    );

    console.log('✅ Admin created successfully!');
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);

  } catch (err) {
    console.error('❌ Error creating admin:', err);
  }
}

seedAdmin().then(() => process.exit(0));
