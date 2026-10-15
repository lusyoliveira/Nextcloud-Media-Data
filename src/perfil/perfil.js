window.addEventListener('DOMContentLoaded', () => {
    renderizarEstatisticasMAL();
    renderizarTopMidias();
    carregarEstatisticas();
    carregarListaPessoal();
});

async function renderizarEstatisticasMAL() {
    const wrapper = document.getElementById('stats-wrapper');
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        Object.keys(data).forEach(tipo => {
            const info = data[tipo];
            const total = info.totalEntries || 1;

            // Frações proporcionais para a linha empilhada
            const pWatch = (info.watching / total) * 100;
            const pComp = (info.completed / total) * 100;
            const pHold = (info.on_hold / total) * 100;
            const pDrop = (info.dropped / total) * 100;
            const pPlan = (info.plan_to_watch / total) * 100;

            const box = document.createElement('div');
            box.className = 'mal-box';
            box.innerHTML =
                '<div class="mal-title">' + tipo + ' Stats</div>' +
                '<div class="mal-meta">' +
                '<div>Dias gastos: <strong>' + info.days + ' d</strong></div>' +
                '<div>Nota Média: <strong>' + (info.meanScore || '0.0') + '</strong></div>' +
                '</div>' +
                '<div class="mal-bar">' +
                '<div class="bar-watch" style="width:' + pWatch + '%"></div>' +
                '<div class="bar-comp" style="width:' + pComp + '%"></div>' +
                '<div class="bar-hold" style="width:' + pHold + '%"></div>' +
                '<div class="bar-drop" style="width:' + pDrop + '%"></div>' +
                '<div class="bar-plan" style="width:' + pPlan + '%"></div>' +
                '</div>' +
                '<div class="mal-row"><div><span class="dot dot-watch"></span><span class="label">Watching</span></div><strong>' + info.watching + '</strong></div>' +
                '<div class="mal-row"><div><span class="dot dot-comp"></span><span class="label">Completed</span></div><strong>' + info.completed + '</strong></div>' +
                '<div class="mal-row"><div><span class="dot dot-hold"></span><span class="label">On-Hold</span></div><strong>' + info.on_hold + '</strong></div>' +
                '<div class="mal-row"><div><span class="dot dot-drop"></span><span class="label">Dropped</span></div><strong>' + info.dropped + '</strong></div>' +
                '<div class="mal-row"><div><span class="dot dot-plan"></span><span class="label">Plan to Watch</span></div><strong>' + info.plan_to_watch + '</strong></div>' +
                '<div class="mal-row" style="margin-top:12px; border-top:1px solid #323238; padding-top:8px;"><span class="label">Total Entries</span><strong>' + info.totalEntries + '</strong></div>' +
                '<div class="mal-row"><span class="label">Reassitidos</span><strong>' + info.rewatched + '</strong></div>' +
                '<div class="mal-row"><span class="label">Episódios Totais</span><strong>' + info.episodes + '</strong></div>';

            wrapper.appendChild(box);
        });
    } catch (e) { wrapper.innerHTML = '<p>Erro ao montar painel MAL.</p>'; }
}

async function renderizarTopMidias() {
    try {
        const response = await fetch('/api/list');
        const data = await response.json();
        if (!data.list) return;

        const targets = { 'Anime': 'top-anime-grid', 'Série': 'top-serie-grid', 'Filme': 'top-filme-grid' };

        Object.keys(targets).forEach(tipo => {
            const gridEl = document.getElementById(targets[tipo]);

            // Ordena do maior pro menor baseado na nova nota numérica
            const filtrados = data.list
                .filter(item => item.type === tipo && item.myRating !== null)
                .sort((a, b) => b.myRating - a.myRating)
                .slice(0, 3);

            if (filtrados.length === 0) {
                gridEl.innerHTML = '<p style="color:#666; font-size:13px; margin: 5px 0;">Nenhuma mídia favoritada com nota.</p>';
                return;
            }

            gridEl.innerHTML = '';
            filtrados.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'top-item';
                div.innerHTML =
                    '<div class="top-rank">#' + (idx + 1) + '</div>' +
                    '<img src="' + item.image + '" alt="">' +
                    '<div class="top-info">' +
                    '<h4>' + item.title + '</h4>' +
                    '<small>Sua Nota: <strong style="color:#ffa500;">⭐ ' + item.myRating + '/10</strong></small><br>' +
                    '<small style="font-size:11px;">Onde viu: ' + item.platform + '</small>' +
                    '</div>';
                gridEl.appendChild(div);
            });
        });
    } catch (e) { console.error(e); }
}

