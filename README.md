# Pokemon Card Battle Online

Jogo de cartas Pokémon online (navegador) com salas para 2 jogadores, turnos sincronizados e backend Node.js.

## Funcionalidades

- Sala online com código (`Player 1` cria, `Player 2` entra)
- Turnos validados no servidor (não é possível jogar fora do próprio turno)
- Chat da sala em tempo real
  - indicador de digitando
  - alerta sonoro/notificação de nova mensagem
- Sistema de batalha por stats + vantagem de tipo
- Ranking por sala (vitórias por jogador + empates)
- Revanche com aceite dos dois jogadores
- Seleção de deck privada por jogador
  - cada jogador vê apenas suas opções
  - preview das cartas antes de escolher
- Evolução opcional (toggle controlado pelo Player 1)
- Evolução por nível de batalha
  - cada KO concede +1 nível de evolução
  - evoluir consome 1 nível
- Animação visual de evolução

## Tecnologias

- Frontend: `HTML`, `CSS`, `JavaScript` puro
- Backend: `Node.js` (`http` nativo, sem framework)
- Deploy: Render

## Estrutura

- `index.html` interface
- `styles.css` visual
- `app.js` lógica cliente e sincronização com API da sala
- `server.js` servidor HTTP + API de jogo/sala
- `render.yaml` configuração de deploy no Render
- `package.json` scripts do projeto

## Rodar localmente (PowerShell)

```powershell
cd C:\Users\Ian\pokemon-browser-card-game
npm start
```

Abrir no navegador:

```text
http://localhost:3000
```

## Como jogar

1. Player 1 digita o nome e clica `Criar Sala (Player 1)`
2. Compartilha o código da sala
3. Player 2 digita nome + código e clica `Entrar na Sala (Player 2)`
4. Cada jogador escolhe seu deck (privado)
5. Player 1 inicia a partida em `Nova Partida`
6. Durante o jogo:
   - anexar energia
   - escolher ataque
   - evoluir (se disponível e habilitado)
   - encerrar turno

## Deploy no Render

1. Suba o projeto no GitHub
2. No Render, crie via `Blueprint` apontando para este repositório
3. O `render.yaml` já define:
   - `buildCommand: echo Build skipped`
   - `startCommand: npm start`

## Hospedagem (especificação)

- Este projeto usa **backend (`server.js`)**, então o ideal é **Render Web Service**.
- **GitHub Pages sozinho não atende** este projeto, porque lá só roda site estático (sem Node.js no servidor).
- Custo:
  - plano free do Render: sem custo inicial para testes
  - planos pagos: opcionais, para mais performance/estabilidade
- Comportamento no free:
  - pode entrar em *sleep* após inatividade
  - no primeiro acesso depois disso, pode demorar alguns segundos para "acordar"
- URL pública:
  - o Render gera um link `https://<nome-do-servico>.onrender.com`
  - esse link pode ser compartilhado para jogar remoto com outra pessoa
- Deploy contínuo:
  - ao fazer `git push origin main`, o Render atualiza automaticamente se `autoDeploy` estiver ativo

## Atualizar o deploy

Após mudanças locais:

```powershell
cd C:\Users\Ian\pokemon-browser-card-game
git add .
git commit -m "Update README and docs"
git push origin main
```

Com `autoDeploy` ativo no Render, o deploy inicia automaticamente após o push.

## Observações

- No plano free do Render, o serviço pode entrar em sleep por inatividade.
- Ao abrir o link novamente, ele acorda (pode levar alguns segundos no primeiro acesso).
- https://pokemon-browser-card-game.onrender.com/ link da hospedagem do Render
