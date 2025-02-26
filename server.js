const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let users = {}; // Armazena os usuários conectados

io.on('connection', (socket) => {
    console.log('Um usuário conectou:', socket.id);

    // Define o nome de usuário
    socket.on('set username', (username) => {
        if (users[socket.id]) {
            console.log(`Usuário ${users[socket.id]} já está na sala.`);
            return;
        }

        users[socket.id] = username; // Armazena o nome de usuário
        console.log(`${username} entrou na sala.`);
        io.emit('user connected', username); // Notifica que um novo usuário entrou
    });

    // Recebe mensagens do cliente
    socket.on('chat message', (msg) => {
        const username = users[socket.id]; // Recupera o nome de usuário
        if (username) {
            console.log(`${username} enviou uma mensagem: ${msg}`);
            io.emit('chat message', { username, msg }); // Envia a mensagem com o nome de usuário
        } else {
            console.log('Erro: Nome de usuário não definido para o socket.id:', socket.id);
        }
    });

    // Remove o usuário da lista quando ele desconecta
    socket.on('disconnect', () => {
        const username = users[socket.id];
        if (username) {
            console.log(`${username} saiu da sala.`);
            delete users[socket.id]; // Remove o usuário da lista
        } else {
            console.log('Um usuário desconectou sem definir um nome.');
        }
    });
});

// Configura a porta para rodar tanto localmente quanto no Vercel
const PORT = process.env.PORT || 4000; // Usa a porta do Vercel ou 4000 localmente
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});