import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Token de leitura da API do TMDB
const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN; 

// Servir arquivos estáticos da pasta public
app.use(express.static('public'));

// Middleware para permitir que o Express entenda requisições com corpo em JSON
app.use(express.json());

/**
 * Middleware para auditar tokens de segurança da AppAPI do Nextcloud
 */
function verificarAutenticacaoNextcloud(req, res, next) {
    const appId = req.headers['ex-app-id'];
    const nextcloudUser = req.headers['x-nextcloud-user'];
    const authAppApi = req.headers['authorization-app-api'];

    if (process.env.AMBIENTE_DESENVOLVIMENTO === 'true') {
        req.usuarioAtual = nextcloudUser || 'usuario_teste_local';
        return next();
    }

    if (!appId || !nextcloudUser || !authAppApi) {
        console.warn(`[Segurança] Bloqueada tentativa de acesso sem cabeçalhos válidos da AppAPI.`);
        return res.status(401).json({ 
            error: 'Não autorizado. Esta requisição precisa ser assinada e enviada por uma instância Nextcloud ativa.' 
        });
    }

    req.usuarioAtual = nextcloudUser;
    next();
}

/**
 * Rota de busca unificada: /api/search?query=nome_da_midia
 */
app.get('/api/search', async (req, res) => {
    const query = req.query.query ? req.query.query.trim() : '';

    if (!query) {
        return res.status(400).json({ error: 'O parâmetro "query" é obrigatório.' });
    }

    if (!TMDB_BEARER_TOKEN || TMDB_BEARER_TOKEN === 'seu_token_aqui') {
        console.error('[Erro] Chave TMDB_BEARER_TOKEN não encontrada no arquivo .env');
        return res.status(500).json({ error: 'Configure o token de acesso do TMDB no arquivo .env do servidor.' });
    }

    try {
        const response = await axios.get("https://api.themoviedb.org/3/search/multi", {
            params: {
                query: query,
                language: 'pt-BR'
            },
            headers: { 
                Authorization: "Bearer " + TMDB_BEARER_TOKEN 
            }
        });

        let unifiedResults = [];

        if (response.data && response.data.results) {
            unifiedResults = response.data.results
                .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
                .map(item => {
                    let typeLabel = item.media_type === 'movie' ? 'Filme' : 'Série';
                    
                    const isJapaneseAnimation = item.origin_country && item.origin_country.includes('JP');
                    if (item.media_type === 'tv' && isJapaneseAnimation) {
                        typeLabel = 'Anime';
                    }

                    const releaseDate = item.release_date || item.first_air_date;
                    const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : 'N/A';

                    return {
                        id: `${item.media_type}-${item.id}`,
                        title: item.title || item.name || 'Título Indisponível',
                        originalTitle: item.original_title || item.original_name || '',
                        type: typeLabel,
                        synopsis: item.overview || 'Sem sinopse disponível.',
                        image: item.poster_path ? "https://image.tmdb.org/t/p/w500" + item.poster_path : null,
                        releaseYear: isNaN(releaseYear) ? 'N/A' : releaseYear,
                        score: item.vote_average ? item.vote_average.toFixed(1) : '0.0'
                    };
                });
        }

        res.json({
            query: query,
            totalResults: unifiedResults.length,
            results: unifiedResults
        });

    } catch (error) {
        console.error('Erro ao conectar com a API do TMDB:', error.message);
        res.status(500).json({ error: 'Erro ao processar busca no catálogo do TMDB.' });
    }
});

/**
 * Rota para salvar progresso da mídia
 */
app.post('/api/list/add', verificarAutenticacaoNextcloud, async (req, res) => {
    const nextcloudUser = req.usuarioAtual;
    const authHeader = req.headers['authorization-app-api'];
    
    const { 
        mediaId, title, type, status, image,
        platform, startDate, endDate, myRating, 
        episodesCount, isRewatched 
    } = req.body;

    if (!mediaId || !status) {
        return res.status(400).json({ error: 'Os campos "mediaId" e "status" são obrigatórios.' });
    }

    const userMediaProgress = {
        mediaId, title, type, status, image,
        platform: platform || 'Não Informada',
        startDate: startDate || null,
        endDate: endDate || null,
        myRating: myRating !== undefined && myRating !== null ? parseFloat(myRating) : null,
        episodesCount: episodesCount ? parseInt(episodesCount, 10) : (type === 'Filme' && status === 'completed' ? 1 : 0),
        isRewatched: !!isRewatched,
        addedAt: new Date().toISOString()
    };

    if (process.env.AMBIENTE_DESENVOLVIMENTO === 'true') {
        if (!global.userDatabases) global.userDatabases = {};
        if (!global.userDatabases[nextcloudUser]) global.userDatabases[nextcloudUser] = [];
        
        global.userDatabases[nextcloudUser] = global.userDatabases[nextcloudUser].filter(item => item.mediaId !== mediaId);
        global.userDatabases[nextcloudUser].push(userMediaProgress);
        
        console.log(`[Simulação Local] Salvo com sucesso: Mídia ${title}`);
        return res.json({ success: true, savedData: userMediaProgress });
    }

    try {
        await axios.put(`http://nextcloud-container/index.php/apps/appapi/api/v1/storage/user/${nextcloudUser}/${mediaId}`, userMediaProgress, {
            headers: { 'Authorization-AppAPI': authHeader, 'Content-Type': 'application/json' }
        });
        res.json({ success: true, savedData: userMediaProgress });
    } catch (error) {
        console.error('Erro no App Storage do Nextcloud:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erro de comunicação com o Nextcloud.' });
    }
});

