/**
 * @module server
 * @description Servidor principal do NOC Daily Report.
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');

const { pool, testConnection } = require('./db/connection');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ============================================
// Trust proxy (necessário para cookies seguros em produção atrás de reverse proxy)
// ============================================
if (isProduction) {
  app.set('trust proxy', 1);
}

// ============================================
// Helmet (segurança HTTP)
// ============================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdnjs.cloudflare.com',
          'https://ka-f.fontawesome.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
          'https://ka-f.fontawesome.com',
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com',
          'https://cdnjs.cloudflare.com',
          'https://ka-f.fontawesome.com',
        ],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https://ka-f.fontawesome.com'],
      },
    },
  })
);

// ============================================
// CORS
// ============================================
app.use(cors({
  origin: isProduction ? false : true,
  credentials: true,
}));

// ============================================
// Body parsers
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// Sessão com PostgreSQL store
// ============================================
app.use(
  session({
    store: new PgSession({
      pool: pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    name: 'noc.sid',
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    },
  })
);

// ============================================
// Arquivos estáticos
// ============================================
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// Rotas da API
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/reports', requireAuth, reportRoutes);
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);

// ============================================
// Rotas de páginas protegidas
// ============================================

/**
 * GET /
 * Redireciona para login se não autenticado, senão serve index.html.
 */
app.get('/', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login.html');
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * GET /admin
 * Redireciona para login se não autenticado ou não é admin.
 */
app.get('/admin', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login.html');
  }
  if (req.session.userRole !== 'admin') {
    return res.redirect('/');
  }
  return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ============================================
// Auto-seed: Criar tabelas e admin padrão
// ============================================
const fs = require('fs');
const bcrypt = require('bcryptjs');

async function autoSeed() {
  try {
    // 1. Executar schema.sql para criar tabelas
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(schemaSql);
    console.log('✅ Tabelas verificadas/criadas com sucesso.');

    // 2. Criar admin padrão se não existir nenhum usuário
    const result = await pool.query('SELECT COUNT(*) FROM users');
    const userCount = parseInt(result.rows[0].count, 10);

    if (userCount === 0) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO users (username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4)`,
        ['admin', passwordHash, 'Administrador', 'admin']
      );
      console.log('✅ Usuário admin padrão criado (admin / admin123).');
    } else {
      console.log(`ℹ️  ${userCount} usuário(s) encontrado(s). Seed ignorado.`);
    }
  } catch (error) {
    console.error('❌ Erro no auto-seed:', error.message);
  }
}

// ============================================
// Inicialização do servidor
// ============================================
app.listen(PORT, async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       NOC Daily Report - Servidor        ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  🌐 Porta: ${String(PORT).padEnd(29)}║`);
  console.log(`║  📦 Ambiente: ${(isProduction ? 'produção' : 'desenvolvimento').padEnd(27)}║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  await testConnection();
  await autoSeed();

  console.log('');
  console.log('🚀 Servidor pronto para receber requisições.');
});
