document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Conecta ao servidor Socket.IO

    const entryContainer = document.getElementById('entry-container');
    const chatContainer = document.getElementById('chat-container');
    const usernameForm = document.getElementById('username-form');
    const usernameInput = document.getElementById('username-input');

    usernameForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();

        if (username) {
            localStorage.setItem('username', username); // Armazena o nome de usuário
            socket.emit('set username', username); // Envia o nome de usuário para o servidor
            window.location.href = 'chat.html';
            // Oculta o formulário de entrada e mostra o chat
            entryContainer.style.display = 'none';
            chatContainer.style.display = 'block';
        }
    });
});