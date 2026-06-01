/**
 * @module db/connection
 * @description Configuração da conexão com o banco de dados PostgreSQL.
 */

require('dotenv').config();
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

/**
 * Testa a conexão com o banco de dados executando uma query simples.
 * @returns {Promise<boolean>} true se a conexão foi bem-sucedida.
 */
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    console.log(
      `✅ Conexão com o banco de dados estabelecida: ${result.rows[0].current_time}`
    );
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar com o banco de dados:', error.message);
    return false;
  }
}

module.exports = { pool, testConnection };
