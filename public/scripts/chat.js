document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Conecta ao servidor Socket.IO

    const form = document.getElementById('chat-form');
    const input = document.getElementById('input');
    const messages = document.getElementById('messages');

    // verifica se ps elementos do formulário existem , para evitar erros logo no inicio do chat
    if (!form || !input || !messages) {
        console.error('Erro: Elementos do formulário não encontrados.');
        return;
    }

    // para solicitar o nome do usuário
    let username = localStorage.getItem('username');
    if (!username) {
        username = prompt('Digite seu nome de usuário:');
        if (username) {
            localStorage.setItem('username', username);
            socket.emit('set username', username); 
        } else {
            username = `Usuário #${Math.floor(Math.random() * 1000)}`;
            localStorage.setItem('username', username);
            socket.emit('set username', username);
        }
    } else {
        socket.emit('set username', username); 
    }

    
    form.addEventListener('submit', (e) => {
        e.preventDefault(); // Evita o recarregamento da página

        if (input.value) {
            socket.emit('chat message', input.value); 
            input.value = ''; 
        }
    });

    
    socket.on('chat message', (data) => {
        const item = document.createElement('li');
        item.textContent = `${data.username}: ${data.msg}`;
        item.classList.add('message'); //add classe msg
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;  // scroll para final
    });

    // Notifica quando um usuário entra no chat
    socket.on('user connected', (username) => {
        const item = document.createElement('li');
        item.textContent = `${username} entrou no chat.`;
        item.classList.add('user-joined'); // add classe do usuario add
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    });
});

//futuramente add classe de desconect