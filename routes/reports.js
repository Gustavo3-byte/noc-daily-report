/**
 * @module routes/reports
 * @description Rotas CRUD de relatórios do usuário autenticado.
 * Todas as rotas exigem autenticação (aplicada no server.js).
 */

const express = require('express');
const { pool } = require('../db/connection');

const router = express.Router();

/**
 * GET /api/reports
 * Lista todos os relatórios do usuário logado.
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, report_date, shift, overall_status, activities, created_at, updated_at
       FROM reports
       WHERE user_id = $1
       ORDER BY report_date DESC, created_at DESC`,
      [req.session.userId]
    );

    return res.json({ reports: result.rows });
  } catch (error) {
    console.error('❌ Erro ao listar relatórios:', error.message);
    return res.status(500).json({
      error: 'Erro ao buscar relatórios.',
    });
  }
});

/**
 * GET /api/reports/:id
 * Retorna um relatório específico (deve pertencer ao usuário).
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, report_date, shift, overall_status, activities, created_at, updated_at
       FROM reports
       WHERE id = $1 AND user_id = $2`,
      [id, req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Relatório não encontrado.',
      });
    }

    return res.json({ report: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao buscar relatório:', error.message);
    return res.status(500).json({
      error: 'Erro ao buscar relatório.',
    });
  }
});

/**
 * POST /api/reports
 * Cria ou atualiza um relatório.
 * Se já existir um relatório para o mesmo usuário+data+turno, atualiza.
 * Caso contrário, cria um novo.
 */
router.post('/', async (req, res) => {
  try {
    const { report_date, shift, overall_status, activities } = req.body;
    const userId = req.session.userId;

    // Validação básica
    if (!report_date) {
      return res.status(400).json({
        error: 'A data do relatório é obrigatória.',
      });
    }

    // Verificar se já existe relatório para este usuário+data+turno
    const existing = await pool.query(
      `SELECT id FROM reports
       WHERE user_id = $1 AND report_date = $2 AND shift = $3`,
      [userId, report_date, shift || null]
    );

    let result;

    if (existing.rows.length > 0) {
      // Atualizar relatório existente
      result = await pool.query(
        `UPDATE reports
         SET overall_status = $1,
             activities = $2,
             shift = $3,
             updated_at = NOW()
         WHERE id = $4 AND user_id = $5
         RETURNING id, report_date, shift, overall_status, activities, created_at, updated_at`,
        [
          overall_status || 'normal',
          JSON.stringify(activities || []),
          shift || null,
          existing.rows[0].id,
          userId,
        ]
      );

      console.log(
        `📝 Relatório atualizado: ID ${result.rows[0].id} por ${req.session.userName}`
      );

      return res.json({
        message: 'Relatório atualizado com sucesso.',
        report: result.rows[0],
      });
    } else {
      // Criar novo relatório
      result = await pool.query(
        `INSERT INTO reports (user_id, report_date, shift, overall_status, activities)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, report_date, shift, overall_status, activities, created_at, updated_at`,
        [
          userId,
          report_date,
          shift || null,
          overall_status || 'normal',
          JSON.stringify(activities || []),
        ]
      );

      console.log(
        `📝 Relatório criado: ID ${result.rows[0].id} por ${req.session.userName}`
      );

      return res.status(201).json({
        message: 'Relatório criado com sucesso.',
        report: result.rows[0],
      });
    }
  } catch (error) {
    console.error('❌ Erro ao salvar relatório:', error.message);
    return res.status(500).json({
      error: 'Erro ao salvar relatório.',
    });
  }
});

/**
 * DELETE /api/reports/:id
 * Remove um relatório (deve pertencer ao usuário).
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM reports WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Relatório não encontrado.',
      });
    }

    console.log(
      `🗑️  Relatório removido: ID ${id} por ${req.session.userName}`
    );

    return res.json({
      message: 'Relatório removido com sucesso.',
    });
  } catch (error) {
    console.error('❌ Erro ao remover relatório:', error.message);
    return res.status(500).json({
      error: 'Erro ao remover relatório.',
    });
  }
});

module.exports = router;
