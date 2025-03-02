document.addEventListener('DOMContentLoaded', () => {
    //socket.io
    const socket = io();


    //evento de submit ao formulário
    const form = document.getElementById('chat-form');
    const input = document.getElementById('input');
    const messages = document.getElementById('messages');

    const username = localStorage.getItem('username');
    if (username) {
        socket.emit('set username', username);
    }

    //evento de submit ao formulário
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value) {
            socket.emit('chat message', input.value);
            input.value = '';
        }
    });

    //evento de recebimento de mensagem
    socket.on('chat message', (data) => {
        const item = document.createElement('li');
        item.textContent = `${data.username}: ${data.msg}`;
        item.classList.add('message');
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    });

    //evento de usuário conectado
    socket.on('user connected', (username) => {
        const item = document.createElement('li');
        item.textContent = `${username} entrou no chat.`;
        item.classList.add('user-joined');
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    });
});