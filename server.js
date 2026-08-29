import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Token de leitura da API do TMDB (Obtenha em: developer.themoviedb.org)
const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN; 

// Diz ao Express para servir os arquivos da pasta public (onde está seu index.html)
app.use(express.static('public'));

/**
 * Rota de busca unificada: /api/search?query=nome_da_midia
 */
app.get('/api/search', async (req, res) => {
    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'O parâmetro "query" é obrigatório.' });
    }

    // Bloqueia a busca se você esquecer de colocar o token no arquivo .env
    if (!TMDB_BEARER_TOKEN || TMDB_BEARER_TOKEN === 'seu_token_aqui') {
        console.error('[Erro] Chave TMDB_BEARER_TOKEN não encontrada no arquivo .env');
        return res.status(500).json({ error: 'Configure o token de acesso do TMDB no arquivo .env do servidor.' });
    }

    try {
        // Faz a busca multi-mídia oficial do TMDB (traz filmes, séries e animes)
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

        // Filtra e padroniza as respostas vindas do TMDB
        if (response.data && response.data.results) {
            unifiedResults = response.data.results
                .filter(item => item.media_type === 'movie' || item.media_type === 'tv') // Descarta registros de pessoas/atores
                .map(item => {
                    // Detecção automática de animes dentro do catálogo de TV do TMDB
                    let typeLabel = item.media_type === 'movie' ? 'Filme' : 'Série';
                    
                    // Se houver a palavra "Animation" ou "Anime" nos gêneros originários ou se for produzido no Japão, podemos categorizar como Anime
                    const isJapaneseAnimation = item.origin_country && item.origin_country.includes('JP');
                    if (item.media_type === 'tv' && isJapaneseAnimation) {
                        typeLabel = 'Anime';
                    }

                    return {
                        id: `${item.media_type}-${item.id}`,
                        title: item.title || item.name,
                        originalTitle: item.original_title || item.original_name,
                        type: typeLabel,
                        synopsis: item.overview,
                        // Substituição com o domínio correto identificado por você
                        // FORMATO OFICIAL DO TMDB PARA APPS EXTERNOS
                        image: item.poster_path ? "https://image.tmdb.org/t/p/w500" + item.poster_path : null,
                        releaseYear: (item.release_date || item.first_air_date) ? 
                            new Date(item.release_date || item.first_air_date).getFullYear() : 'N/A',
                        score: item.vote_average ? item.vote_average.toFixed(1) : 'N/A'
                    };
                });
        }

        // Retorna o resultado limpo e unificado para o front-end
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


// Middleware para permitir que o Express entenda requisições com corpo em JSON
app.use(express.json());

/**
 * ROTA ATUALIZADA: Salva mídias com suporte a notas numéricas e contagem de episódios
 */
app.post('/api/list/add', async (req, res) => {
    const nextcloudUser = req.headers['x-nextcloud-user'] || 'usuario_teste_local'; 
    
    const { 
        mediaId, title, type, status, image,
        platform, startDate, endDate,
        myRating,         // Agora será um número de 1 a 10
        episodesCount,    // Quantidade de episódios assistidos nesta entrada
        isRewatched       // Booleano (true/false) se está revendo
    } = req.body;

    if (!mediaId || !status) {
        return res.status(400).json({ error: 'Os campos "mediaId" e "status" são obrigatórios.' });
    }

    try {
        const userMediaProgress = {
            mediaId,
            title,
            type, // Filme, Série, Anime
            status, // watching, completed, plan_to_watch, dropped, on_hold
            image,
            platform: platform || 'Não Informada',
            startDate: startDate || null,
            endDate: endDate || null,
            myRating: myRating ? parseFloat(myRating) : null, // Guarda como número ou null
            episodesCount: episodesCount ? parseInt(episodesCount, 10) : (type === 'Filme' && status === 'completed' ? 1 : 0),
            isRewatched: !!isRewatched,
            addedAt: new Date().toISOString()
        };

        if (!global.userDatabases) global.userDatabases = {};
        if (!global.userDatabases[nextcloudUser]) global.userDatabases[nextcloudUser] = [];
        
        // Atualiza ou remove duplicado
        global.userDatabases[nextcloudUser] = global.userDatabases[nextcloudUser].filter(item => item.mediaId !== mediaId);
        global.userDatabases[nextcloudUser].push(userMediaProgress);

        console.log(`[Sucesso] Mídia "${title}" salva com nota ${myRating}.`);
        res.json({ success: true, savedData: userMediaProgress });

    } catch (error) {
        console.error('Erro ao salvar mídia:', error.message);
        res.status(500).json({ error: 'Erro ao salvar o progresso.' });
    }
});

/**
 * ROTA ATUALIZADA: Estatísticas completas segmentadas por Tipo (idêntico ao MyAnimeList)
 */
app.get('/api/stats', async (req, res) => {
    const nextcloudUser = req.headers['x-nextcloud-user'] || 'usuario_teste_local';
    const userList = (global.userDatabases && global.userDatabases[nextcloudUser]) || [];

    // Estrutura base de cálculo para cada tipo de mídia
    const criarEstruturaTipo = () => ({
        watching: 0, completed: 0, on_hold: 0, dropped: 0, plan_to_watch: 0,
        totalEntries: 0, rewatched: 0, totalEpisodes: 0,
        somaNotas: 0, qtdNotas: 0
    });

    const statsPorTipo = {
        'Anime': criarEstruturaTipo(),
        'Série': criarEstruturaTipo(),
        'Filme': criarEstruturaTipo()
    };

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

    // Formata as médias e calcula tempos fictícios estimativos em dias baseado nos episódios
    // Assumindo em média: Anime = 24min, Série = 45min, Filme = 110min por unidade
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
});

/**
 * ROTA ATUALIZADA: Retorna a lista de mídias estruturada para os Tops e Carousels
 */
app.get('/api/list', async (req, res) => {
    const nextcloudUser = req.headers['x-nextcloud-user'] || 'usuario_teste_local';
    const userList = (global.userDatabases && global.userDatabases[nextcloudUser]) || [];
    res.json({ list: userList });
});

/**
 * Rota para RECUPERAR a lista completa de mídias de um usuário específico
 * GET /api/list
 */
app.get('/api/list', async (req, res) => {
    const nextcloudUser = req.headers['x-nextcloud-user'];

    if (!nextcloudUser) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    try {
        /**
         * No ambiente real, seu app JavaScript buscaria todos os registros do App Storage 
         * filtrados por este usuário.
         */
        
        // Simulação de resposta estruturada que o front-end receberia para montar a página de perfil:
        const mockUserList = [
            {
                mediaId: "anime-21",
                title: "One Piece",
                type: "Anime",
                status: "watching",
                episodesWatched: 1085,
                totalEpisodes: 0,
                score: 9,
                image: "https://myanimelist.net",
                updatedAt: "2026-03-30T15:30:00Z"
            },
            {
                mediaId: "movie-157336",
                title: "Interestelar",
                type: "Filme",
                status: "completed",
                episodesWatched: 1,
                totalEpisodes: 1,
                score: 10,
                image: "https://tmdb.org",
                updatedAt: "2026-02-15T22:10:00Z"
            }
        ];

        res.json({
            user: nextcloudUser,
            totalItems: mockUserList.length,
            list: mockUserList
        });

    } catch (error) {
        console.error('Erro ao buscar lista do usuário:', error.message);
        res.status(500).json({ error: 'Erro ao recuperar sua lista.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor do ExApp rodando com sucesso na porta ${PORT}`);
});
