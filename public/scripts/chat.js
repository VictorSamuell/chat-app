document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Conecta ao servidor Socket.IO

    const form = document.getElementById('chat-form');
    const input = document.getElementById('input');
    const messages = document.getElementById('messages');

    // Verifica se os elementos foram encontrados
    if (!form || !input || !messages) {
        console.error('Erro: Elementos do formulário não encontrados.');
        return;
    }

    // Solicita o nome de usuário
    let username = localStorage.getItem('username');
    if (!username) {
        username = prompt('Digite seu nome de usuário:');
        if (username) {
            localStorage.setItem('username', username);
            socket.emit('set username', username); // Envia o nome de usuário para o servidor
        } else {
            username = `Usuário #${Math.floor(Math.random() * 1000)}`;
            localStorage.setItem('username', username);
            socket.emit('set username', username);
        }
    } else {
        socket.emit('set username', username); // Envia o nome de usuário para o servidor
    }

    // Envia mensagem ao servidor
    form.addEventListener('submit', (e) => {
        e.preventDefault(); // Impede o recarregamento da página

        if (input.value) {
            socket.emit('chat message', input.value); // Envia a mensagem
            input.value = ''; // Limpa o campo de input
        }
    });

    // Recebe mensagens do servidor
    socket.on('chat message', (data) => {
        const item = document.createElement('li');
        item.textContent = `${data.username}: ${data.msg}`;
        item.classList.add('message'); // Adiciona classe para estilização
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight; // Rola para a última mensagem
    });

    // Notifica quando um usuário entra no chat
    socket.on('user connected', (username) => {
        const item = document.createElement('li');
        item.textContent = `${username} entrou no chat.`;
        item.classList.add('user-joined'); // Adiciona classe para estilização
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    });
});