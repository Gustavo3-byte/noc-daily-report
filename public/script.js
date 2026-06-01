/* ==========================================================================
   SCRIPT PRINCIPAL - NOC DAILY REPORT (JS PURO — MULTI-USER / API)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO DO APLICATIVO ---
    let appState = {
        user: null,
        currentReportId: null,
        analystName: '',
        reportDate: '',
        shift: '',
        overallStatus: 'normal',
        activities: []
    };

    // --- ELEMENTOS DOM ---
    const inputAnalystName = document.getElementById('input-analyst-name');
    const inputReportDate = document.getElementById('input-report-date');
    const selectNocShift = document.getElementById('select-noc-shift');
    const radioStatusNormal = document.getElementById('radio-status-normal');
    const radioStatusWarning = document.getElementById('radio-status-warning');
    const radioStatusCritical = document.getElementById('radio-status-critical');
    const statusLabels = document.querySelectorAll('.status-option-btn');
    const headerStatusIndicator = document.getElementById('header-status-indicator');
    
    // Atividades
    const inputActDesc = document.getElementById('input-act-desc');
    const inputActTime = document.getElementById('input-act-time');
    const selectActCategory = document.getElementById('select-act-category');
    const selectActStatus = document.getElementById('select-act-status');
    const btnAddActivity = document.getElementById('btn-add-activity');
    const tbodyActivitiesRows = document.getElementById('tbody-activities-rows');
    const activityCounter = document.getElementById('activity-counter');
    
    // Controles e Footer
    const textAutosaveStatus = document.getElementById('text-autosave-status');
    const autosaveDot = document.getElementById('autosave-dot');
    const btnClearReport = document.getElementById('btn-clear-report');
    const btnExportPdf = document.getElementById('btn-export-pdf');
    const btnPrintReport = document.getElementById('btn-print-report');
    
    // Custom Dialog
    const dialogConfirmClear = document.getElementById('dialog-confirm-clear');
    const btnCancelClear = document.getElementById('btn-cancel-clear');
    const btnConfirmClear = document.getElementById('btn-confirm-clear');

    // Relógio
    const nocDigitalClock = document.getElementById('noc-digital-clock');

    // User Info (Header)
    const userAvatar = document.getElementById('user-avatar');
    const userNameText = document.getElementById('user-name-text');
    const btnLogout = document.getElementById('btn-logout');
    const btnAdminLink = document.getElementById('btn-admin-link');

    // My Reports
    const tbodyMyReportsRows = document.getElementById('tbody-my-reports-rows');
    const myReportsCounter = document.getElementById('my-reports-counter');

    // --- INICIALIZAÇÃO ---
    initApp();

    async function initApp() {
        setupClock();
        setupInteractiveGlow();
        setDefaultDate();
        setDefaultActivityTime();

        // Auth check
        const user = await checkAuth();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }

        appState.user = user;
        appState.analystName = user.fullName || user.username;
        inputAnalystName.value = appState.analystName;

        // Update header user info
        updateUserDisplay();

        setupEventListeners();
        updateDashboardCounters();
        loadMyReports();
    }

    // --- ATUALIZAR DISPLAY DO USUÁRIO ---
    function updateUserDisplay() {
        const u = appState.user;
        if (!u) return;

        const initials = u.fullName
            ? u.fullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
            : u.username.substring(0, 2).toUpperCase();

        userAvatar.textContent = initials;
        userNameText.textContent = u.fullName || u.username;

        // Show admin link if admin
        if (u.role === 'admin' && btnAdminLink) {
            btnAdminLink.classList.remove('hidden');
        }
    }

    // --- RELÓGIO DINÂMICO NOC (LOCAL) ---
    function setupClock() {
        function updateTime() {
            const now = new Date();
            const h = String(now.getHours()).padStart(2, '0');
            const m = String(now.getMinutes()).padStart(2, '0');
            const s = String(now.getSeconds()).padStart(2, '0');
            nocDigitalClock.textContent = `${h}:${m}:${s}`;
        }
        updateTime();
        setInterval(updateTime, 1000);
    }

    // --- EFEITO GLOW INTERATIVO (GLASSMORPHISM MOUSEMOVE) ---
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

    // --- DATA AUTOMÁTICA ---
    function setDefaultDate() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        
        appState.reportDate = `${yyyy}-${mm}-${dd}`;
        inputReportDate.value = appState.reportDate;
    }

    // --- HORA DA ATIVIDADE PADRÃO ---
    function setDefaultActivityTime() {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        inputActTime.value = `${hh}:${mm}`;
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // Shift change
        selectNocShift.addEventListener('change', (e) => {
            appState.shift = e.target.value;
            triggerAutoSave();
        });

        // Status do NOC Radios
        const statusRadios = [radioStatusNormal, radioStatusWarning, radioStatusCritical];
        statusRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    appState.overallStatus = e.target.value;
                    updateStatusTheme(appState.overallStatus);
                    triggerAutoSave();
                }
            });
        });

        // Adicionar Atividade
        btnAddActivity.addEventListener('click', addActivity);
        inputActDesc.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addActivity();
            }
        });

        // Botões de Ação
        btnClearReport.addEventListener('click', showClearDialog);
        btnCancelClear.addEventListener('click', hideClearDialog);
        btnConfirmClear.addEventListener('click', clearReportData);
        
        // Clique fora do modal fecha o modal
        dialogConfirmClear.addEventListener('click', (e) => {
            if (e.target === dialogConfirmClear) {
                hideClearDialog();
            }
        });

        // Exportar PDF
        btnExportPdf.addEventListener('click', exportToPDF);

        // Imprimir / Salvar PDF Nativo
        btnPrintReport.addEventListener('click', () => {
            const rows = tbodyActivitiesRows.querySelectorAll('tr');
            const hiddenRows = [];
            
            // Ocultar atividades que não estão concluídas
            rows.forEach(row => {
                const statusSpan = row.querySelector('.act-status');
                if (statusSpan && !statusSpan.classList.contains('act-status-concluido')) {
                    row.style.display = 'none';
                    hiddenRows.push(row);
                }
            });

            // Adicionar linha temporária se nenhuma atividade estiver concluída
            let tempEmptyRow = null;
            const visibleRows = Array.from(rows).filter(r => !hiddenRows.includes(r) && r.id !== 'empty-state-row');
            if (visibleRows.length === 0) {
                tempEmptyRow = document.createElement('tr');
                tempEmptyRow.className = 'temp-pdf-empty-row';
                tempEmptyRow.innerHTML = `
                    <td colspan="5" class="empty-state">
                        <i class="fa-solid fa-circle-check"></i>
                        Nenhuma atividade concluída neste turno.
                    </td>
                `;
                tbodyActivitiesRows.appendChild(tempEmptyRow);
            }

            window.print();

            // Restaurar a visualização na tela após a impressão
            hiddenRows.forEach(row => row.style.display = '');
            if (tempEmptyRow) {
                tbodyActivitiesRows.removeChild(tempEmptyRow);
            }
        });

        // Logout
        if (btnLogout) {
            btnLogout.addEventListener('click', performLogout);
        }
    }

    // --- ATUALIZAR INTERFACE DE STATUS ---
    function updateStatusTheme(status) {
        // Atualiza a classe ativa nos botões seletores
        statusLabels.forEach(label => {
            label.classList.remove('active');
        });

        let activeLabel;

        if (status === 'normal') {
            activeLabel = document.getElementById('lbl-status-normal');
            headerStatusIndicator.className = 'stat-value status-indicator-text status-normal';
            headerStatusIndicator.innerHTML = '<i class="fa-solid fa-circle-check"></i> OPERACIONAL';
        } else if (status === 'warning') {
            activeLabel = document.getElementById('lbl-status-warning');
            headerStatusIndicator.className = 'stat-value status-indicator-text status-warning';
            headerStatusIndicator.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ATENÇÃO';
        } else if (status === 'critical') {
            activeLabel = document.getElementById('lbl-status-critical');
            headerStatusIndicator.className = 'stat-value status-indicator-text status-critical';
            headerStatusIndicator.innerHTML = '<i class="fa-solid fa-circle-exclamation pulse"></i> CRÍTICO';
        }

        if (activeLabel) {
            activeLabel.classList.add('active');
        }
    }

    // --- GESTÃO DE ATIVIDADES ---
    function addActivity() {
        const description = inputActDesc.value.trim();
        const time = inputActTime.value;
        const category = selectActCategory.value;
        const status = selectActStatus.value;

        if (!description) {
            inputActDesc.focus();
            inputActDesc.style.borderColor = 'var(--color-danger)';
            setTimeout(() => {
                inputActDesc.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }, 1000);
            return;
        }

        const newActivity = {
            id: Date.now().toString(),
            time: time || '00:00',
            category: category,
            description: description,
            status: status
        };

        appState.activities.push(newActivity);
        
        // Ordenar atividades por horário
        appState.activities.sort((a, b) => a.time.localeCompare(b.time));

        // Limpar inputs de atividade e focar na descrição
        inputActDesc.value = '';
        setDefaultActivityTime();
        inputActDesc.focus();

        renderActivities();
        updateDashboardCounters();
        triggerAutoSave();
    }

    function deleteActivity(id) {
        appState.activities = appState.activities.filter(act => act.id !== id);
        renderActivities();
        updateDashboardCounters();
        triggerAutoSave();
    }

    function renderActivities() {
        // Limpar tabela
        tbodyActivitiesRows.innerHTML = '';

        if (appState.activities.length === 0) {
            tbodyActivitiesRows.innerHTML = `
                <tr id="empty-state-row">
                    <td colspan="5" class="empty-state">
                        <i class="fa-solid fa-chart-line"></i>
                        Nenhuma atividade registrada neste turno.
                    </td>
                </tr>
            `;
            return;
        }

        appState.activities.forEach(act => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-id', act.id);

            // Categoria Badge
            let categoryText = act.category;
            if (act.category === 'monitoramento') categoryText = 'Monitoração';
            else if (act.category === 'incidente') categoryText = 'Incidente';
            else if (act.category === 'mudanca') categoryText = 'Mudança';
            else if (act.category === 'backup') categoryText = 'Backup';
            else if (act.category === 'outro') categoryText = 'Outro';

            // Status Badge/Text
            let statusText = act.status;
            let statusClass = 'act-status-concluido';
            let statusIcon = 'fa-solid fa-circle-check';
            if (act.status === 'concluido') {
                statusText = 'Concluído';
            } else if (act.status === 'em-andamento') {
                statusText = 'Em Andamento';
                statusClass = 'act-status-em-andamento';
                statusIcon = 'fa-solid fa-spinner fa-spin';
            } else if (act.status === 'pendente') {
                statusText = 'Pendente';
                statusClass = 'act-status-pendente';
                statusIcon = 'fa-solid fa-clock-rotate-left';
            }

            tr.innerHTML = `
                <td class="font-mono">${act.time}</td>
                <td><span class="category-badge cat-${act.category}">${categoryText}</span></td>
                <td>${escapeHTML(act.description)}</td>
                <td>
                    <span class="act-status ${statusClass}">
                        <i class="${statusIcon}"></i> ${statusText}
                    </span>
                </td>
                <td class="no-print">
                    <button class="btn-icon-danger btn-delete-act" title="Excluir Atividade">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;

            // Event listener para o botão de deletar desta linha
            tr.querySelector('.btn-delete-act').addEventListener('click', () => {
                deleteActivity(act.id);
            });

            tbodyActivitiesRows.appendChild(tr);
        });
    }

    function updateDashboardCounters() {
        const count = appState.activities.length;
        activityCounter.textContent = `${count} Atividade${count !== 1 ? 's' : ''}`;
    }

    // --- AUTO-SAVE (API COM DEBOUNCE) ---
    let autoSaveTimeout;

    function triggerAutoSave() {
        // Efeito Visual de "Salvando..."
        autosaveDot.style.background = 'var(--color-warning)';
        autosaveDot.style.boxShadow = '0 0 8px var(--color-warning)';
        textAutosaveStatus.textContent = 'Salvando alterações...';

        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(async () => {
            try {
                const payload = {
                    report_date: appState.reportDate,
                    shift: appState.shift,
                    overall_status: appState.overallStatus,
                    activities: appState.activities
                };

                const res = await fetch('/api/reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.report && data.report.id) {
                        appState.currentReportId = data.report.id;
                    }

                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('pt-BR');

                    autosaveDot.style.background = 'var(--color-success)';
                    autosaveDot.style.boxShadow = '0 0 8px var(--color-success)';
                    textAutosaveStatus.textContent = `Salvo no servidor em ${timeStr}`;

                    // Refresh my reports list
                    loadMyReports();
                } else {
                    throw new Error('Resposta não-ok do servidor');
                }
            } catch (err) {
                console.error('Erro ao salvar relatório:', err);
                autosaveDot.style.background = 'var(--color-danger)';
                autosaveDot.style.boxShadow = '0 0 8px var(--color-danger)';
                textAutosaveStatus.textContent = 'Erro ao salvar — tente novamente';
            }
        }, 500);
    }

    // --- MEUS RELATÓRIOS ---
    async function loadMyReports() {
        try {
            const res = await fetch('/api/reports', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('Falha ao carregar relatórios');
            const data = await res.json();
            const reports = data.reports || [];
            renderMyReports(reports);
        } catch (err) {
            console.error('Erro ao carregar meus relatórios:', err);
        }
    }

    function renderMyReports(reports) {
        myReportsCounter.textContent = `${reports.length} Relatório${reports.length !== 1 ? 's' : ''}`;

        if (reports.length === 0) {
            tbodyMyReportsRows.innerHTML = `
                <tr id="my-reports-empty-state">
                    <td colspan="5" class="empty-state">
                        <i class="fa-solid fa-folder-open"></i>
                        Nenhum relatório anterior encontrado.
                    </td>
                </tr>
            `;
            return;
        }

        tbodyMyReportsRows.innerHTML = '';
        reports.forEach(r => {
            const tr = document.createElement('tr');

            const reportDate = r.report_date || r.reportDate || '—';
            const displayDate = reportDate !== '—'
                ? new Date(reportDate + 'T12:00:00').toLocaleDateString('pt-BR')
                : '—';

            const shiftLabel = getShiftLabel(r.shift);
            const activities = r.activities || [];
            const actCount = Array.isArray(activities) ? activities.length : 0;
            const statusHtml = getStatusBadgeHtml(r.overall_status || r.overallStatus || 'normal');

            tr.innerHTML = `
                <td class="font-mono">${displayDate}</td>
                <td>${escapeHTML(shiftLabel)}</td>
                <td>${statusHtml}</td>
                <td class="font-mono">${actCount}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn-icon-view btn-load-report" title="Carregar no formulário">
                            <i class="fa-solid fa-upload"></i>
                        </button>
                        <button class="btn-icon-pdf btn-export-my-report" title="Exportar PDF">
                            <i class="fa-solid fa-file-pdf"></i>
                        </button>
                        <button class="btn-icon-danger btn-delete-my-report" title="Excluir relatório">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;

            // Load into form
            tr.querySelector('.btn-load-report').addEventListener('click', () => {
                loadReportIntoForm(r);
            });

            // Export PDF
            tr.querySelector('.btn-export-my-report').addEventListener('click', () => {
                exportReportPdf(r);
            });

            // Delete
            tr.querySelector('.btn-delete-my-report').addEventListener('click', () => {
                if (confirm(`Excluir relatório de ${displayDate}? Essa ação não pode ser desfeita.`)) {
                    deleteReport(r.id);
                }
            });

            tbodyMyReportsRows.appendChild(tr);
        });
    }

    function loadReportIntoForm(report) {
        appState.currentReportId = report.id;
        appState.reportDate = report.report_date || report.reportDate || appState.reportDate;
        appState.shift = report.shift || '';
        appState.overallStatus = report.overall_status || report.overallStatus || 'normal';
        appState.activities = report.activities || [];

        // Update DOM
        inputReportDate.value = appState.reportDate;
        selectNocShift.value = appState.shift;

        // Status radio
        const targetRadio = document.getElementById(`radio-status-${appState.overallStatus}`);
        if (targetRadio) {
            targetRadio.checked = true;
            updateStatusTheme(appState.overallStatus);
        }

        // Activities
        renderActivities();
        updateDashboardCounters();

        // Visual feedback
        autosaveDot.style.background = 'var(--color-cyan)';
        autosaveDot.style.boxShadow = '0 0 8px var(--color-cyan)';
        textAutosaveStatus.textContent = 'Relatório carregado com sucesso';
        setTimeout(() => {
            autosaveDot.style.background = 'var(--color-success)';
            autosaveDot.style.boxShadow = '0 0 8px var(--color-success)';
            textAutosaveStatus.textContent = 'Salvamento automático ativo';
        }, 2000);

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function deleteReport(id) {
        try {
            const res = await fetch(`/api/reports/${id}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            if (res.ok) {
                // If we deleted the currently loaded report, reset
                if (appState.currentReportId === id) {
                    appState.currentReportId = null;
                }
                loadMyReports();
            } else {
                const data = await res.json();
                alert(data.message || 'Erro ao excluir relatório.');
            }
        } catch (err) {
            console.error('Erro ao excluir relatório:', err);
            alert('Erro de conexão com o servidor.');
        }
    }

    async function exportReportPdf(report) {
        if (typeof html2pdf === 'undefined') {
            alert("A biblioteca html2pdf.js não foi carregada.");
            return;
        }

        const pdfState = {
            analystName: appState.analystName,
            reportDate: report.report_date || report.reportDate || '',
            shift: report.shift || '',
            overallStatus: report.overall_status || report.overallStatus || 'normal',
            activities: report.activities || []
        };

        try {
            const [logoBase64, fundoBase64] = await Promise.all([
                getLogoBase64(),
                getFundoBase64()
            ]);
            const templateHtml = buildPdfHtml(logoBase64, fundoBase64, pdfState);

            const pdfContainer = document.createElement('div');
            pdfContainer.className = 'pdf-render-container';
            pdfContainer.innerHTML = templateHtml;
            document.body.appendChild(pdfContainer);

            const analystClean = pdfState.analystName.trim().replace(/\s+/g, '_') || 'sem_analista';
            const dateClean = pdfState.reportDate || 'sem_data';
            let shiftFile = pdfState.shift ? pdfState.shift.replace('-', '_') : 'sem_turno';
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

    // --- HELPERS ---
    function getShiftLabel(shift) {
        if (shift === '07-17') return '07:00 às 17:00';
        if (shift === '08-18') return '08:00 às 18:00';
        if (shift === '09-19') return '09:00 às 19:00';
        // compatibilidade com valores legados
        if (shift === '1') return '1º Turno (06:00 - 14:00)';
        if (shift === '2') return '2º Turno (14:00 - 22:00)';
        if (shift === '3') return '3º Turno (22:00 - 06:00)';
        if (shift === 'comercial') return 'Horário Comercial (08:00 - 18:00)';
        return 'Não selecionado';
    }

    function getStatusBadgeHtml(status) {
        if (status === 'warning') return '<span class="act-status act-status-pendente"><i class="fa-solid fa-triangle-exclamation"></i> Atenção</span>';
        if (status === 'critical') return '<span class="act-status" style="color:var(--color-danger)"><i class="fa-solid fa-circle-exclamation"></i> Crítico</span>';
        return '<span class="act-status act-status-concluido"><i class="fa-solid fa-circle-check"></i> Normal</span>';
    }

    // --- DIALOG PARA LIMPEZA ---
    function showClearDialog() {
        dialogConfirmClear.classList.add('show');
    }

    function hideClearDialog() {
        dialogConfirmClear.classList.remove('show');
    }

    function clearReportData() {
        // Resetar Estado
        appState = {
            user: appState.user,
            currentReportId: null,
            analystName: appState.analystName,
            reportDate: '',
            shift: '',
            overallStatus: 'normal',
            activities: []
        };
        // Resetar DOM
        inputAnalystName.value = appState.analystName;
        selectNocShift.value = '';
        radioStatusNormal.checked = true;
        updateStatusTheme('normal');
        setDefaultDate();
        setDefaultActivityTime();
        renderActivities();
        updateDashboardCounters();
        hideClearDialog();

        // Atualizar status autosave
        autosaveDot.style.background = 'var(--color-success)';
        autosaveDot.style.boxShadow = '0 0 8px var(--color-success)';
        textAutosaveStatus.textContent = 'Relatório limpo — pronto para novo';
    }

    // --- EXPORTAR PDF (SISTEMA PROFISSIONAL COM TEMPLATE DEDICADO) ---

    /**
     * Converte a imagem do logo em Base64 para uso inline no PDF.
     * Isso evita problemas de CORS ao renderizar com html2canvas.
     */
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
            img.onerror = () => {
                console.warn('Não foi possível carregar a logo para o PDF.');
                resolve(null);
            };
            img.src = 'logo.png';
        });
    }

    /**
     * Converte a imagem de fundo do relatório em Base64 para uso inline no PDF.
     */
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

    /**
     * Constrói o HTML dedicado para o template do PDF.
     * Usa apenas tabelas e blocos (sem flexbox/grid) para máxima compatibilidade com html2canvas.
     * Aceita um stateOverride opcional para gerar PDFs de relatórios carregados.
     */
    function buildPdfHtml(logoBase64, fundoBase64, stateOverride) {
        const state = stateOverride || appState;

        // Todas as atividades (concluídas + em andamento + pendentes)
        const allActivities = state.activities || [];

        // Calcular estatísticas por categoria (todas as atividades)
        const stats = {
            monitoramento: 0,
            suporte: 0,
            n3: 0,
            rotina: 0,
            flow: 0
        };
        allActivities.forEach(a => {
            if (stats.hasOwnProperty(a.category)) {
                stats[a.category]++;
            }
        });

        // Dados do cabeçalho
        const analystName = state.analystName || 'Não informado';
        const reportDate = state.reportDate 
            ? new Date(state.reportDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Não informada';
        
        let shiftLabel = 'Não selecionado';
        if (state.shift === '07-17') shiftLabel = '07:00 às 17:00';
        else if (state.shift === '08-18') shiftLabel = '08:00 às 18:00';
        else if (state.shift === '09-19') shiftLabel = '09:00 às 19:00';
        // compatibilidade com valores antigos
        else if (state.shift === '1') shiftLabel = '1º Turno (06:00 - 14:00)';
        else if (state.shift === '2') shiftLabel = '2º Turno (14:00 - 22:00)';
        else if (state.shift === '3') shiftLabel = '3º Turno (22:00 - 06:00)';
        else if (state.shift === 'comercial') shiftLabel = 'Horário Comercial (08:00 - 18:00)';

        let statusLabel = 'OPERACIONAL';
        let statusColor = '#00ff87';
        let statusIcon = '●';
        if (state.overallStatus === 'warning') {
            statusLabel = 'ATENÇÃO';
            statusColor = '#ffb800';
            statusIcon = '▲';
        } else if (state.overallStatus === 'critical') {
            statusLabel = 'CRÍTICO';
            statusColor = '#ff4b2b';
            statusIcon = '◆';
        }

        // Construir logo HTML
        const logoHtml = logoBase64
            ? `<img src="${logoBase64}" style="width:130px; height:38px; object-fit:contain; display:block;" alt="NOC Logo">`
            : `<div style="width:52px; height:52px; background:#0a142d; border:1px solid #00f2fe; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#00f2fe; font-weight:bold; font-size:16px;">NOC</div>`;

        // Mapear categorias para labels e cores (tema escuro)
        const categoryConfig = {
            monitoramento: { label: 'Monitoramento', bg: 'rgba(0, 242, 254, 0.15)',   color: '#00f2fe', border: 'rgba(0, 242, 254, 0.3)' },
            suporte:       { label: 'Suporte',       bg: 'rgba(79, 172, 254, 0.15)',  color: '#4facfe', border: 'rgba(79, 172, 254, 0.3)' },
            n3:            { label: 'N3',            bg: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa', border: 'rgba(167, 139, 250, 0.3)' },
            rotina:        { label: 'Rotina',        bg: 'rgba(0, 255, 135, 0.15)',   color: '#00ff87', border: 'rgba(0, 255, 135, 0.3)' },
            flow:          { label: 'Flow',          bg: 'rgba(255, 184, 0, 0.15)',   color: '#ffb800', border: 'rgba(255, 184, 0, 0.3)' }
        };
        const catDefault = { label: 'Outro', bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: 'rgba(148,163,184,0.3)' };

        // Mapear status para label, cor e ícone
        const statusConfig = {
            'concluido':     { label: 'Concluído',    icon: '✓', color: '#00ff87' },
            'em-andamento':  { label: 'Em Andamento', icon: '↻', color: '#ffb800' },
            'pendente':      { label: 'Pendente',     icon: '■', color: '#ff4b2b' }
        };

        // Construir linhas da tabela com TODAS as atividades
        let tableRowsHtml = '';
        if (allActivities.length === 0) {
            tableRowsHtml = `
                <tr>
                    <td colspan="4" style="text-align:center; padding:30px 16px; color:#cbd5e1; font-style:italic; font-size:10pt;">
                        Nenhuma atividade registrada neste turno.
                    </td>
                </tr>
            `;
        } else {
            allActivities.forEach((act, index) => {
                const cat = categoryConfig[act.category] || catDefault;
                const sts = statusConfig[act.status] || { label: act.status || '-', icon: '', color: '#94a3b8' };
                const rowBg = index % 2 === 0 ? 'rgba(6, 15, 38, 0.65)' : 'rgba(10, 20, 45, 0.5)';
                tableRowsHtml += `
                    <tr style="background-color:${rowBg};">
                        <td style="padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.08); font-family:'JetBrains Mono','Courier New',monospace; font-size:10pt; color:#00f2fe; font-weight:600; white-space:nowrap;">
                            ${escapeHTML(act.time || '--:--')}
                        </td>
                        <td style="padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.08);">
                            <span style="display:inline-block; padding:3px 10px; border-radius:4px; font-size:8pt; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; background:${cat.bg}; color:${cat.color}; border:1px solid ${cat.border};">
                                ${cat.label}
                            </span>
                        </td>
                        <td style="padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.08); font-size:10pt; color:#ffffff; line-height:1.4;">
                            ${escapeHTML(act.description || '')}
                        </td>
                        <td style="padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.08); font-size:9pt; color:${sts.color}; font-weight:600; white-space:nowrap;">
                            ${sts.icon} ${sts.label}
                        </td>
                    </tr>
                `;
            });
        }

        // Construir cards de estatísticas
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

        // HTML completo do template
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
                        <span style="font-size:28pt; font-weight:800; color:#ffffff;">${allActivities.length}</span>
                        <span style="font-size:10pt; color:#cbd5e1; margin-left:8px;">atividade${allActivities.length !== 1 ? 's' : ''} registrada${allActivities.length !== 1 ? 's' : ''} neste turno</span>
                    </div>
                    <table style="width:100%; border-collapse:collapse;">
                        <tr>
                            ${buildStatCard('Monitoramento', stats.monitoramento, '#00f2fe')}
                            ${buildStatCard('Suporte', stats.suporte, '#4facfe')}
                            ${buildStatCard('N3', stats.n3, '#a78bfa')}
                            ${buildStatCard('Rotina', stats.rotina, '#00ff87')}
                            ${buildStatCard('Flow', stats.flow, '#ffb800')}
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

    /**
     * Função principal de exportação para PDF.
     * Cria um template HTML dedicado, renderiza fora da tela, e pós-processa com jsPDF.
     */
    async function exportToPDF() {
        if (typeof html2pdf === 'undefined') {
            alert("A biblioteca de geração de PDF (html2pdf.js) não foi carregada.\n\n" +
                  "Verifique se você está conectado à Internet para baixar a biblioteca via CDN, " +
                  "ou se extensões como AdBlockers estão bloqueando o script CDN da cdnjs.");
            return;
        }

        // Validar turno obrigatório
        if (!appState.shift) {
            alert('Por favor, selecione o Turno de Trabalho antes de exportar o PDF.');
            if (selectNocShift) selectNocShift.focus();
            return;
        }

        // Feedback visual: mudar o botão para "Gerando..."
        const originalBtnText = btnExportPdf.innerHTML;
        btnExportPdf.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando PDF...';
        btnExportPdf.disabled = true;

        try {
            // 1. Converter logo e fundo em Base64
            const [logoBase64, fundoBase64] = await Promise.all([
                getLogoBase64(),
                getFundoBase64()
            ]);

            // 2. Construir o HTML do template
            const templateHtml = buildPdfHtml(logoBase64, fundoBase64);

            // 3. Criar container temporário fora da tela
            const pdfContainer = document.createElement('div');
            pdfContainer.className = 'pdf-render-container';
            pdfContainer.innerHTML = templateHtml;
            document.body.appendChild(pdfContainer);

            // 4. Gerar nome do arquivo
            const analystClean = appState.analystName ? appState.analystName.trim().replace(/\s+/g, '_') : 'sem_analista';
            const dateClean = appState.reportDate || 'sem_data';
            let shiftFile = appState.shift ? appState.shift.replace('-', '_') : 'sem_turno';
            const filename = `relatorio_noc_${dateClean}_${shiftFile}_${analystClean}.pdf`;

            // 5. Configurar html2pdf
            const opt = {
                margin:       [20, 10, 22, 10], // top, left, bottom, right (mm) - espaço para header/footer
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#040814',
                    logging: false
                },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            // 6. Gerar PDF com pós-processamento de headers e footers
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

                        // === HEADER (linha fina no topo) ===
                        pdf.setDrawColor(10, 22, 40); // #0a1628
                        pdf.setLineWidth(0.6);
                        pdf.line(10, 14, pageWidth - 10, 14);

                        pdf.setFontSize(7);
                        pdf.setTextColor(100, 116, 139); // #64748b
                        pdf.text('NOC Operational Report', 10, 12);
                        pdf.text(`${dateClean}`, pageWidth - 10, 12, { align: 'right' });

                        // === FOOTER ===
                        // Linha do rodapé
                        pdf.setDrawColor(226, 232, 240); // #e2e8f0
                        pdf.setLineWidth(0.3);
                        pdf.line(10, pageHeight - 16, pageWidth - 10, pageHeight - 16);

                        // Número da página (centralizado)
                        pdf.setFontSize(8);
                        pdf.setTextColor(100, 116, 139);
                        pdf.text(
                            `Página ${i} de ${totalPages}`,
                            pageWidth / 2,
                            pageHeight - 11,
                            { align: 'center' }
                        );

                        // Timestamp de geração (direita)
                        pdf.setFontSize(6.5);
                        pdf.setTextColor(148, 163, 184); // #94a3b8
                        pdf.text(`Gerado em ${generationTimestamp}`, pageWidth - 10, pageHeight - 7, { align: 'right' });

                        // Aviso de confidencialidade (esquerda)
                        pdf.text('DOCUMENTO INTERNO — NOC Report System', 10, pageHeight - 7);
                    }
                })
                .save();

            // 7. Limpar container temporário
            document.body.removeChild(pdfContainer);

        } catch (err) {
            console.error("Erro ao gerar PDF:", err);
            
            // Limpar container se existir
            const leftover = document.querySelector('.pdf-render-container');
            if (leftover) document.body.removeChild(leftover);

            let errorMsg = "Ocorreu um erro ao exportar o PDF.\n\n";
            if (window.location.protocol === 'file:') {
                errorMsg += "Dica: Você abriu o arquivo HTML diretamente do disco (protocolo file://).\n" +
                            "Alguns navegadores bloqueiam a renderização de elementos de canvas sob este protocolo.\n" +
                            "Por favor, use um servidor local (ex: 'npx http-server') ou utilize Ctrl+P para 'Salvar como PDF'.";
            } else {
                errorMsg += "Por favor, tente novamente ou verifique o console do desenvolvedor para mais detalhes.";
            }
            alert(errorMsg);
        } finally {
            // Restaurar botão
            btnExportPdf.innerHTML = originalBtnText;
            btnExportPdf.disabled = false;
        }
    }

    // --- FUNÇÕES UTILITÁRIAS ---
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});