const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let users = {}; // lista para armazenar os usuarios conectados

io.on('connection', (socket) => {
    console.log('Um usuário conectou:', socket.id);

    // definir o nome do usuário de acordo com o digitado
    socket.on('set username', (username) => {
        if (users[socket.id]) {
            console.log(`Usuário ${users[socket.id]} já está na sala.`);
            return;
        }

        users[socket.id] = username; // pega o nome dos usuarios
        console.log(`${username} entrou na sala.`);
        io.emit('user connected', username); // emissao / notificação de entrada de novo usuario
    });

    //receber as msg do client
    socket.on('chat message', (msg) => {
        const username = users[socket.id]; 
        if (username) {
            console.log(`${username} enviou uma mensagem: ${msg}`);
            io.emit('chat message', { username, msg }); 
        } else {
            console.log('Erro: Nome de usuário não definido para o socket.id:', socket.id);
        }
    });

    //remove o usuario da lista users quando ele descnoecta
    socket.on('disconnect', () => {
        const username = users[socket.id];
        if (username) {
            console.log(`${username} saiu da sala.`);
            delete users[socket.id]; 
        } else {
            console.log('Um usuário desconectou sem definir um nome.');
        }
    });
});

// porta pra rodar tanto local quanto no vercel / heroku os etc
const PORT = process.env.PORT || 4000; 
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});