/**
 * Rota de estatísticas dinâmicas
 */
app.get('/api/stats', verificarAutenticacaoNextcloud, async (req, res) => {
    const nextcloudUser = req.usuarioAtual;
    const authHeader = req.headers['authorization-app-api'];
    let userList = [];

    try {
        if (process.env.AMBIENTE_DESENVOLVIMENTO === 'true') {
            userList = (global.userDatabases && global.userDatabases[nextcloudUser]) || [];
        } else {
            const nextcloudResponse = await axios.get(`http://nextcloud-container/index.php/apps/appapi/api/v1/storage/user/${nextcloudUser}`, {
                headers: { 'Authorization-AppAPI': authHeader }
            });
            userList = nextcloudResponse.data ? Object.values(nextcloudResponse.data) : [];
        }

        const criarEstruturaTipo = () => ({
            watching: 0, completed: 0, on_hold: 0, dropped: 0, plan_to_watch: 0,
            totalEntries: 0, rewatched: 0, totalEpisodes: 0, somaNotas: 0, qtdNotas: 0
        });

        const statsPorTipo = { 'Anime': criarEstruturaTipo(), 'Série': criarEstruturaTipo(), 'Filme': criarEstruturaTipo() };

        userList.forEach(item => {
            const t = statsPorTipo[item.type];
            if (t) {
                t.totalEntries++;
                if (item.status === 'watching') t.watching++;
                if (item.status === 'completed') t.completed++;
                if (item.status === 'on_hold') t.on_hold++;
                if (item.status === 'dropped') t.dropped++;
                if (item.status === 'plan_to_watch') t.plan_to_watch++;

                t.totalEpisodes += (item.episodesCount || 0);
                if (item.isRewatched) t.rewatched++;

                if (item.myRating !== null && item.myRating > 0) {
                    t.somaNotas += item.myRating;
                    t.qtdNotas++;
                }
            }
        });

        const respostaFinal = {};
        Object.keys(statsPorTipo).forEach(tipo => {
            const dados = statsPorTipo[tipo];
            let minutosPorItem = 30;
            if (tipo === 'Série') minutosPorItem = 45;
            if (tipo === 'Filme') minutosPorItem = 110;

            const totalMinutos = dados.totalEpisodes * minutosPorItem;
            const totalDias = (totalMinutos / 60 / 24).toFixed(1);

            respostaFinal[tipo] = {
                days: parseFloat(totalDias),
                meanScore: dados.qtdNotas > 0 ? parseFloat((dados.somaNotas / dados.qtdNotas).toFixed(2)) : 0,
                totalEntries: dados.totalEntries, 
                rewatched: dados.rewatched, 
                episodes: dados.totalEpisodes,
                watching: dados.watching, 
                completed: dados.completed, 
                on_hold: dados.on_hold, 
                dropped: dados.dropped, 
                plan_to_watch: dados.plan_to_watch
            };
        });

        res.json(respostaFinal);

    } catch (error) {
        console.error('Erro ao ler estatísticas:', error.message);
        res.status(500).json({ error: 'Erro ao extrair estatísticas.' });
    }
});

/**
 * Rota de exposição da lista de mídias
 */
app.get('/api/list', verificarAutenticacaoNextcloud, async (req, res) => {
    const nextcloudUser = req.usuarioAtual;
    const authHeader = req.headers['authorization-app-api'];

    try {
        if (process.env.AMBIENTE_DESENVOLVIMENTO === 'true') {
            const userList = (global.userDatabases && global.userDatabases[nextcloudUser]) || [];
            return res.json({ list: userList });
        }

        const nextcloudResponse = await axios.get(`http://nextcloud-container/index.php/apps/appapi/api/v1/storage/user/${nextcloudUser}`, {
            headers: { 'Authorization-AppAPI': authHeader }
        });

        const userList = nextcloudResponse.data ? Object.values(nextcloudResponse.data) : [];
        res.json({ list: userList });

    } catch (error) {
        console.error('Erro ao ler lista do Storage:', error.message);
        res.json({ list: [] });
    }
});

// Rota estática adicional se necessário
app.use('/src', express.static('src'));

app.listen(PORT, () => {
    console.log(`Servidor do ExApp rodando com sucesso na porta ${PORT}`);
});