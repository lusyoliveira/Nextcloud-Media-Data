async function carregarPagina(rota) {
    const container = document.getElementById('app-content');
    
    // Atualiza o destaque do menu lateral
    document.querySelectorAll('.sidebar-item a').forEach(el => el.classList.remove('active'));
    
    try {
        if (rota === 'home') {
            document.getElementById('menu-home').classList.add('active');
            const res = await fetch('/views/home.html');
            container.innerHTML = await res.text();
            
            // Importa dinamicamente e inicializa o script da Home
            const homeModule = await import('./home/home.js');
            if (homeModule.inicializarHome) homeModule.inicializarHome();
            
        } else if (rota === 'perfil') {
            document.getElementById('menu-perfil').classList.add('active');
            const res = await fetch('/views/perfil.html');
            container.innerHTML = await res.text();
            
            // Importa dinamicamente e inicializa o script do Perfil
            const perfilModule = await import('./perfil/perfil.js');
            if (perfilModule.inicializarPerfil) perfilModule.inicializarPerfil();
        }
    } catch (e) {
        container.innerHTML = '<p>Erro ao carregar o conteúdo da página.</p>';
        console.error(e);
    }
}

window.carregarPagina = carregarPagina;

// Ao carregar o site pela primeira vez, exibe a Home
window.addEventListener('DOMContentLoaded', () => {
    carregarPagina('home');
});