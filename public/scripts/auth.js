document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const usernameForm = document.getElementById('username-form');
    const usernameInput = document.getElementById('username-input');

    usernameForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();

        if (username) {
            localStorage.setItem('username', username); // Armazena o nome de usuário
            socket.emit('set username', username);
            window.location.href = '/chat'; 
        }
    });
});