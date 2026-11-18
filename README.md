# Zap 2

Chat em tempo real para amigos, feito com Node.js, Express e Socket.IO. Interface em português, sem cadastro, com salas por convite e histórico persistente em SQLite.

## Rodar no computador

Requer **Node.js 24 ou superior**. O SQLite já está incluído no Node; o aviso de recurso experimental em algumas versões do Node 24 é esperado.

```powershell
npm install
npm start
```

Abra http://localhost:4000. Para desenvolver com reinício automático:

```powershell
npm run dev
```

1. Escolha um apelido e crie uma sala.
2. Use **Convidar** para copiar o link.
3. Para testar duas pessoas no mesmo computador, abra o convite em outro navegador ou janela anônima. Abas do mesmo navegador usam a mesma identidade.
4. Em outro dispositivo da mesma rede, abra `http://IP-DO-SEU-PC:4000` e gere o convite por esse endereço. O computador precisa estar ligado e a porta liberada no firewall da rede privada. Um link com `localhost` só funciona no próprio computador.

## O que está pronto

- Salas independentes com convites aleatórios, sem lista pública.
- Apelido reservado por identidade dentro de cada sala.
- Mensagens em tempo real, horários e agrupamento por dia.
- Histórico em SQLite, carregamento de mensagens antigas e busca (até 50 resultados por pesquisa).
- Até 5 mensagens fixadas por sala; qualquer participante pode fixar e desafixar.
- Lista de participantes online e indicação de digitação.
- Reconexão com restauração da identidade e do histórico.
- Rascunhos e últimas salas salvos neste navegador.
- Emojis, links clicáveis e contador de caracteres.
- Mensagens próprias destacadas e contador de não lidas no título da aba.
- Exclusão das próprias mensagens; criador pode moderar qualquer mensagem da sua sala.
- Layout para computador e celular, navegação por teclado e redução de movimento.
- Validação no servidor, limite de 2.000 caracteres, 8 mensagens a cada 10 segundos por identidade e 20 salas/hora por IP direto.
- Confirmação de envio com identificador idempotente: tentar novamente após timeout não duplica a mesma mensagem.

## Identidade e privacidade

Não há conta nem senha. Uma chave aleatória salva no navegador identifica você e preserva seu apelido e, quando aplicável, o papel de criador. Limpar os dados do navegador ou mudar de dispositivo cria uma nova identidade; não existe recuperação de conta. O apelido antigo continua reservado naquela sala. Não compartilhe a chave do armazenamento local.

**Quem possui o convite pode entrar e ler todo o histórico da sala.** Não há criptografia de ponta a ponta; o operador do servidor pode acessar o banco. Use HTTPS quando hospedar na internet. A proposta é um chat casual para grupos conhecidos, não comunicação sigilosa ou um serviço público anônimo em grande escala.

O histórico não expira automaticamente. Mensagens podem ser removidas pelo autor ou criador da sala. O limite de requisições fica em memória; em proxy reverso, todos podem compartilhar o IP do proxy. Para maior escala, configure o proxy de confiança de forma explícita e use limitação compartilhada.

## Dados e configuração

- Porta: variável `PORT` (padrão `4000`).
- Banco: variável `DATA_PATH` (padrão `data/chat.sqlite`).
- O diretório `data/` não deve ser enviado ao Git.
- Para backup simples, pare o servidor e copie o diretório `data/` completo. Preserve o banco e os arquivos auxiliares se existirem. Reinicie depois.
- Uma única instância Node gerencia presença e salas em memória. Várias instâncias exigem um adaptador Socket.IO compartilhado, limite de requisições compartilhado e armazenamento adequado.
- A busca usa SQLite LIKE, com caracteres `%` e `_` tratados literalmente. A correspondência sem distinguir maiúsculas/minúsculas para caracteres acentuados depende das regras padrão do SQLite.

## Testes

```powershell
npm test
```

Os testes iniciam servidores em portas temporárias e usam clientes Socket.IO reais com WebSocket e polling. Cobrem isolamento de salas, persistência após reinício, reconexão com a mesma identidade, busca literal, paginação, validação, idempotência, limites, fixados e permissões de exclusão.

## Hospedar depois

Esta versão precisa de **um processo Node ativo e disco persistente** para o SQLite. A antiga configuração Vercel deste projeto foi retirada; não publique o banco SQLite em disco efêmero. Para usar infraestrutura sem disco persistente, migre antes a persistência para um banco externo e revise o ciclo de vida das conexões.

Há um Dockerfile opcional:

```sh
docker build -t zap2 .
docker run -d --name zap2 -p 4000:4000 -v papo-data:/app/data zap2
```

O volume `papo-data` mantém o histórico quando o contêiner é recriado. Para acesso público, configure domínio, HTTPS e backups no ambiente de hospedagem. Nenhuma hospedagem paga ou publicação automática faz parte desta alteração.

## Estrutura

- `server.js`: servidor, banco SQLite e eventos de tempo real.
- `public/index.html`: criação de sala e entrada por convite.
- `public/chat.html`: sala de conversa.
- `public/styles.css`: identidade visual e layouts responsivos.
- `public/scripts/shared.js`: identidade local e utilitários.
- `public/scripts/auth.js`: fluxo de entrada.
- `public/scripts/chat.js`: mensagens, busca, presença, fixados e reconexão.
- `test/chat.test.js`: testes de integração.
