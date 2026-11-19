# Zap 2

Online: https://zap-2-chat.victorsamklv.workers.dev

Publicado na Cloudflare em 18/11/2026. Para atualizar o site a partir deste projeto autenticado, execute `npm run deploy:cloudflare`. O deploy automático por push ainda precisa ser conectado no painel, conforme instruções abaixo.

Chat para amigos com salas por convite, histórico, busca, mensagens fixadas, presença e reconexão. A interface é compartilhada por dois ambientes:

- **Cloudflare Workers + Durable Objects SQLite:** destino recomendado para o plano gratuito. Os dados da sala são persistentes e as conexões usam WebSockets com hibernação.
- **Node.js + Socket.IO + SQLite local:** continua funcionando para desenvolvimento e compatibilidade com o deploy atual do Render.

## Cloudflare: testar e publicar

Requer Node.js 24 ou superior.

```powershell
npm ci
npm run dev:cloudflare
```

Abra http://localhost:8787. O Wrangler usa armazenamento local em `.wrangler/`, separado da conta Cloudflare.

```powershell
npm test
npm run check:cloudflare
npx wrangler login
npm run deploy:cloudflare
```

`check:cloudflare` valida o pacote sem publicar. `login` abre uma autorização da Cloudflare no navegador. `deploy:cloudflare` publica o Worker **zap-2-chat** e cria seus dois namespaces de Durable Objects (salas e controle de requisições). Não é preciso criar D1, R2, um domínio ou contratar um plano pago. O link público será informado pelo Wrangler.

Se houver mais de uma conta Cloudflare, selecione a conta correta antes de publicar. O nome do Worker não deve ser reutilizado por outro projeto. Os limites gratuitos da Cloudflare continuam valendo; quando esgotados, o serviço pode recusar solicitações. Esta configuração não ativa plano pago nem cobrança automática.

## Deploy automático pelo GitHub

Depois de autenticar na Cloudflare, é possível conectar o repositório em **Workers & Pages → Create application → Import a repository**:

- Repositório: `VictorSamuell/chat-app`.
- Branch: `main`.
- Diretório raiz: `/`.
- Build: não é necessário compilar; se o painel exigir um comando, use `npm run check:cloudflare`.
- Deploy: `npm run deploy:cloudflare`.
- A instalação precisa incluir as dependências de desenvolvimento, pois o Wrangler está nelas.

O arquivo `wrangler.jsonc` define Worker, arquivos estáticos e namespaces SQLite. Um push no GitHub só publica na Cloudflare depois de conectar o repositório no painel. Não guarde tokens de acesso no Git.

## Dados, custos e mudança de endereço

Cada sala ocupa um Durable Object, que mantém um banco SQLite próprio. A hibernação preserva as conexões e restaura a identidade a partir de attachments do WebSocket. Não há processo Node que precise permanecer ligado no destino Cloudflare.

**Históricos do Render e do SQLite local não são transferidos automaticamente.** A Cloudflare começa com salas novas. Os convites antigos continuam apontando para o endereço antigo. Como a identidade fica no armazenamento do navegador por domínio, ao mudar de endereço cada pessoa escolhe seu apelido novamente. Não exclua o serviço antigo se houver histórico que você queira exportar.

No Render gratuito, o banco local continua sujeito a apagamento em reinícios, suspensão e novos deploys. Apenas o destino Cloudflare usa os Durable Objects persistentes.

O plano gratuito tem cotas de requisições, tempo de execução, leituras, gravações e armazenamento. Consulte [preços e cotas da Cloudflare](https://developers.cloudflare.com/workers/platform/pricing/). Para pequenos grupos, a hibernação reduz o consumo quando não há conversa. A aplicação limita cada sala a 100 conexões simultâneas, criação a 20 salas/hora por IP e novas conexões a 60/minuto por IP.

## Rodar o servidor Node existente

```powershell
npm ci
npm start
```

Abra http://localhost:4000. `npm run dev` reinicia o servidor Node ao editar o código. Configure `PORT` para trocar a porta e `DATA_PATH` para trocar o caminho do banco (padrão `data/chat.sqlite`). O Dockerfile continua sendo uma opção para esse ambiente; ele não é usado no deploy Cloudflare.

```sh
docker build -t zap2 .
docker run -d --name zap2 -p 4000:4000 -v papo-data:/app/data zap2
```

O nome antigo do volume `papo-data` foi mantido para não perder dados de instalações anteriores. Faça backup do diretório `data/` com o servidor parado.

## Como usar

1. Escolha um apelido e crie uma sala.
2. Copie o convite e envie aos amigos.
3. Para testar outra pessoa no mesmo computador, use uma janela anônima ou outro navegador.
4. Cada participante pode excluir suas mensagens. O criador pode excluir qualquer mensagem da sala. Todos podem fixar ou desafixar mensagens (máximo 5).

Há busca, paginação do histórico, digitação em tempo real, emojis, rascunhos locais e contador de mensagens não lidas na aba. Mensagens têm limite de 2.000 caracteres e 8 envios a cada 10 segundos por identidade e sala na Cloudflare. Um reenvio após timeout não duplica a mesma mensagem.

## Identidade e privacidade

**Qualquer pessoa com o convite pode entrar e ler todo o histórico.** Não há conta, senha nem criptografia de ponta a ponta. O operador da hospedagem tem acesso ao banco. A proposta é uso casual entre pessoas conhecidas.

Uma chave aleatória no navegador preserva o apelido e o papel do criador. Limpar o armazenamento ou trocar de dispositivo cria outra identidade, sem recuperação automática; o apelido anterior permanece reservado naquela sala. As chaves locais `papo.*` foram mantidas por compatibilidade com as versões anteriores.

## Testes e estrutura

`npm test` executa os testes Node e Cloudflare. `npm run test:cloudflare` executa apenas o novo backend. Os testes Cloudflare usam o runtime oficial `workerd` através do Miniflare e verificam isolamento, permissões, limites, reconexão, hibernação, histórico e persistência após reinício.

- `cloudflare/worker.mjs`: API, salas, SQLite e WebSockets da Cloudflare.
- `wrangler.jsonc`: configuração de publicação e migrations.
- `public/scripts/realtime.js`: reconexão, confirmação de envio e heartbeat no navegador.
- `server.js`: backend Node compatível com o Render atual.
- `public/`: interface, estilos e scripts compartilhados.
- `test/`: testes de integração dos dois backends.

As pastas `data/`, `.wrangler/`, `.cloudflare-build/` e `.codex-backups/` são locais e não devem entrar no Git.
