document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Conecta ao servidor Socket.IO

    const form = document.getElementById('chat-form');
    const input = document.getElementById('input');
    const messages = document.getElementById('messages');


    if (!form || !input || !messages) {
        console.error('Erro: Elementos do formulário não encontrados.');
        return;
    }

    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value) {
            socket.emit('chat message', input.value);//manda amsg
            input.value = ''; 
        }
    });

    // Recebe mensagens do servidor
    socket.on('chat message', (data) => {
        const item = document.createElement('li');
        item.textContent = `${data.username}: ${data.msg}`;
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight; // Rola para a última mensagem
    });

    // Notifica quando um usuário entra no chat
    socket.on('user connected', (username) => {
        const item = document.createElement('li');
        item.textContent = `${username} entrou no chat.`;
        item.style.color = '#00ff00';
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    });

    // Notifica quando um usuário sai do chat
    socket.on('user disconnected', (username) => {
        const item = document.createElement('li');
        item.textContent = `${username} saiu do chat.`;
        item.style.color = '#ff0000';
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    });
});