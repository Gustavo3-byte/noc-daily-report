/**
 * @module middleware/auth
 * @description Middlewares de autenticação e autorização.
 */

/**
 * Middleware que exige autenticação.
 * Verifica se existe um userId na sessão do usuário.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: 'Não autorizado. Faça login para continuar.',
    });
  }
  next();
}

/**
 * Middleware que exige papel de administrador.
 * Deve ser usado após requireAuth.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAdmin(req, res, next) {
  if (req.session.userRole !== 'admin') {
    return res.status(403).json({
      error: 'Acesso negado. Permissão de administrador necessária.',
    });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
