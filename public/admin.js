/* ==========================================================================
   ADMIN.JS - Painel Administrativo NOC
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let adminState = {
        user: null,
        users: [],
        reports: [],
        filteredReports: [],
        pendingDeleteAction: null // { type: 'user'|'report', id: number }
    };

    // --- DOM ELEMENTS ---
    const adminUserAvatar = document.getElementById('admin-user-avatar');
    const adminUserName = document.getElementById('admin-user-name');
    const btnAdminLogout = document.getElementById('btn-admin-logout');

    // User Management
    const inputNewFullname = document.getElementById('admin-new-fullname');
    const inputNewUsername = document.getElementById('admin-new-username');
    const inputNewPassword = document.getElementById('admin-new-password');
    const selectNewRole = document.getElementById('admin-new-role');
    const btnCreateUser = document.getElementById('btn-create-user');
    const createUserFeedback = document.getElementById('create-user-feedback');
    const createUserFeedbackText = document.getElementById('create-user-feedback-text');
    const tbodyUsersRows = document.getElementById('tbody-users-rows');
    const userCounter = document.getElementById('user-counter');

    // Reports
    const tbodyReportsRows = document.getElementById('tbody-reports-rows');
    const reportsCounter = document.getElementById('reports-counter');
    const filterAnalyst = document.getElementById('filter-analyst');
    const filterDateStart = document.getElementById('filter-date-start');
    const filterDateEnd = document.getElementById('filter-date-end');
    const btnClearFilters = document.getElementById('btn-clear-filters');

    // Modal
    const modalOverlay = document.getElementById('modal-report-detail');
    const modalBody = document.getElementById('modal-report-body');
    const btnCloseModal = document.getElementById('btn-close-modal');

    // Delete Confirmation Dialog
    const dialogConfirmDelete = document.getElementById('dialog-confirm-delete');
    const dialogDeleteMessage = document.getElementById('dialog-delete-message');
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    const btnConfirmDelete = document.getElementById('btn-confirm-delete');

    // --- INITIALIZATION ---
    initAdmin();

    async function initAdmin() {
        setupInteractiveGlow();

        // Auth check
        const user = await checkAuth();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        if (user.role !== 'admin') {
            window.location.href = '/';
            return;
        }

        adminState.user = user;
        updateUserDisplay();
        setupEventListeners();
        loadUsers();
        loadReports();
    }

    function updateUserDisplay() {
        const u = adminState.user;
        if (!u) return;
        const initials = u.fullName
            ? u.fullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
            : u.username.substring(0, 2).toUpperCase();
        adminUserAvatar.textContent = initials;
        adminUserName.textContent = u.fullName || u.username;
    }

    // --- INTERACTIVE GLOW ---
    function setupInteractiveGlow() {
        document.querySelectorAll('.glass-panel').forEach(panel => {
            panel.addEventListener('mousemove', e => {
                const rect = panel.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                panel.style.setProperty('--x', `${x}px`);
                panel.style.setProperty('--y', `${y}px`);
            });
        });
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        btnAdminLogout.addEventListener('click', performLogout);
        btnCreateUser.addEventListener('click', createUser);
        btnClearFilters.addEventListener('click', clearFilters);

        // Filters
        filterAnalyst.addEventListener('input', applyFilters);
        filterDateStart.addEventListener('change', applyFilters);
        filterDateEnd.addEventListener('change', applyFilters);

        // Modal
        btnCloseModal.addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });

        // Delete dialog
        btnCancelDelete.addEventListener('click', hideDeleteDialog);
        btnConfirmDelete.addEventListener('click', confirmDelete);
        dialogConfirmDelete.addEventListener('click', (e) => {
            if (e.target === dialogConfirmDelete) hideDeleteDialog();
        });
    }

    // =============================================
    // USER MANAGEMENT
    // =============================================

    async function loadUsers() {
        try {
            const res = await fetch('/api/admin/users', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('Falha ao carregar usuários');
            const data = await res.json();
            adminState.users = data.users || [];
            renderUsers();
        } catch (err) {
            console.error('Erro ao carregar usuários:', err);
            tbodyUsersRows.innerHTML = `
                <tr><td colspan="6" class="empty-state">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    Erro ao carregar usuários.
                </td></tr>`;
        }
    }

    function renderUsers() {
        const users = adminState.users;
        userCounter.textContent = `${users.length} Usuário${users.length !== 1 ? 's' : ''}`;

        if (users.length === 0) {
            tbodyUsersRows.innerHTML = `
                <tr><td colspan="6" class="empty-state">
                    <i class="fa-solid fa-users"></i>
                    Nenhum usuário cadastrado.
                </td></tr>`;
            return;
        }

        tbodyUsersRows.innerHTML = '';
        users.forEach(u => {
            const tr = document.createElement('tr');
            const roleBadge = u.role === 'admin'
                ? '<span class="category-badge cat-incidente">Admin</span>'
                : '<span class="category-badge cat-monitoramento">Analista</span>';

            const createdAt = u.created_at
                ? new Date(u.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '—';

            tr.innerHTML = `
                <td class="font-mono">${u.id}</td>
                <td>${escapeHTML(u.fullName || u.full_name || '')}</td>
                <td class="font-mono">${escapeHTML(u.username)}</td>
                <td>${roleBadge}</td>
                <td>${createdAt}</td>
                <td>
                    <button class="btn-icon-danger btn-delete-user" data-user-id="${u.id}" title="Excluir Usuário">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;

            tr.querySelector('.btn-delete-user').addEventListener('click', () => {
                showDeleteDialog('user', u.id, `Tem certeza que deseja excluir o usuário "${escapeHTML(u.fullName || u.full_name || u.username)}"? Essa ação não pode ser desfeita.`);
            });

            tbodyUsersRows.appendChild(tr);
        });
    }

    async function createUser() {
        const fullName = inputNewFullname.value.trim();
        const username = inputNewUsername.value.trim();
        const password = inputNewPassword.value;
        const role = selectNewRole.value;

        if (!fullName || !username || !password) {
            showUserFeedback('Preencha todos os campos obrigatórios.', true);
            return;
        }

        btnCreateUser.disabled = true;
        btnCreateUser.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando...';

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ username, password, fullName, role })
            });

            const data = await res.json();

            if (res.ok) {
                showUserFeedback(`Usuário "${escapeHTML(fullName)}" criado com sucesso!`, false);
                inputNewFullname.value = '';
                inputNewUsername.value = '';
                inputNewPassword.value = '';
                selectNewRole.value = 'analyst';
                loadUsers();
            } else {
                showUserFeedback(data.message || 'Erro ao criar usuário.', true);
            }
        } catch (err) {
            console.error('Erro ao criar usuário:', err);
            showUserFeedback('Erro de conexão com o servidor.', true);
        } finally {
            btnCreateUser.disabled = false;
            btnCreateUser.innerHTML = '<i class="fa-solid fa-user-plus"></i> Criar Usuário';
        }
    }

    async function deleteUser(id) {
        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            if (res.ok) {
                loadUsers();
            } else {
                const data = await res.json();
                alert(data.message || 'Erro ao excluir usuário.');
            }
        } catch (err) {
            console.error('Erro ao excluir usuário:', err);
            alert('Erro de conexão com o servidor.');
        }
    }

    function showUserFeedback(message, isError) {
        createUserFeedbackText.textContent = message;
        createUserFeedback.classList.remove('hidden');
        createUserFeedback.className = `admin-feedback fade-in ${isError ? 'feedback-error' : 'feedback-success'}`;
        setTimeout(() => {
            createUserFeedback.classList.add('hidden');
        }, 4000);
    }

    // =============================================
    // REPORTS MANAGEMENT
    // =============================================

    async function loadReports() {
        try {
            const res = await fetch('/api/admin/reports', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('Falha ao carregar relatórios');
            const data = await res.json();
            adminState.reports = data.reports || [];
            adminState.filteredReports = [...adminState.reports];
            renderReports();
        } catch (err) {
            console.error('Erro ao carregar relatórios:', err);
            tbodyReportsRows.innerHTML = `
                <tr><td colspan="6" class="empty-state">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    Erro ao carregar relatórios.
                </td></tr>`;
        }
    }

    function applyFilters() {
        const analystFilter = filterAnalyst.value.trim().toLowerCase();
        const dateStart = filterDateStart.value;
        const dateEnd = filterDateEnd.value;

        adminState.filteredReports = adminState.reports.filter(r => {
            // Analyst filter
            if (analystFilter) {
                const analystName = (r.analyst_name || r.analystName || '').toLowerCase();
                if (!analystName.includes(analystFilter)) return false;
            }
            // Date filters
            const reportDate = r.report_date || r.reportDate || '';
            if (dateStart && reportDate < dateStart) return false;
            if (dateEnd && reportDate > dateEnd) return false;
            return true;
        });

        renderReports();
    }

    function clearFilters() {
        filterAnalyst.value = '';
        filterDateStart.value = '';
        filterDateEnd.value = '';
        adminState.filteredReports = [...adminState.reports];
        renderReports();
    }

    function renderReports() {
        const reports = adminState.filteredReports;
        reportsCounter.textContent = `${reports.length} Relatório${reports.length !== 1 ? 's' : ''}`;

        if (reports.length === 0) {
            tbodyReportsRows.innerHTML = `
                <tr><td colspan="6" class="empty-state">
                    <i class="fa-solid fa-file-lines"></i>
                    Nenhum relatório encontrado.
                </td></tr>`;
            return;
        }

        tbodyReportsRows.innerHTML = '';
        reports.forEach(r => {
            const tr = document.createElement('tr');

            const reportDate = r.report_date || r.reportDate || '—';
            const displayDate = reportDate !== '—'
                ? new Date(reportDate + 'T12:00:00').toLocaleDateString('pt-BR')
                : '—';

            const shiftLabel = getShiftLabel(r.shift);
            const analystName = r.analyst_name || r.analystName || r.user_fullname || '—';
            const activities = r.activities || [];
            const actCount = Array.isArray(activities) ? activities.length : 0;

            const statusHtml = getStatusBadgeHtml(r.overall_status || r.overallStatus || 'normal');

            tr.innerHTML = `
                <td class="font-mono">${displayDate}</td>
                <td>${escapeHTML(shiftLabel)}</td>
                <td>${escapeHTML(analystName)}</td>
                <td>${statusHtml}</td>
                <td class="font-mono">${actCount}</td>
                <td>
                    <div class="admin-action-btns">
                        <button class="btn-icon-view btn-view-report" data-report-id="${r.id}" title="Visualizar Relatório">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="btn-icon-pdf btn-export-report" data-report-id="${r.id}" title="Exportar PDF">
                            <i class="fa-solid fa-file-pdf"></i>
                        </button>
                        <button class="btn-icon-danger btn-delete-report" data-report-id="${r.id}" title="Excluir Relatório">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;

            // Event listeners
            tr.querySelector('.btn-view-report').addEventListener('click', () => viewReport(r));
            tr.querySelector('.btn-export-report').addEventListener('click', () => exportReportPdf(r));
            tr.querySelector('.btn-delete-report').addEventListener('click', () => {
                showDeleteDialog('report', r.id, `Tem certeza que deseja excluir o relatório de ${displayDate} (${escapeHTML(analystName)})? Essa ação não pode ser desfeita.`);
            });

            tbodyReportsRows.appendChild(tr);
        });
    }

    // =============================================
    // REPORT DETAIL MODAL
    // =============================================

    function viewReport(report) {
        const reportDate = report.report_date || report.reportDate || '—';
        const displayDate = reportDate !== '—'
            ? new Date(reportDate + 'T12:00:00').toLocaleDateString('pt-BR')
            : '—';
        const shiftLabel = getShiftLabel(report.shift);
        const analystName = report.analyst_name || report.analystName || report.user_fullname || '—';
        const statusHtml = getStatusBadgeHtml(report.overall_status || report.overallStatus || 'normal');
        const activities = report.activities || [];

        let activitiesHtml = '';
        if (activities.length === 0) {
            activitiesHtml = `<tr><td colspan="4" class="empty-state">Nenhuma atividade registrada.</td></tr>`;
        } else {
            activities.forEach(act => {
                const catLabel = getCategoryLabel(act.category);
                const statusLabel = getActivityStatusLabel(act.status);
                activitiesHtml += `
                    <tr>
                        <td class="font-mono">${escapeHTML(act.time || '—')}</td>
                        <td><span class="category-badge cat-${act.category}">${catLabel}</span></td>
                        <td>${escapeHTML(act.description || '')}</td>
                        <td><span class="act-status act-status-${act.status}">${statusLabel}</span></td>
                    </tr>
                `;
            });
        }

        modalBody.innerHTML = `
            <div class="modal-info-grid">
                <div class="modal-info-item">
                    <span class="modal-info-label">Analista</span>
                    <span class="modal-info-value">${escapeHTML(analystName)}</span>
                </div>
                <div class="modal-info-item">
                    <span class="modal-info-label">Data</span>
                    <span class="modal-info-value font-mono">${displayDate}</span>
                </div>
                <div class="modal-info-item">
                    <span class="modal-info-label">Turno</span>
                    <span class="modal-info-value">${escapeHTML(shiftLabel)}</span>
                </div>
                <div class="modal-info-item">
                    <span class="modal-info-label">Status</span>
                    <span class="modal-info-value">${statusHtml}</span>
                </div>
            </div>
            <div class="modal-activities-section">
                <h4><i class="fa-solid fa-list-check"></i> Atividades (${activities.length})</h4>
                <div class="activities-table-wrapper">
                    <table class="activities-table">
                        <thead>
                            <tr>
                                <th style="width:10%">Horário</th>
                                <th style="width:15%">Categoria</th>
                                <th style="width:55%">Descrição</th>
                                <th style="width:20%">Status</th>
                            </tr>
                        </thead>
                        <tbody>${activitiesHtml}</tbody>
                    </table>
                </div>
            </div>
        `;

        modalOverlay.classList.add('show');
    }

    function closeModal() {
        modalOverlay.classList.remove('show');
    }

    // =============================================
    // DELETE CONFIRMATION
    // =============================================

    function showDeleteDialog(type, id, message) {
        adminState.pendingDeleteAction = { type, id };
        dialogDeleteMessage.textContent = message;
        dialogConfirmDelete.classList.add('show');
    }

    function hideDeleteDialog() {
        dialogConfirmDelete.classList.remove('show');
        adminState.pendingDeleteAction = null;
    }

    async function confirmDelete() {
        const action = adminState.pendingDeleteAction;
        if (!action) return;

        hideDeleteDialog();

        if (action.type === 'user') {
            await deleteUser(action.id);
        } else if (action.type === 'report') {
            await deleteReport(action.id);
        }
    }

    async function deleteReport(id) {
        try {
            const res = await fetch(`/api/reports/${id}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            if (res.ok) {
                loadReports();
            } else {
                const data = await res.json();
                alert(data.message || 'Erro ao excluir relatório.');
            }
        } catch (err) {
            console.error('Erro ao excluir relatório:', err);
            alert('Erro de conexão com o servidor.');
        }
    }

    // =============================================
    // PDF EXPORT (reuses buildPdfHtml logic)
    // =============================================

    async function exportReportPdf(report) {
        if (typeof html2pdf === 'undefined') {
            alert("A biblioteca html2pdf.js não foi carregada.");
            return;
        }

        const activities = report.activities || [];
        const analystName = report.analyst_name || report.analystName || report.user_fullname || 'Não informado';
        const reportDate = report.report_date || report.reportDate || '';
        const shift = report.shift || '';
        const overallStatus = report.overall_status || report.overallStatus || 'normal';

        // Temporary appState-like object for PDF generation
        const pdfState = {
            analystName,
            reportDate,
            shift,
            overallStatus,
            activities
        };

        try {
            const [logoBase64, fundoBase64] = await Promise.all([
                getLogoBase64(),
                getFundoBase64()
            ]);
            const templateHtml = buildPdfHtmlFromState(pdfState, logoBase64, fundoBase64);

            const pdfContainer = document.createElement('div');
            pdfContainer.className = 'pdf-render-container';
            pdfContainer.innerHTML = templateHtml;
            document.body.appendChild(pdfContainer);

            const analystClean = pdfState.analystName.trim().replace(/\s+/g, '_') || 'sem_analista';
            const dateClean = pdfState.reportDate || 'sem_data';
            let shiftFile = 'sem_turno';
            if (pdfState.shift === '1') shiftFile = 'Turno_1';
            else if (pdfState.shift === '2') shiftFile = 'Turno_2';
            else if (pdfState.shift === '3') shiftFile = 'Turno_3';
            else if (pdfState.shift === 'comercial') shiftFile = 'Comercial';
            const filename = `relatorio_noc_${dateClean}_${shiftFile}_${analystClean}.pdf`;

            const opt = {
                margin: [20, 10, 22, 10],
                filename: filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#040814', logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            const generationTimestamp = new Date().toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            await html2pdf()
                .set(opt)
                .from(pdfContainer)
                .toPdf()
                .get('pdf')
                .then(function(pdf) {
                    const totalPages = pdf.internal.getNumberOfPages();
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();

                    for (let i = 1; i <= totalPages; i++) {
                        pdf.setPage(i);
                        pdf.setDrawColor(10, 22, 40);
                        pdf.setLineWidth(0.6);
                        pdf.line(10, 14, pageWidth - 10, 14);
                        pdf.setFontSize(7);
                        pdf.setTextColor(100, 116, 139);
                        pdf.text('NOC Operational Report', 10, 12);
                        pdf.text(`${dateClean}`, pageWidth - 10, 12, { align: 'right' });
                        pdf.setDrawColor(226, 232, 240);
                        pdf.setLineWidth(0.3);
                        pdf.line(10, pageHeight - 16, pageWidth - 10, pageHeight - 16);
                        pdf.setFontSize(8);
                        pdf.setTextColor(100, 116, 139);
                        pdf.text(`Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 11, { align: 'center' });
                        pdf.setFontSize(6.5);
                        pdf.setTextColor(148, 163, 184);
                        pdf.text(`Gerado em ${generationTimestamp}`, pageWidth - 10, pageHeight - 7, { align: 'right' });
                        pdf.text('DOCUMENTO INTERNO — NOC Report System', 10, pageHeight - 7);
                    }
                })
                .save();

            document.body.removeChild(pdfContainer);
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            const leftover = document.querySelector('.pdf-render-container');
            if (leftover) document.body.removeChild(leftover);
            alert('Erro ao gerar PDF. Verifique o console.');
        }
    }

    function getLogoBase64() {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(null);
            img.src = 'logo.png';
        });
    }

    function getFundoBase64() {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => {
                console.warn('Não foi possível carregar o fundo para o PDF.');
                resolve(null);
            };
            img.src = 'fundo_relatorio.png';
        });
    }

    function buildPdfHtmlFromState(state, logoBase64, fundoBase64) {
        const completedActivities = state.activities.filter(a => a.status === 'concluido');
        const stats = { monitoramento: 0, incidente: 0, mudanca: 0, backup: 0, outro: 0 };
        completedActivities.forEach(a => {
            if (stats.hasOwnProperty(a.category)) stats[a.category]++;
        });

        const analystName = state.analystName || 'Não informado';
        const reportDate = state.reportDate
            ? new Date(state.reportDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Não informada';

        let shiftLabel = 'Não selecionado';
        if (state.shift === '1') shiftLabel = '1º Turno (06:00 - 14:00)';
        else if (state.shift === '2') shiftLabel = '2º Turno (14:00 - 22:00)';
        else if (state.shift === '3') shiftLabel = '3º Turno (22:00 - 06:00)';
        else if (state.shift === 'comercial') shiftLabel = 'Horário Comercial (08:00 - 18:00)';

        let statusLabel = 'OPERACIONAL';
        let statusColor = '#00ff87';
        let statusIcon = '●';
        if (state.overallStatus === 'warning') {
            statusLabel = 'ATENÇÃO'; statusColor = '#ffb800'; statusIcon = '▲';
        } else if (state.overallStatus === 'critical') {
            statusLabel = 'CRÍTICO'; statusColor = '#ff4b2b'; statusIcon = '◆';
        }

        const logoHtml = logoBase64
            ? `<img src="${logoBase64}" style="width:130px; height:38px; object-fit:contain; display:block;" alt="NOC Logo">`
            : `<div style="width:52px; height:52px; background:#0a142d; border:1px solid #00f2fe; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#00f2fe; font-weight:bold; font-size:16px;">NOC</div>`;

        const categoryConfig = {
            monitoramento: { label: 'Monitoração', bg: 'rgba(0, 242, 254, 0.15)', color: '#00f2fe', border: 'rgba(0, 242, 254, 0.3)' },
            incidente:     { label: 'Incidente',   bg: 'rgba(255, 75, 43, 0.15)', color: '#ff4b2b', border: 'rgba(255, 75, 43, 0.3)' },
            mudanca:       { label: 'Mudança',     bg: 'rgba(255, 184, 0, 0.15)', color: '#ffb800', border: 'rgba(255, 184, 0, 0.3)' },
            backup:        { label: 'Backup',      bg: 'rgba(0, 255, 135, 0.15)', color: '#00ff87', border: 'rgba(0, 255, 135, 0.3)' },
            outro:         { label: 'Outro',       bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' }
        };

        let tableRowsHtml = '';
        if (completedActivities.length === 0) {
            tableRowsHtml = `
                <tr>
                    <td colspan="4" style="text-align:center; padding:30px 16px; color:#cbd5e1; font-style:italic; font-size:10pt;">
                        Nenhuma atividade concluída registrada neste turno.
                    </td>
                </tr>
            `;
        } else {
            completedActivities.forEach((act, index) => {
                const cat = categoryConfig[act.category] || categoryConfig.outro;
                const rowBg = index % 2 === 0 ? 'rgba(6, 15, 38, 0.65)' : 'rgba(10, 20, 45, 0.5)';
                tableRowsHtml += `
                    <tr style="background-color:${rowBg};">
                        <td style="padding:10px 14px; border-bottom:1px solid rgba(255, 255, 255, 0.08); font-family:'JetBrains Mono', 'Courier New', monospace; font-size:10pt; color:#00f2fe; font-weight:600; white-space:nowrap;">
                            ${escapeHTML(act.time)}
                        </td>
                        <td style="padding:10px 14px; border-bottom:1px solid rgba(255, 255, 255, 0.08);">
                            <span style="display:inline-block; padding:3px 10px; border-radius:4px; font-size:8pt; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; background:${cat.bg}; color:${cat.color}; border:1px solid ${cat.border};">
                                ${cat.label}
                            </span>
                        </td>
                        <td style="padding:10px 14px; border-bottom:1px solid rgba(255, 255, 255, 0.08); font-size:10pt; color:#ffffff; line-height:1.4;">
                            ${escapeHTML(act.description)}
                        </td>
                        <td style="padding:10px 14px; border-bottom:1px solid rgba(255, 255, 255, 0.08); font-size:9pt; color:#00ff87; font-weight:600; white-space:nowrap;">
                            ✓ Concluído
                        </td>
                    </tr>
                `;
            });
        }

        function buildStatCard(label, count, color) {
            const darkBg = color === '#0369a1' || color === '#00f2fe' ? 'rgba(0, 242, 254, 0.1)' :
                           color === '#b91c1c' || color === '#ff4b2b' ? 'rgba(255, 75, 43, 0.1)' :
                           color === '#b45309' || color === '#ffb800' ? 'rgba(255, 184, 0, 0.1)' :
                           color === '#15803d' || color === '#00ff87' ? 'rgba(0, 255, 135, 0.1)' :
                                                                        'rgba(148, 163, 184, 0.1)';
            const activeColor = color === '#0369a1' ? '#00f2fe' :
                                color === '#b91c1c' ? '#ff4b2b' :
                                color === '#b45309' ? '#ffb800' :
                                color === '#15803d' ? '#00ff87' : color;
            return `
                <td style="width:20%; padding:0 4px;">
                    <div style="background:${darkBg}; border-radius:8px; padding:12px 8px; text-align:center; border:1px solid ${activeColor}30;">
                        <div style="font-size:22pt; font-weight:800; color:${activeColor}; line-height:1;">${count}</div>
                        <div style="font-size:7pt; color:#cbd5e1; text-transform:uppercase; letter-spacing:0.5px; margin-top:4px; font-weight:600;">${label}</div>
                    </div>
                </td>
            `;
        }

        const bgStyle = fundoBase64
            ? `background: #040814 url('${fundoBase64}') no-repeat center center; background-size: cover;`
            : `background: #040814;`;

        return `
            <div style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; color:#ffffff; ${bgStyle} padding:24px; margin:0; width:100%; box-sizing:border-box; min-height:297mm;">
                
                <!-- CABEÇALHO CORPORATIVO -->
                <div style="background:rgba(10, 20, 45, 0.85); border:1px solid rgba(255, 255, 255, 0.15); border-left:4px solid #00f2fe; border-radius:12px; padding:24px 28px; margin-bottom:20px;">
                    <table style="width:100%; border-collapse:collapse;">
                        <tr>
                            <td style="width:140px; vertical-align:middle; padding-right:16px;">
                                ${logoHtml}
                            </td>
                            <td style="vertical-align:middle;">
                                <div style="font-size:18pt; font-weight:800; color:#ffffff; letter-spacing:1.5px; line-height:1.2;">
                                    RELATÓRIO DIÁRIO DE TURNO
                                </div>
                                <div style="font-size:9pt; color:#00f2fe; letter-spacing:3px; margin-top:3px; font-weight:500;">
                                    NETWORK OPERATIONS CENTER
                                </div>
                            </td>
                            <td style="text-align:right; vertical-align:middle;">
                                <div style="display:inline-block; background:${statusColor}22; border:1px solid ${statusColor}; border-radius:8px; padding:8px 16px;">
                                    <span style="color:${statusColor}; font-size:11pt; font-weight:700;">
                                        ${statusIcon} ${statusLabel}
                                    </span>
                                </div>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Dados do Plantão -->
                    <div style="margin-top:16px; border-top:1px solid rgba(255,255,255,0.15); padding-top:14px;">
                        <table style="width:100%; border-collapse:collapse;">
                            <tr>
                                <td style="width:33%; padding:0 8px 0 0;">
                                    <div style="font-size:7pt; color:#cbd5e1; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Analista Responsável</div>
                                    <div style="font-size:11pt; color:#ffffff; font-weight:600; margin-top:3px;">${escapeHTML(analystName)}</div>
                                </td>
                                <td style="width:33%; padding:0 8px;">
                                    <div style="font-size:7pt; color:#cbd5e1; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Data do Relatório</div>
                                    <div style="font-size:11pt; color:#ffffff; font-weight:600; margin-top:3px;">${reportDate}</div>
                                </td>
                                <td style="width:34%; padding:0 0 0 8px;">
                                    <div style="font-size:7pt; color:#cbd5e1; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Turno de Trabalho</div>
                                    <div style="font-size:11pt; color:#ffffff; font-weight:600; margin-top:3px;">${escapeHTML(shiftLabel)}</div>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>

                <!-- RESUMO DO TURNO -->
                <div style="background:rgba(10, 20, 45, 0.8); border:1px solid rgba(255, 255, 255, 0.15); border-radius:12px; padding:20px 24px; margin-bottom:20px; color:#ffffff;">
                    <div style="font-size:10pt; font-weight:700; color:#00f2fe; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:14px; padding-bottom:8px; border-bottom:2px solid rgba(255, 255, 255, 0.15);">
                        📊 Resumo do Turno
                    </div>
                    <div style="text-align:center; margin-bottom:14px;">
                        <span style="font-size:28pt; font-weight:800; color:#ffffff;">${completedActivities.length}</span>
                        <span style="font-size:10pt; color:#cbd5e1; margin-left:8px;">atividade${completedActivities.length !== 1 ? 's' : ''} concluída${completedActivities.length !== 1 ? 's' : ''}</span>
                    </div>
                    <table style="width:100%; border-collapse:collapse;">
                        <tr>
                            ${buildStatCard('Monitoração', stats.monitoramento, '#00f2fe')}
                            ${buildStatCard('Incidentes', stats.incidente, '#ff4b2b')}
                            ${buildStatCard('Mudanças', stats.mudanca, '#ffb800')}
                            ${buildStatCard('Backup', stats.backup, '#00ff87')}
                            ${buildStatCard('Outros', stats.outro, '#cbd5e1')}
                        </tr>
                    </table>
                </div>

                <!-- TABELA DE ATIVIDADES -->
                <div style="margin-bottom:20px; background:rgba(10, 20, 45, 0.8); border:1px solid rgba(255, 255, 255, 0.15); border-radius:12px; padding:20px 24px;">
                    <div style="font-size:10pt; font-weight:700; color:#ffffff; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid rgba(255, 255, 255, 0.15);">
                        📋 Registro de Atividades Executadas
                    </div>
                    <table style="width:100%; border-collapse:collapse; border:1px solid rgba(255, 255, 255, 0.15); border-radius:8px; overflow:hidden;">
                        <thead>
                            <tr>
                                <th style="background:rgba(10, 20, 45, 0.95); color:#00f2fe; padding:12px 14px; text-align:left; font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid rgba(255, 255, 255, 0.25); width:12%;">
                                    Horário
                                </th>
                                <th style="background:rgba(10, 20, 45, 0.95); color:#00f2fe; padding:12px 14px; text-align:left; font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid rgba(255, 255, 255, 0.25); width:18%;">
                                    Categoria
                                </th>
                                <th style="background:rgba(10, 20, 45, 0.95); color:#00f2fe; padding:12px 14px; text-align:left; font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid rgba(255, 255, 255, 0.25); width:58%;">
                                    Descrição
                                </th>
                                <th style="background:rgba(10, 20, 45, 0.95); color:#00f2fe; padding:12px 14px; text-align:left; font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid rgba(255, 255, 255, 0.25); width:12%;">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // =============================================
    // HELPERS
    // =============================================

    function getShiftLabel(shift) {
        if (shift === '1') return '1º Turno (06:00 - 14:00)';
        if (shift === '2') return '2º Turno (14:00 - 22:00)';
        if (shift === '3') return '3º Turno (22:00 - 06:00)';
        if (shift === 'comercial') return 'Horário Comercial (08:00 - 18:00)';
        return 'Não selecionado';
    }

    function getStatusBadgeHtml(status) {
        if (status === 'warning') return '<span class="act-status act-status-pendente"><i class="fa-solid fa-triangle-exclamation"></i> Atenção</span>';
        if (status === 'critical') return '<span class="act-status act-status-concluido" style="color:var(--color-danger)"><i class="fa-solid fa-circle-exclamation"></i> Crítico</span>';
        return '<span class="act-status act-status-concluido"><i class="fa-solid fa-circle-check"></i> Normal</span>';
    }

    function getCategoryLabel(category) {
        const labels = {
            monitoramento: 'Monitoração',
            incidente: 'Incidente',
            mudanca: 'Mudança',
            backup: 'Backup',
            outro: 'Outro'
        };
        return labels[category] || 'Outro';
    }

    function getActivityStatusLabel(status) {
        if (status === 'concluido') return '<i class="fa-solid fa-circle-check"></i> Concluído';
        if (status === 'em-andamento') return '<i class="fa-solid fa-spinner fa-spin"></i> Em Andamento';
        if (status === 'pendente') return '<i class="fa-solid fa-clock-rotate-left"></i> Pendente';
        return status;
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
