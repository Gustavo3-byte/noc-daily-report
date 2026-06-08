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

    // --- QUALIDADE DE RENDERIZAÇÃO DO PDF ---
    // Fator de super-amostragem da captura (html2canvas). Quanto maior, mais
    // nítido o texto/painéis no PDF. 3 = alta qualidade com custo razoável.
    const PDF_CAPTURE_SCALE = 3;

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
            if (act.category === 'monitoramento') categoryText = 'Monitoramento';
            else if (act.category === 'suporte') categoryText = 'Suporte';
            else if (act.category === 'n3') categoryText = 'N3';
            else if (act.category === 'rotina') categoryText = 'Rotina';
            else if (act.category === 'flow') categoryText = 'Flow';

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
        const rawDate = report.report_date || report.reportDate || appState.reportDate;
        appState.reportDate = rawDate ? rawDate.toString().substring(0, 10) : appState.reportDate;
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

        const rawPdfDate = report.report_date || report.reportDate || '';
        const pdfState = {
            analystName: appState.analystName,
            reportDate: rawPdfDate ? rawPdfDate.toString().substring(0, 10) : '',
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
            pdfContainer.style.cssText = [
                'position:fixed',
                'top:0',
                'left:0',
                'width:794px',
                'min-height:100vh',
                'z-index:99999',
                'background:transparent',
                'overflow:visible',
                'pointer-events:none'
            ].join(';');
            pdfContainer.innerHTML = templateHtml;
            document.body.appendChild(pdfContainer);

            // Aguardar renderização completa
            await new Promise(resolve => setTimeout(resolve, 600));

            const analystClean = pdfState.analystName.trim().replace(/\s+/g, '_') || 'sem_analista';
            const dateClean = pdfState.reportDate || 'sem_data';
            let shiftFile = pdfState.shift ? pdfState.shift.replace('-', '_') : 'sem_turno';
            const filename = `relatorio_noc_${dateClean}_${shiftFile}_${analystClean}.pdf`;

            const opt = {
                margin: [20, 10, 22, 10],
                filename: filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: null,
                    logging: false,
                    windowWidth: 794,
                    scrollX: 0,
                    scrollY: 0
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            const generationTimestamp = new Date().toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            const canvas2 = await html2canvas(pdfContainer, {
                scale: PDF_CAPTURE_SCALE,
                useCORS: true,
                backgroundColor: null,
                logging: false,
                windowWidth: 794,
                scrollX: 0,
                scrollY: 0,
                width: pdfContainer.scrollWidth,
                height: pdfContainer.scrollHeight
            });

            document.body.removeChild(pdfContainer);

            const jsPDFClass2 = window.jspdf ? window.jspdf.jsPDF : jsPDF;
            const pdfDoc2 = new jsPDFClass2({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

            const pageW2 = pdfDoc2.internal.pageSize.getWidth();
            const pageH2 = pdfDoc2.internal.pageSize.getHeight();
            const mTop2 = 10, mBot2 = 10, usable2 = pageH2 - mTop2 - mBot2;
            const scale2 = pageW2 / (canvas2.width / PDF_CAPTURE_SCALE);
            const totalH2 = (canvas2.height / PDF_CAPTURE_SCALE) * scale2;
            const totalPages2 = Math.ceil(totalH2 / usable2);

            for (let p2 = 0; p2 < totalPages2; p2++) {
                if (p2 > 0) pdfDoc2.addPage();

                if (fundoBase64) {
                    pdfDoc2.addImage(fundoBase64, 'PNG', 0, 0, pageW2, pageH2);
                } else {
                    pdfDoc2.setFillColor(4, 8, 20);
                    pdfDoc2.rect(0, 0, pageW2, pageH2, 'F');
                }

                const srcY2mm = p2 * usable2;
                const srcY2px = Math.round(srcY2mm / scale2 * PDF_CAPTURE_SCALE);
                const sliceH2mm = Math.min(usable2, totalH2 - srcY2mm);
                const sliceH2px = Math.round(sliceH2mm / scale2 * PDF_CAPTURE_SCALE);

                if (sliceH2px > 0) {
                    const sc2 = document.createElement('canvas');
                    sc2.width = canvas2.width;
                    sc2.height = sliceH2px;
                    sc2.getContext('2d').drawImage(canvas2, 0, srcY2px, canvas2.width, sliceH2px, 0, 0, canvas2.width, sliceH2px);
                    pdfDoc2.addImage(sc2.toDataURL('image/png'), 'PNG', 0, mTop2, pageW2, sliceH2mm);
                }

                // Cabeçalho removido — sem faixa nem textos no topo.
                // Rodapé removido — sem faixa, número de página ou créditos.
                // A arte de fundo aparece inteira em toda a página.
            }

            pdfDoc2.save(filename);
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

        // Fundo TRANSPARENTE: o fundo institucional é desenhado pelo jsPDF
        // por página (addImage 0,0,pageW,pageH), então o conteúdo não deve
        // pintar um fundo opaco nem carregar a arte para dentro do recorte.
        const bgStyle = `background: transparent;`;

        // HTML completo do template
        return `
            <div style="font-family:'Segoe UI', Arial, Helvetica, sans-serif; color:#ffffff; ${bgStyle} padding:24px; margin:0; width:100%; box-sizing:border-box;">
                
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

            // 3. Criar container visível para o html2canvas capturar corretamente
            const pdfContainer = document.createElement('div');
            pdfContainer.style.cssText = [
                'position:fixed',
                'top:0',
                'left:0',
                'width:794px',
                'min-height:100vh',
                'z-index:99999',
                'background:transparent',
                'overflow:visible',
                'pointer-events:none'
            ].join(';');
            pdfContainer.innerHTML = templateHtml;
            document.body.appendChild(pdfContainer);

            // Aguardar renderização completa antes de capturar
            await new Promise(resolve => setTimeout(resolve, 600));

            // 4. Gerar nome do arquivo
            const analystClean = appState.analystName ? appState.analystName.trim().replace(/\s+/g, '_') : 'sem_analista';
            const dateClean = appState.reportDate || 'sem_data';
            let shiftFile = appState.shift ? appState.shift.replace('-', '_') : 'sem_turno';
            const filename = `relatorio_noc_${dateClean}_${shiftFile}_${analystClean}.pdf`;

            // 5. Configurar html2pdf
            const opt = {
                margin:       [20, 10, 22, 10],
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: null,
                    logging: false,
                    windowWidth: 794,
                    scrollX: 0,
                    scrollY: 0
                },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            // 6. Gerar PDF com pós-processamento de headers e footers
            const generationTimestamp = new Date().toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            // Capturar o container inteiro como canvas
            const canvas = await html2canvas(pdfContainer, {
                scale: PDF_CAPTURE_SCALE,
                useCORS: true,
                backgroundColor: null,
                logging: false,
                windowWidth: 794,
                scrollX: 0,
                scrollY: 0,
                width: pdfContainer.scrollWidth,
                height: pdfContainer.scrollHeight
            });

            // Remover container da tela imediatamente após captura
            document.body.removeChild(pdfContainer);

            // Montar PDF com fundo repetido e conteúdo sem cortes
            const jsPDFClass = window.jspdf ? window.jspdf.jsPDF : jsPDF;
            const pdfDoc = new jsPDFClass({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

            const pageW = pdfDoc.internal.pageSize.getWidth();   // 210mm
            const pageH = pdfDoc.internal.pageSize.getHeight();  // 297mm
            const marginTop = 10;    // mm — margem superior limpa (sem cabeçalho)
            const marginBot = 10;    // mm — margem inferior limpa (sem rodapé)
            const marginSide = 0;    // sem margem lateral — imagem preenche tudo
            const contentW = pageW;  // largura total da página
            const usable = pageH - marginTop - marginBot; // altura útil por página em mm

            // Calcular altura total do conteúdo em mm
            const scale = contentW / (canvas.width / PDF_CAPTURE_SCALE); // px → mm
            const totalContentH = (canvas.height / PDF_CAPTURE_SCALE) * scale; // altura total em mm
            const totalPages = Math.ceil(totalContentH / usable);

            // Pré-gerar imagem de fundo se disponível
            const bgImg = fundoBase64 || null;

            for (let p = 0; p < totalPages; p++) {
                if (p > 0) pdfDoc.addPage();

                // 1. Fundo — preenche a página inteira
                if (bgImg) {
                    pdfDoc.addImage(bgImg, 'PNG', 0, 0, pageW, pageH);
                } else {
                    // Fallback: retângulo sólido escuro
                    pdfDoc.setFillColor(4, 8, 20);
                    pdfDoc.rect(0, 0, pageW, pageH, 'F');
                }

                // 2. Fatia do conteúdo para esta página
                const srcYmm = p * usable;                  // posição Y em mm no conteúdo total
                const srcYpx = Math.round(srcYmm / scale * PDF_CAPTURE_SCALE); // converter para px do canvas
                const sliceHmm = Math.min(usable, totalContentH - srcYmm);
                const sliceHpx = Math.round(sliceHmm / scale * PDF_CAPTURE_SCALE);

                if (sliceHpx > 0) {
                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = canvas.width;
                    sliceCanvas.height = sliceHpx;
                    const ctx = sliceCanvas.getContext('2d');
                    ctx.drawImage(canvas, 0, srcYpx, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx);
                    const sliceData = sliceCanvas.toDataURL('image/png');
                    pdfDoc.addImage(sliceData, 'PNG', marginSide, marginTop, contentW, sliceHmm);
                }

                // 3. Cabeçalho removido — sem faixa nem textos no topo.
                // 4. Rodapé removido — sem faixa, número de página ou créditos.
                // A arte de fundo aparece inteira em toda a página.
            }

            pdfDoc.save(filename);

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

    // =========================================================================
    // RESUMO SEMANAL
    // =========================================================================

    const modalWeekly        = document.getElementById('modal-weekly-report');
    const btnWeeklyReport    = document.getElementById('btn-weekly-report');
    const btnCloseWeekly     = document.getElementById('btn-close-weekly-modal');
    const btnWeekPrev        = document.getElementById('btn-week-prev');
    const btnWeekNext        = document.getElementById('btn-week-next');
    const weeklyRangeLabel   = document.getElementById('weekly-range-label');
    const btnExportWeeklyPdf = document.getElementById('btn-export-weekly-pdf');
    const btnRegenerateAi    = document.getElementById('btn-regenerate-ai');

    let weeklyCurrentMonday = getMonday(new Date());
    let weeklyReports       = [];
    let weeklyPieChart      = null;

    // Verificar se os elementos existem antes de registrar listeners
    if (!btnWeeklyReport || !modalWeekly) {
        console.warn('[Resumo Semanal] Elementos não encontrados no DOM. Modal desabilitado.');
    } else {
        // Abre modal
        btnWeeklyReport.addEventListener('click', () => {
            weeklyCurrentMonday = getMonday(new Date());
            modalWeekly.style.display = 'flex';
            loadWeeklyData();
        });

        // Fecha modal
        if (btnCloseWeekly) btnCloseWeekly.addEventListener('click', () => { modalWeekly.style.display = 'none'; });
        modalWeekly.addEventListener('click', e => { if (e.target === modalWeekly) modalWeekly.style.display = 'none'; });

        // Navegar semanas
        if (btnWeekPrev) btnWeekPrev.addEventListener('click', () => {
            weeklyCurrentMonday = new Date(weeklyCurrentMonday);
            weeklyCurrentMonday.setDate(weeklyCurrentMonday.getDate() - 7);
            loadWeeklyData();
        });
        if (btnWeekNext) btnWeekNext.addEventListener('click', () => {
            weeklyCurrentMonday = new Date(weeklyCurrentMonday);
            weeklyCurrentMonday.setDate(weeklyCurrentMonday.getDate() + 7);
            loadWeeklyData();
        });

        // Regenerar resumo
        if (btnRegenerateAi) btnRegenerateAi.addEventListener('click', () => generateWeeklyAI(weeklyReports));

        // Exportar PDF semanal
        if (btnExportWeeklyPdf) btnExportWeeklyPdf.addEventListener('click', exportWeeklyPDF);
    }

    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function formatDateBR(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('pt-BR');
    }

    async function loadWeeklyData() {
        // Calcular range da semana
        const monday = new Date(weeklyCurrentMonday);
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);

        weeklyRangeLabel.textContent = `${monday.toLocaleDateString('pt-BR')} — ${sunday.toLocaleDateString('pt-BR')}`;

        // Buscar todos os relatórios
        try {
            const res = await fetch('/api/reports', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('Falha');
            const data = await res.json();
            const all = data.reports || [];

            // Filtrar pela semana
            weeklyReports = all.filter(r => {
                const raw = r.report_date || r.reportDate || '';
                const dateStr = raw.toString().substring(0, 10);
                if (!dateStr) return false;
                const d = new Date(dateStr + 'T12:00:00');
                return d >= monday && d <= sunday;
            });

            renderWeeklyData(weeklyReports);
            generateWeeklyAI(weeklyReports);

        } catch (err) {
            console.error('Erro ao carregar dados semanais:', err);
        }
    }

    function renderWeeklyData(reports) {
        // Agregar atividades
        let total = 0, concluido = 0, andamento = 0, pendente = 0;
        const catCount = { monitoramento: 0, suporte: 0, n3: 0, rotina: 0, flow: 0 };

        reports.forEach(r => {
            const acts = r.activities || [];
            acts.forEach(a => {
                total++;
                const s = (a.status || '').toLowerCase();
                if (s === 'concluido' || s === 'concluído') concluido++;
                else if (s === 'em-andamento' || s === 'em andamento') andamento++;
                else pendente++;

                const cat = (a.category || a.categoria || '').toLowerCase();
                if (catCount[cat] !== undefined) catCount[cat]++;
                else catCount['rotina']++;
            });
        });

        // Cards
        document.getElementById('wsc-total').textContent      = total;
        document.getElementById('wsc-concluido').textContent  = concluido;
        document.getElementById('wsc-andamento').textContent  = andamento;
        document.getElementById('wsc-pendente').textContent   = pendente;
        document.getElementById('wsc-relatorios').textContent = reports.length;

        // Gráfico pizza
        drawPieChart(catCount, total);

        // Tabela
        const tbody = document.getElementById('weekly-reports-tbody');
        if (reports.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><i class="fa-solid fa-folder-open"></i> Nenhum relatório nesta semana.</td></tr>`;
            return;
        }
        tbody.innerHTML = '';
        reports.forEach(r => {
            const dateStr = (r.report_date || r.reportDate || '').toString().substring(0, 10);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-mono">${formatDateBR(dateStr)}</td>
                <td>${escapeHTML(getShiftLabel(r.shift))}</td>
                <td>${getStatusBadgeHtml(r.overall_status || r.overallStatus || 'normal')}</td>
                <td class="font-mono">${(r.activities || []).length}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    const CAT_COLORS = {
        monitoramento: '#00f2fe',
        suporte:       '#4facfe',
        n3:            '#a855f7',
        rotina:        '#34d399',
        flow:          '#fbbf24',
    };
    const CAT_LABELS = {
        monitoramento: 'Monitoramento',
        suporte:       'Suporte',
        n3:            'N3',
        rotina:        'Rotina',
        flow:          'Flow',
    };

    function drawPieChart(catCount, total) {
        const canvas = document.getElementById('weekly-pie-chart');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const categories = Object.keys(catCount).filter(k => catCount[k] > 0);
        const legend = document.getElementById('weekly-pie-legend');
        legend.innerHTML = '';

        if (total === 0 || categories.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.beginPath();
            ctx.arc(140, 140, 110, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '14px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('Sem dados', 140, 148);
            return;
        }

        const cx = 140, cy = 140, r = 110, rInner = 58;
        let startAngle = -Math.PI / 2;

        categories.forEach(cat => {
            const slice = (catCount[cat] / total) * Math.PI * 2;
            const color = CAT_COLORS[cat] || '#64748b';

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + slice);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            // Borda
            ctx.strokeStyle = '#040814';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Percentual no slice
            if (slice > 0.3) {
                const midAngle = startAngle + slice / 2;
                const tx = cx + (r * 0.68) * Math.cos(midAngle);
                const ty = cy + (r * 0.68) * Math.sin(midAngle);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 11px Inter';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${Math.round((catCount[cat] / total) * 100)}%`, tx, ty);
            }

            startAngle += slice;

            // Legenda
            const item = document.createElement('div');
            item.className = 'weekly-legend-item';
            item.innerHTML = `
                <span class="weekly-legend-dot" style="background:${color}"></span>
                <span class="weekly-legend-label">${CAT_LABELS[cat]}</span>
                <span class="weekly-legend-count">${catCount[cat]}</span>
            `;
            legend.appendChild(item);
        });

        // Buraco central (donut)
        ctx.beginPath();
        ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
        ctx.fillStyle = '#080d1a';
        ctx.fill();

        // Texto central
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 28px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total, cx, cy - 8);
        ctx.font = '11px Inter';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('atividades', cx, cy + 14);
    }

    function generateWeeklyAI(reports) {
        const loadingEl = document.getElementById('weekly-ai-loading');
        const resultEl  = document.getElementById('weekly-ai-result');
        if (!loadingEl || !resultEl) return; // elementos do modal ainda não existem
        if (btnRegenerateAi) btnRegenerateAi.style.display = 'none';
        loadingEl.classList.remove('hidden');
        resultEl.classList.add('hidden');
        resultEl.innerHTML = '';

        if (reports.length === 0) {
            loadingEl.classList.add('hidden');
            resultEl.classList.remove('hidden');
            resultEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Nenhum dado encontrado para esta semana.</p>';
            btnRegenerateAi.style.display = 'block';
            return;
        }

        // Coletar e analisar dados
        let total = 0, concluido = 0, andamento = 0, pendente = 0;
        const catCount = { monitoramento: 0, suporte: 0, n3: 0, rotina: 0, flow: 0 };
        const pendingItems = [];
        const andamentoItems = [];
        const daySet = new Set();

        reports.forEach(r => {
            const dateStr = (r.report_date || r.reportDate || '').toString().substring(0, 10);
            if (dateStr) daySet.add(dateStr);
            (r.activities || []).forEach(a => {
                total++;
                const s = (a.status || '').toLowerCase();
                const cat = (a.category || '').toLowerCase();
                if (catCount[cat] !== undefined) catCount[cat]++;

                if (s === 'concluido' || s === 'concluído') {
                    concluido++;
                } else if (s === 'em-andamento' || s === 'em andamento') {
                    andamento++;
                    andamentoItems.push({ desc: a.description || '', cat: CAT_LABELS[cat] || cat, date: formatDateBR(dateStr) });
                } else {
                    pendente++;
                    pendingItems.push({ desc: a.description || '', cat: CAT_LABELS[cat] || cat, date: formatDateBR(dateStr) });
                }
            });
        });

        const taxaConclusao = total > 0 ? Math.round((concluido / total) * 100) : 0;
        const diasAtivos = daySet.size;

        // Ordenar categorias por quantidade (maior primeiro)
        const catOrdenadas = Object.entries(catCount)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);

        const categoriaPrincipal = catOrdenadas.length > 0 ? CAT_LABELS[catOrdenadas[0][0]] : 'N/A';
        const categoriaSegunda = catOrdenadas.length > 1 ? CAT_LABELS[catOrdenadas[1][0]] : null;

        // Avaliação de desempenho
        let avaliacao = '', avaliacaoClass = '';
        if (taxaConclusao >= 90) { avaliacao = 'Excelente'; avaliacaoClass = 'color:#00ff87;'; }
        else if (taxaConclusao >= 70) { avaliacao = 'Bom'; avaliacaoClass = 'color:#00f2fe;'; }
        else if (taxaConclusao >= 50) { avaliacao = 'Regular'; avaliacaoClass = 'color:#ffb800;'; }
        else { avaliacao = 'Requer Atenção'; avaliacaoClass = 'color:#ff4b2b;'; }

        // ---- CONSTRUIR HTML DO RESUMO ----
        let html = '';

        // 1. Visão Geral
        html += `<p><strong style="color:#00f2fe;">📋 Visão Geral</strong></p>`;
        html += `<p>Durante a semana, foram registradas <strong>${total} atividade${total !== 1 ? 's' : ''}</strong> em <strong>${reports.length} relatório${reports.length !== 1 ? 's' : ''}</strong>, cobrindo <strong>${diasAtivos} dia${diasAtivos !== 1 ? 's' : ''}</strong> de operação. `;
        html += `A taxa de conclusão foi de <strong style="${avaliacaoClass}">${taxaConclusao}%</strong> (${concluido} de ${total}), classificando o desempenho da semana como <strong style="${avaliacaoClass}">${avaliacao}</strong>.`;
        if (andamento > 0) html += ` Há ${andamento} atividade${andamento !== 1 ? 's' : ''} em andamento.`;
        if (pendente > 0) html += ` ${pendente} atividade${pendente !== 1 ? 's permanecem' : ' permanece'} pendente${pendente !== 1 ? 's' : ''}.`;
        html += `</p>`;

        // 2. Principais Focos
        html += `<p style="margin-top:16px;"><strong style="color:#00f2fe;">🎯 Principais Focos</strong></p><ul>`;
        if (catOrdenadas.length === 0) {
            html += `<li>Nenhuma atividade categorizada nesta semana.</li>`;
        } else {
            catOrdenadas.forEach(([key, count]) => {
                const pct = Math.round((count / total) * 100);
                html += `<li><strong>${CAT_LABELS[key]}</strong> — ${count} atividade${count !== 1 ? 's' : ''} (${pct}% do total)</li>`;
            });
        }
        html += `</ul>`;
        if (categoriaPrincipal !== 'N/A') {
            html += `<p>O foco principal da semana foi em <strong>${categoriaPrincipal}</strong>`;
            if (categoriaSegunda) html += `, seguido por <strong>${categoriaSegunda}</strong>`;
            html += `.</p>`;
        }

        // 3. Pontos de Atenção
        html += `<p style="margin-top:16px;"><strong style="color:#00f2fe;">⚠️ Pontos de Atenção</strong></p>`;
        if (pendingItems.length === 0 && andamentoItems.length === 0) {
            html += `<p style="color:#00ff87;">✓ Não há atividades pendentes ou em andamento. Excelente desempenho!</p>`;
        } else {
            html += `<ul>`;
            if (pendingItems.length > 0) {
                html += `<li style="color:#ff4b2b;"><strong>${pendingItems.length} atividade${pendingItems.length !== 1 ? 's' : ''} pendente${pendingItems.length !== 1 ? 's' : ''}:</strong></li>`;
                pendingItems.slice(0, 5).forEach(item => {
                    html += `<li style="margin-left:12px;">⏳ [${item.cat}] ${escapeHTML(item.desc.substring(0, 80))}${item.desc.length > 80 ? '...' : ''} <span style="opacity:0.5">(${item.date})</span></li>`;
                });
                if (pendingItems.length > 5) html += `<li style="margin-left:12px;opacity:0.6;">... e mais ${pendingItems.length - 5} pendente(s)</li>`;
            }
            if (andamentoItems.length > 0) {
                html += `<li style="color:#ffb800;margin-top:8px;"><strong>${andamentoItems.length} atividade${andamentoItems.length !== 1 ? 's' : ''} em andamento:</strong></li>`;
                andamentoItems.slice(0, 5).forEach(item => {
                    html += `<li style="margin-left:12px;">↻ [${item.cat}] ${escapeHTML(item.desc.substring(0, 80))}${item.desc.length > 80 ? '...' : ''} <span style="opacity:0.5">(${item.date})</span></li>`;
                });
                if (andamentoItems.length > 5) html += `<li style="margin-left:12px;opacity:0.6;">... e mais ${andamentoItems.length - 5} em andamento</li>`;
            }
            html += `</ul>`;
        }

        // 4. Conclusão
        html += `<p style="margin-top:16px;"><strong style="color:#00f2fe;">📊 Conclusão</strong></p>`;
        if (taxaConclusao >= 90) {
            html += `<p>A semana apresentou um desempenho <strong style="color:#00ff87;">excelente</strong>, com ${taxaConclusao}% de taxa de conclusão. A equipe demonstrou alta eficiência operacional e boa gestão das demandas.</p>`;
        } else if (taxaConclusao >= 70) {
            html += `<p>A semana teve um desempenho <strong style="color:#00f2fe;">positivo</strong>, com ${taxaConclusao}% de conclusão. Recomenda-se acompanhar as ${andamento + pendente} atividade${(andamento + pendente) !== 1 ? 's' : ''} restante${(andamento + pendente) !== 1 ? 's' : ''} para garantir a finalização.</p>`;
        } else if (taxaConclusao >= 50) {
            html += `<p>A semana apresentou desempenho <strong style="color:#ffb800;">regular</strong>, com ${taxaConclusao}% de conclusão. É necessário priorizar as atividades pendentes e em andamento na próxima semana para melhorar a performance.</p>`;
        } else {
            html += `<p>A semana requer <strong style="color:#ff4b2b;">atenção especial</strong> — apenas ${taxaConclusao}% das atividades foram concluídas. Recomenda-se uma revisão de prioridades e redistribuição de tarefas para a próxima semana.</p>`;
        }

        // Renderizar
        loadingEl.classList.add('hidden');
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = html;
        if (btnRegenerateAi) btnRegenerateAi.style.display = 'block';
    }

    function exportWeeklyPDF() {
        if (!btnExportWeeklyPdf) return;
        const originalText = btnExportWeeklyPdf.innerHTML;
        btnExportWeeklyPdf.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';
        btnExportWeeklyPdf.disabled = true;

        try {
            const monday = new Date(weeklyCurrentMonday);
            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() + 6);
            const rangeText = `${monday.toLocaleDateString('pt-BR')} a ${sunday.toLocaleDateString('pt-BR')}`;
            const mondayStr = monday.toLocaleDateString('pt-BR').replace(/\//g, '-');

            // Agregar dados
            let total = 0, concluido = 0, andamento = 0, pendente = 0;
            const catCount = { monitoramento: 0, suporte: 0, n3: 0, rotina: 0, flow: 0 };
            weeklyReports.forEach(r => {
                (r.activities || []).forEach(a => {
                    total++;
                    const s = (a.status || '').toLowerCase();
                    if (s.includes('conclu')) concluido++;
                    else if (s.includes('andamento')) andamento++;
                    else pendente++;
                    const cat = (a.category || a.categoria || '').toLowerCase();
                    if (catCount[cat] !== undefined) catCount[cat]++;
                    else catCount['rotina']++;
                });
            });

            const aiText = document.getElementById('weekly-ai-result')?.innerHTML || 'Resumo não disponível.';
            const taxaConclusao = total > 0 ? Math.round((concluido / total) * 100) : 0;

            // Gerar linhas da tabela de categorias
            const catRows = Object.keys(catCount)
                .filter(k => catCount[k] > 0)
                .map(k => `<tr><td>${CAT_LABELS[k]}</td><td style="text-align:center;font-weight:700;color:${CAT_COLORS[k]}">${catCount[k]}</td><td style="text-align:center">${total > 0 ? Math.round((catCount[k]/total)*100) : 0}%</td></tr>`)
                .join('');

            // Gerar linhas da tabela de relatórios
            const reportRows = weeklyReports.map(r => {
                const dateStr = (r.report_date || r.reportDate || '').toString().substring(0, 10);
                const st = r.overall_status || r.overallStatus || 'normal';
                const stColor = st === 'critical' ? '#ff4b2b' : st === 'warning' ? '#ffb800' : '#00ff87';
                const stLabel = st === 'critical' ? '◆ CRÍTICO' : st === 'warning' ? '▲ ATENÇÃO' : '● OPERACIONAL';
                return `<tr>
                    <td>${formatDateBR(dateStr)}</td>
                    <td>${getShiftLabel(r.shift)}</td>
                    <td style="color:${stColor};font-weight:600">${stLabel}</td>
                    <td style="text-align:center">${(r.activities||[]).length}</td>
                </tr>`;
            }).join('');

            // Determinar cor/texto do desempenho
            const perfColor = taxaConclusao >= 90 ? '#00ff87' : taxaConclusao >= 70 ? '#00f2fe' : taxaConclusao >= 50 ? '#ffb800' : '#ff4b2b';
            const perfLabel = taxaConclusao >= 90 ? 'EXCELENTE' : taxaConclusao >= 70 ? 'BOM' : taxaConclusao >= 50 ? 'REGULAR' : 'ATENÇÃO';

            const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Resumo Semanal NOC - ${rangeText}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background: #040814; color: #e8eaf0; padding: 32px; min-height: 100vh; }
  /* HEADER */
  .header { background: linear-gradient(135deg, #0a1628 0%, #0d2244 100%); border: 1px solid rgba(0,242,254,0.25); border-left: 4px solid #00f2fe; border-radius: 12px; padding: 28px 32px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .header-left h1 { font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; margin-bottom: 4px; }
  .header-left .sub { font-size: 11px; color: #00f2fe; letter-spacing: 2px; text-transform: uppercase; }
  .header-right { text-align: right; }
  .header-right .range { font-size: 13px; color: rgba(255,255,255,0.7); font-weight: 600; }
  .perf-badge { display: inline-block; background: ${perfColor}22; border: 1px solid ${perfColor}; border-radius: 6px; padding: 6px 14px; margin-top: 8px; }
  .perf-badge span { color: ${perfColor}; font-weight: 700; font-size: 12px; letter-spacing: 1px; }
  /* CARDS */
  .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
  .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px 12px; text-align: center; }
  .card .val { font-size: 28px; font-weight: 800; line-height: 1; margin-bottom: 6px; }
  .card .lbl { font-size: 10px; color: rgba(255,255,255,0.45); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  /* SECTIONS */
  .section { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; }
  .section-title { font-size: 11px; font-weight: 700; color: #00f2fe; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  /* TABLES */
  table { width: 100%; border-collapse: collapse; }
  th { background: rgba(0,242,254,0.06); color: #00f2fe; padding: 9px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; border-bottom: 1px solid rgba(0,242,254,0.15); }
  td { padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); color: rgba(255,255,255,0.8); font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: rgba(255,255,255,0.015); }
  /* AI / RESUMO */
  .ai-section p { line-height: 1.7; margin-bottom: 10px; font-size: 13px; color: rgba(255,255,255,0.8); }
  .ai-section strong { color: #00f2fe; }
  .ai-section ul { padding-left: 18px; margin: 8px 0; }
  .ai-section li { margin-bottom: 5px; font-size: 12px; color: rgba(255,255,255,0.7); line-height: 1.5; }
  /* FOOTER */
  .footer { margin-top: 24px; text-align: center; font-size: 10px; color: rgba(255,255,255,0.25); padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); }
  /* PRINT BUTTON */
  .no-print { text-align: center; margin-top: 28px; }
  .print-btn { background: linear-gradient(135deg, #00f2fe, #4facfe); color: #040814; border: none; border-radius: 8px; padding: 12px 36px; font-size: 14px; font-weight: 700; cursor: pointer; letter-spacing: 0.5px; }
  .print-btn:hover { opacity: 0.9; }
  @media print {
    .no-print { display: none !important; }
    body { padding: 16px; background: #040814 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="sub">NOC — Network Operations Center</div>
    <h1>Resumo Semanal de Atividades</h1>
  </div>
  <div class="header-right">
    <div class="range">📅 ${rangeText}</div>
    <div class="perf-badge"><span>${taxaConclusao}% — ${perfLabel}</span></div>
  </div>
</div>

<div class="cards">
  <div class="card"><div class="val" style="color:#00f2fe">${total}</div><div class="lbl">Total</div></div>
  <div class="card"><div class="val" style="color:#00ff87">${concluido}</div><div class="lbl">Concluídas</div></div>
  <div class="card"><div class="val" style="color:#ffb800">${andamento}</div><div class="lbl">Em Andamento</div></div>
  <div class="card"><div class="val" style="color:#ff4b2b">${pendente}</div><div class="lbl">Pendentes</div></div>
  <div class="card"><div class="val" style="color:#a855f7">${weeklyReports.length}</div><div class="lbl">Relatórios</div></div>
</div>

<div class="section">
  <div class="section-title">📊 Atividades por Categoria</div>
  <table>
    <thead><tr><th>Categoria</th><th style="text-align:center">Quantidade</th><th style="text-align:center">% do Total</th></tr></thead>
    <tbody>${catRows || '<tr><td colspan="3" style="text-align:center;opacity:0.4;padding:20px">Nenhuma atividade registrada</td></tr>'}</tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">📅 Relatórios da Semana</div>
  <table>
    <thead><tr><th>Data</th><th>Turno</th><th>Status do NOC</th><th style="text-align:center">Atividades</th></tr></thead>
    <tbody>${reportRows || '<tr><td colspan="4" style="text-align:center;opacity:0.4;padding:20px">Nenhum relatório nesta semana</td></tr>'}</tbody>
  </table>
</div>

<div class="section ai-section">
  <div class="section-title">📋 Resumo Executivo da Semana</div>
  ${aiText}
</div>

<div class="footer">
  Gerado em ${new Date().toLocaleString('pt-BR')} &nbsp;|&nbsp; NOC Report System &nbsp;|&nbsp; DOCUMENTO INTERNO
</div>

<div class="no-print">
  <button class="print-btn" onclick="window.print()">🖨️ &nbsp;Salvar como PDF / Imprimir</button>
</div>

</body>
</html>`;

            // Usar Blob + link de download para evitar bloqueio de popup
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url  = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href   = url;
            link.target = '_blank';
            link.rel    = 'noopener';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            // Revogar URL após 60s
            setTimeout(() => URL.revokeObjectURL(url), 60000);

        } catch (err) {
            console.error('Erro ao gerar PDF semanal:', err);
            alert('Erro ao gerar o resumo semanal. Verifique o console (F12) para detalhes.');
        } finally {
            if (btnExportWeeklyPdf) {
                btnExportWeeklyPdf.innerHTML = originalText;
                btnExportWeeklyPdf.disabled = false;
            }
        }
    }

});