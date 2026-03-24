import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'product_mgmt',
  waitForConnections: true,
  connectionLimit:    3,
  queueLimit:         0,
  timezone:           '+00:00',
});

export const testConnection = async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL pool connected successfully');
    conn.release();
    return true;
  } catch (error) {
    console.error('❌ MySQL pool connection failed:', error.message);
    return false;
  }
};

export const closePool = async () => {
  try {
    await pool.end();
    console.log('🔌 MySQL pool closed');
  } catch (error) {
    console.error('❌ Error closing pool:', error.message);
  }
};