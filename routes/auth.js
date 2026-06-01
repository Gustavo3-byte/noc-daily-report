/**
 * @module routes/auth
 * @description Rotas de autenticação (login, logout, sessão atual).
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/connection');

const router = express.Router();

/**
 * POST /api/auth/login
 * Autentica o usuário com username e password.
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validação de entrada
    if (!username || !password) {
      return res.status(400).json({
        error: 'Usuário e senha são obrigatórios.',
      });
    }

    // Buscar usuário no banco
    const result = await pool.query(
      'SELECT id, username, password_hash, full_name, role FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Usuário ou senha inválidos.',
      });
    }

    const user = result.rows[0];

    // Verificar senha
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        error: 'Usuário ou senha inválidos.',
      });
    }

    // Criar sessão
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.username;
    req.session.userFullName = user.full_name;

    console.log(`🔑 Login: ${user.username} (${user.role})`);

    return res.json({
      message: 'Login realizado com sucesso.',
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('❌ Erro no login:', error.message);
    return res.status(500).json({
      error: 'Erro interno do servidor.',
    });
  }
});

/**
 * POST /api/auth/logout
 * Encerra a sessão do usuário.
 */
router.post('/logout', (req, res) => {
  const userName = req.session.userName || 'desconhecido';

  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Erro ao encerrar sessão:', err.message);
      return res.status(500).json({
        error: 'Erro ao encerrar sessão.',
      });
    }

    res.clearCookie('noc.sid');
    console.log(`🔓 Logout: ${userName}`);

    return res.json({
      message: 'Logout realizado com sucesso.',
    });
  });
});

/**
 * GET /api/auth/me
 * Retorna os dados do usuário autenticado na sessão atual.
 */
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: 'Não autenticado.',
    });
  }

  return res.json({
    user: {
      id: req.session.userId,
      username: req.session.userName,
      fullName: req.session.userFullName,
      role: req.session.userRole,
    },
  });
});

module.exports = router;
