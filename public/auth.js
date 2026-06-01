/* ==========================================================================
   AUTH.JS - Autenticação e Verificação de Sessão
   ========================================================================== */

/**
 * Verifica se o usuário está autenticado.
 * Retorna o objeto user se autenticado, ou null se não.
 */
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json();
            return data.user || null;
        }
        return null;
    } catch (err) {
        console.error('Erro ao verificar autenticação:', err);
        return null;
    }
}

/**
 * Realiza logout e redireciona para login.
 */
async function performLogout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin'
        });
    } catch (err) {
        console.error('Erro no logout:', err);
    }
    window.location.href = '/login.html';
}

/* ==========================================================================
   LÓGICA DA PÁGINA DE LOGIN (só executa se estiver em login.html)
   ========================================================================== */
(function initLoginPage() {
    const loginForm = document.getElementById('login-form');
    // Se não existe o form de login, não estamos na página de login
    if (!loginForm) return;

    const inputUsername = document.getElementById('login-username');
    const inputPassword = document.getElementById('login-password');
    const btnLogin = document.getElementById('btn-login');
    const btnLoginText = document.getElementById('btn-login-text');
    const errorContainer = document.getElementById('login-error-message');
    const errorText = document.getElementById('login-error-text');

    // Ao carregar a página de login, checar se já está logado
    checkAuth().then(user => {
        if (user) {
            window.location.href = '/';
        }
    });

    // Handler do formulário
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin();
    });

    // Enter na senha
    inputPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    });

    async function handleLogin() {
        const username = inputUsername.value.trim();
        const password = inputPassword.value;

        if (!username || !password) {
            showError('Preencha todos os campos.');
            return;
        }

        // Estado de loading
        setLoading(true);
        hideError();

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (res.ok && data.user) {
                // Login bem-sucedido — redirecionar
                window.location.href = '/';
            } else {
                showError(data.message || 'Usuário ou senha incorretos.');
                setLoading(false);
            }
        } catch (err) {
            console.error('Erro no login:', err);
            showError('Erro de conexão com o servidor. Tente novamente.');
            setLoading(false);
        }
    }

    function setLoading(isLoading) {
        if (isLoading) {
            btnLogin.disabled = true;
            btnLoginText.textContent = 'Autenticando...';
            btnLogin.querySelector('i').className = 'fa-solid fa-spinner fa-spin';
        } else {
            btnLogin.disabled = false;
            btnLoginText.textContent = 'Entrar';
            btnLogin.querySelector('i').className = 'fa-solid fa-right-to-bracket';
        }
    }

    function showError(message) {
        errorText.textContent = message;
        errorContainer.classList.remove('hidden');
        errorContainer.classList.add('fade-in');
    }

    function hideError() {
        errorContainer.classList.add('hidden');
        errorContainer.classList.remove('fade-in');
    }
})();
