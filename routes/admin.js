/**
 * @module routes/admin
 * @description Rotas administrativas (gerenciamento de relatórios e usuários).
 * Todas as rotas exigem autenticação + papel de admin (aplicados no server.js).
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/connection');

const router = express.Router();

const SALT_ROUNDS = 10;

// ============================================
// Rotas de Relatórios (Admin)
// ============================================

/**
 * GET /api/admin/reports
 * Lista TODOS os relatórios com informações do usuário.
 */
router.get('/reports', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.report_date, r.shift, r.overall_status, r.activities,
              r.created_at, r.updated_at, r.user_id,
              u.username, u.full_name
       FROM reports r
       JOIN users u ON r.user_id = u.id
       ORDER BY r.report_date DESC, r.created_at DESC`
    );

    return res.json({ reports: result.rows });
  } catch (error) {
    console.error('❌ Erro ao listar relatórios (admin):', error.message);
    return res.status(500).json({
      error: 'Erro ao buscar relatórios.',
    });
  }
});

/**
 * GET /api/admin/reports/:id
 * Retorna qualquer relatório específico com informações do usuário.
 */
router.get('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT r.id, r.report_date, r.shift, r.overall_status, r.activities,
              r.created_at, r.updated_at, r.user_id,
              u.username, u.full_name
       FROM reports r
       JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Relatório não encontrado.',
      });
    }

    return res.json({ report: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao buscar relatório (admin):', error.message);
    return res.status(500).json({
      error: 'Erro ao buscar relatório.',
    });
  }
});

// ============================================
// Rotas de Usuários (Admin)
// ============================================

/**
 * GET /api/admin/users
 * Lista todos os usuários (sem expor o hash da senha).
 */
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, role, created_at
       FROM users
       ORDER BY created_at ASC`
    );

    return res.json({ users: result.rows });
  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error.message);
    return res.status(500).json({
      error: 'Erro ao buscar usuários.',
    });
  }
});

/**
 * POST /api/admin/users
 * Cria um novo usuário.
 */
router.post('/users', async (req, res) => {
  try {
    const { username, password, full_name, role } = req.body;

    // Validação de entrada
    if (!username || !password || !full_name) {
      return res.status(400).json({
        error: 'Usuário, senha e nome completo são obrigatórios.',
      });
    }

    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({
        error: 'O nome de usuário deve ter entre 3 e 50 caracteres.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'A senha deve ter pelo menos 6 caracteres.',
      });
    }

    const validRoles = ['admin', 'analyst'];
    const userRole = validRoles.includes(role) ? role : 'analyst';

    // Verificar se username já existe
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Este nome de usuário já está em uso.',
      });
    }

    // Hash da senha e inserção
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, full_name, role, created_at`,
      [username, passwordHash, full_name, userRole]
    );

    console.log(
      `👤 Usuário criado: ${username} (${userRole}) por ${req.session.userName}`
    );

    return res.status(201).json({
      message: 'Usuário criado com sucesso.',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error.message);
    return res.status(500).json({
      error: 'Erro ao criar usuário.',
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Remove um usuário.
 * Não permite excluir a si mesmo ou o último administrador.
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);

    if (isNaN(targetId)) {
      return res.status(400).json({
        error: 'ID de usuário inválido.',
      });
    }

    // Impedir exclusão de si mesmo
    if (targetId === req.session.userId) {
      return res.status(400).json({
        error: 'Você não pode excluir sua própria conta.',
      });
    }

    // Verificar se o usuário alvo existe e qual seu papel
    const targetUser = await pool.query(
      'SELECT id, role, username FROM users WHERE id = $1',
      [targetId]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({
        error: 'Usuário não encontrado.',
      });
    }

    // Se for admin, verificar se não é o último
    if (targetUser.rows[0].role === 'admin') {
      const adminCount = await pool.query(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'"
      );

      if (parseInt(adminCount.rows[0].count, 10) <= 1) {
        return res.status(400).json({
          error:
            'Não é possível excluir o último administrador do sistema.',
        });
      }
    }

    await pool.query('DELETE FROM users WHERE id = $1', [targetId]);

    console.log(
      `🗑️  Usuário removido: ${targetUser.rows[0].username} por ${req.session.userName}`
    );

    return res.json({
      message: 'Usuário removido com sucesso.',
    });
  } catch (error) {
    console.error('❌ Erro ao remover usuário:', error.message);
    return res.status(500).json({
      error: 'Erro ao remover usuário.',
    });
  }
});

module.exports = router;