// Função que consome a rota GET /api/stats do Node para alimentar os blocos do topo
async function carregarEstatisticas() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        // Criamos contadores zerados para consolidar o topo da tela
        let totalSalvo = 0;
        let totalWatching = 0;
        let totalCompleted = 0;
        let totalPlan = 0;
        let totalDropped = 0;
        let totalOnHold = 0;

        // Percorre cada tipo de mídia retornado pelo back-end (Anime, Série, Filme) e soma os status
        Object.keys(data).forEach(tipo => {
            const info = data[tipo];
            totalSalvo += info.totalEntries || 0;
            totalWatching += info.watching || 0;
            totalCompleted += info.completed || 0;
            totalPlan += info.plan_to_watch || 0;
            totalDropped += info.dropped || 0;
            totalOnHold += info.on_hold || 0;
        });

        // Injeta as somas consolidadas nos blocos visuais do painel superior
        document.getElementById('stat-total-val').innerText = totalSalvo;
        document.getElementById('stat-watching-val').innerText = totalWatching;
        document.getElementById('stat-completed-val').innerText = totalCompleted;
        document.getElementById('stat-plan-val').innerText = totalPlan;
        document.getElementById('stat-dropped-val').innerText = totalDropped;
        document.getElementById('stat-hold-val').innerText = totalOnHold;

    } catch (error) {
        console.error('Erro ao processar e somar as estatísticas:', error);
    }
}


// Função que consome a rota GET /api/list para desenhar os mini-cards horizontais
async function carregarListaPessoal() {
    const savedGrid = document.getElementById('saved-grid');
    savedGrid.innerHTML = '<p>Carregando sua lista...</p>';

    try {
        const response = await fetch('/api/list');
        const data = await response.json();

        if (!data.list || data.list.length === 0) {
            savedGrid.innerHTML = '<p>Sua lista está vazia. Volte para a busca e adicione mídias!</p>';
            return;
        }

        savedGrid.innerHTML = '';

        // Dicionário para traduzir o ID do status interno para exibição amigável
        const statusTraduzido = {
            watching: 'Assistindo',
            completed: 'Completado',
            plan_to_watch: 'Planejado',
            dropped: 'Abandonado',
            on_hold: 'Em Espera'
        };

        // Dicionário de ícones visuais para sua nota customizada
        const iconesNota = {
            otimo: '🔥 Ótimo',
            bom: '👍 Bom',
            ruim: '👎 Ruim',
            pessimo: '💩 Péssimo'
        };

        data.list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';

            // Formatação legível das datas salvadas
            const dataInicio = item.startDate ? item.startDate.split('-').reverse().join('/') : 'Não iniciada';
            const dataFim = item.endDate ? item.endDate.split('-').reverse().join('/') : 'Não finalizada';
            const textoNota = iconesNota[item.myRating] || item.myRating;

            card.innerHTML =
                '<img src="' + item.image + '" alt="' + item.title + '">' +
                '<div class="card-content">' +
                '<div>' +
                '<span class="badge badge-' + item.status + '">' + statusTraduzido[item.status] + '</span>' +
                '<h3 class="title" title="' + item.title + '">' + item.title + '</h3>' +
                '<p class="user-details">' +
                '<strong>Tipo:</strong> ' + item.type + '<br>' +
                '<strong>Onde:</strong> ' + item.platform + '<br>' +
                '<strong>Início:</strong> ' + dataInicio + '<br>' +
                '<strong>Fim:</strong> ' + dataFim + '' +
                '</p>' +
                '</div>' +
                '<div class="rating-indicator">' +
                'Minha Nota: ' + textoNota +
                '</div>' +
                '</div>';

            savedGrid.appendChild(card);
        });

    } catch (error) {
        savedGrid.innerHTML = '<p>Erro ao carregar sua lista.</p>';
        console.error(error);
    }
}