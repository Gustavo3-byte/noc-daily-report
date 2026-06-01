require('dotenv').config();
const { pool } = require('./db/connection');

async function checkUsers() {
  try {
    const result = await pool.query('SELECT id, username, full_name, role FROM users');
    console.log('--- USUÁRIOS NO BANCO DE DADOS NEON ---');
    if (result.rows.length === 0) {
      console.log('Nenhum usuário encontrado na tabela.');
    } else {
      console.table(result.rows);
    }
  } catch (err) {
    console.error('Erro ao consultar:', err.message);
  } finally {
    await pool.end();
  }
}

checkUsers();
