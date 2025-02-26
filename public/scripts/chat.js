document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Conecta ao servidor Socket.IO

    const form = document.getElementById('chat-form');
    const input = document.getElementById('input');
    const messages = document.getElementById('messages');

    // Recupera o nome de usuário do localStorage
    const username = localStorage.getItem('username');
    if (username) {
        socket.emit('set username', username); // Envia o nome de usuário para o servidor
    }

    // Envia mensagem ao servidor
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value) {
            socket.emit('chat message', input.value); // Envia a mensagem
            input.value = ''; // Limpa o campo de input
        }
    });

    // Recebe mensagens do servidor
    socket.on('chat message', (data) => {
        const item = document.createElement('li');
        item.textContent = `${data.username}: ${data.msg}`;
        item.classList.add('message');
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight; // Rola para a última mensagem
    });

    // Notifica quando um usuário entra no chat
    socket.on('user connected', (username) => {
        const item = document.createElement('li');
        item.textContent = `${username} entrou no chat.`;
        item.classList.add('user-joined');
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    });
});