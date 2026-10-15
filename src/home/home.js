export function inicializarHome() {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const resultsGrid = document.getElementById('results-grid');

    if (!searchInput || !searchButton || !resultsGrid) return; // Garante que os elementos existem na tela

    // Carrega as listas iniciais da home
    carregarListasHome();

    searchButton.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) buscarMidias(query);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) buscarMidias(query);
        }
    });

    async function carregarListasHome() {
        try {
            const response = await fetch('/api/list');
            const data = await response.json();
            if (!data.list || data.list.length === 0) return;

            const emProgresso = data.list.filter(item => item.status === 'watching');
            if (emProgresso.length > 0) {
                const watchingSection = document.getElementById('watching-section');
                if (watchingSection) watchingSection.style.display = 'block';
                renderizarGradeEstatico(emProgresso, 'watching-grid');
            }

            const recentes = [...data.list].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt)).slice(0, 4);
            if (recentes.length > 0) {
                const recentSection = document.getElementById('recent-section');
                if (recentSection) recentSection.style.display = 'block';
                renderizarGradeEstatico(recentes, 'recent-grid');
            }
        } catch (e) { console.error(e); }
    }

    async function buscarMidias(nome) {
        resultsGrid.innerHTML = '<p>Buscando no catálogo do TMDB...</p>';
        try {
            const response = await fetch('/api/search?query=' + encodeURIComponent(nome));
            const data = await response.json();
            renderizarCardsBusca(data.results);
        } catch (error) {
            resultsGrid.innerHTML = '<p>Erro na conexão com o servidor.</p>';
        }
    }

    function renderizarCardsBusca(items) {
        resultsGrid.innerHTML = '';
        if (!items || items.length === 0) {
            resultsGrid.innerHTML = '<p>Nenhuma mídia encontrada no TMDB.</p>';
            return;
        }
        items.forEach(item => { resultsGrid.appendChild(criarCardMidia(item, false)); });
    }

    function renderizarGradeEstatico(items, elementId) {
        const grid = document.getElementById(elementId);
        if (!grid) return;
        grid.innerHTML = '';
        items.forEach(item => { grid.appendChild(criarCardMidia(item, true)); });
    }

    function criarCardMidia(item, isEstatico) {
        const card = document.createElement('div');
        card.className = 'card';
        const capa = item.image ? item.image : "https://placeholder.co";
        const tituloLimpo = item.title.replace(/"/g, '&quot;').replace(/'/g, "\\'");

        let areaAcaoHtml = '';
        if (!isEstatico) {
            areaAcaoHtml =
                '<select id="status-' + item.id + '" class="status-select" onchange="window.alternarFormulario(\'' + item.id + '\', this.value)">' +
                '<option value="">-- Mudar Status --</option>' +
                '<option value="watching">Assistindo</option>' +
                '<option value="completed">Completado</option>' +
                '<option value="plan_to_watch">Planejado</option>' +
                '<option value="dropped">Abandonado</option>' +
                '<option value="on_hold">Em Espera</option>' +
                '</select>' +
                '<div id="form-' + item.id + '" class="form-tracker">' +
                '<div class="form-group"><label>Plataforma</label>' +
                '<select id="plat-' + item.id + '">' +
                '<option value="Netflix">Netflix</option><option value="Crunchyroll">Crunchyroll</option>' +
                '<option value="Disney+">Disney+</option><option value="Prime Video">Prime Video</option>' +
                '<option value="Max">Max</option><option value="Stremio">Stremio/Torrent</option>' +
                '</select>' +
                '</div>' +
                '<div class="form-row">' +
                '<div class="form-group" style="flex:1;"><label>Minha Nota TMDB</label>' +
                '<select id="rate-' + item.id + '">' +
                '<option value="10">⭐ (10) Obra-Prima</option><option value="9">⭐ (9) Excelente</option>' +
                '<option value="8">⭐ (8) Muito Bom</option><option value="7">⭐ (7) Bom</option>' +
                '<option value="6">⭐ (6) OK</option><option value="5">⭐ (5) Mediano</option>' +
                '<option value="4">⭐ (4) Ruim</option><option value="3">⭐ (3) Muito Ruim</option>' +
                '<option value="2">⭐ (2) Horrível</option><option value="1">⭐ (1) Tragédia</option>' +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="width:75px;"><label>Episódios</label>' +
                '<input type="number" id="ep-' + item.id + '" value="0" min="0">' +
                '</div>' +
                '</div>' +
                '<div class="form-group form-row-check">' +
                '<input type="checkbox" id="rew-' + item.id + '"><label for="rew-' + item.id + '">Estou revendo</label>' +
                '</div>' +
                '<div class="form-row">' +
                '<div class="form-group"><label>Início</label><input type="date" id="start-' + item.id + '"></div>' +
                '<div class="form-group"><label>Fim</label><input type="date" id="end-' + item.id + '"></div>' +
                '</div>' +
                '<button class="btn-salvar" onclick="window.salvarItemCompleto(\'' + item.id + '\',\'' + tituloLimpo + '\',\'' + item.type + '\',\'' + capa + '\')">Confirmar</button>' +
                '</div>';
        } else {
            areaAcaoHtml = '<p style="margin:5px 0 0 0; font-size:12px; color:#a4a4b5;">📍 Plataforma: ' + (item.platform || 'N/I') + '</p>';
        }

        card.innerHTML =
            '<img src="' + capa + '" alt="' + tituloLimpo + '">' +
            '<div class="card-content">' +
            '<div>' +
            '<span class="badge badge-' + item.type.toLowerCase() + '">' + item.type + '</span>' +
            '<h3 class="title">' + item.title + '</h3>' +
            '</div>' +
            '<div>' + areaAcaoHtml + '</div>' +
            '</div>';
        return card;
    }
}

// Funções auxiliares globais ligadas a eventos inline do HTML gerado dinamicamente
window.alternarFormulario = function (id, val) {
    const el = document.getElementById('form-' + id);
    if (el) el.style.display = val !== "" ? 'block' : 'none';
};

window.salvarItemCompleto = async function (id, title, type, image) {
    const bodyData = {
        mediaId: id, title, type, image,
        status: document.getElementById('status-' + id).value,
        platform: document.getElementById('plat-' + id).value,
        myRating: document.getElementById('rate-' + id).value,
        episodesCount: document.getElementById('ep-' + id).value,
        isRewatched: document.getElementById('rew-' + id).checked,
        startDate: document.getElementById('start-' + id).value,
        endDate: document.getElementById('end-' + id).value,
    };

    try {
        const response = await fetch('/api/list/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });
        if ((await response.json()).success) {
            alert('Salvo na coleção!');
            location.reload();
        }
    } catch (e) { alert('Erro ao salvar.'); }
};