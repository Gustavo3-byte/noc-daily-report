/**
 * @module db/seed
 * @description Script de inicialização do banco de dados.
 * Cria as tabelas e o usuário administrador padrão.
 *
 * Uso: node db/seed.js [username] [password] [full_name]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./connection');

const SALT_ROUNDS = 10;

async function seed() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';
  const fullName = process.argv[4] || 'Administrador';
  const role = 'admin';

  console.log('🔧 Iniciando configuração do banco de dados...\n');

  try {
    // 1. Executar schema.sql para criar as tabelas
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    await pool.query(schemaSql);
    console.log('✅ Tabelas criadas com sucesso.');

    // 2. Verificar se o usuário admin já existe
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existing.rows.length > 0) {
      console.log(
        `⚠️  Usuário "${username}" já existe. Pulando criação do admin.`
      );
    } else {
      // 3. Criar o usuário administrador
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      await pool.query(
        `INSERT INTO users (username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4)`,
        [username, passwordHash, fullName, role]
      );

      console.log(`✅ Usuário administrador criado com sucesso:`);
      console.log(`   👤 Usuário: ${username}`);
      console.log(`   🔑 Senha: ${password}`);
      console.log(`   📛 Nome: ${fullName}`);
      console.log(`   🛡️  Papel: ${role}`);
    }

    console.log('\n🎉 Banco de dados configurado com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro durante a configuração do banco de dados:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
