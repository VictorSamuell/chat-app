document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Conecta ao servidor Socket.IO

    const usernameForm = document.getElementById('username-form');
    const usernameInput = document.getElementById('username-input');

    usernameForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();

        if (username) {
            localStorage.setItem('username', username); 
            socket.emit('set username', username); 
            window.location.href = 'chat.html'; 
        }
    });
});