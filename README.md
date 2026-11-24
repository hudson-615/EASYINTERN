# EASYINTERN

## Atualizacao do backend

Antes de executar a versao atualizada:

1. Instale as dependencias com `pip install -r requirements.txt`.
2. Aplique as migracoes da pasta `database/migrations` que ainda nao foram executadas, seguindo a ordem numerica.
3. Configure as variaveis de ambiente no arquivo `.env`.
4. Inicie o servidor com `uvicorn app:app --reload`.

### Recuperacao de senha

Variaveis necessarias:

- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASSWORD
- SMTP_FROM
- PUBLIC_BASE_URL

Nunca versione o arquivo `.env` ou credenciais.

### Inteligencia artificial

Instale o Ollama e baixe o modelo com:

    ollama pull llama3.2:3b

Para testar sem gravar avaliacoes:

    python -m ia.ia_eazyintern --limite 1

Os pareceres gerados pela IA ainda precisam de revisao de precisao.

### Testes

    python -m pytest tests/ -q

### Avaliacoes automaticas da IA

Aplique a migration 003 antes de habilitar a automacao.

Configuracao no .env:

    IA_AUTOMATICA=false

A automacao permanece desativada por padrao ate a
homologacao da qualidade dos pareceres.

Quando autorizada em ambiente de teste, configure
IA_AUTOMATICA=true e execute em terminais separados:

    uvicorn app:app --reload
    python -m ia.worker_avaliacao

O worker consulta pendencias a cada 60 segundos.
Cada candidatura possui ate 3 tentativas, com intervalo
minimo de 5 minutos entre elas.

O processamento automatico utiliza um bloqueio global
do MySQL para evitar avaliacoes simultaneas.

Nao execute o motor manual em paralelo com a automacao.

A IA fornece pareceres informativos e nao altera
automaticamente o status seletivo.

### Paginacao de candidaturas do candidato

GET /dashboard/api/candidato/candidaturas

Parametros opcionais:
- pagina: minimo 1, padrao 1.
- limite: entre 1 e 100, padrao 20.
- situacao: pendente, em_analise, entrevista, aprovado ou reprovado.
- data_inicio e data_fim: formato YYYY-MM-DD.
- com_metadados: false por padrao.

Com com_metadados=true, a API retorna:
items, total, pagina, limite, total_paginas e tem_proxima.

Sem esse parametro, permanece o retorno original em array.

A media global de compatibilidade deve ser obtida pela
rota /dashboard/api/candidato/stats, campo taxa_match.
Nao recalcular a media com base na pagina atual.

## Sistema de chat

O chat permite a comunicacao entre candidatos e empresas
vinculados a uma candidatura.

### Funcionalidades

- Criacao de uma conversa por candidatura.
- Envio e recebimento de mensagens de texto.
- Historico com paginacao.
- Notificacoes e contadores de mensagens nao lidas.
- Comunicacao por WebSocket autenticado.
- Bloqueio e encerramento de conversas.
- Prevencao de mensagens duplicadas por UUID.
- Interface responsiva nos dashboards.
- Suporte aos temas claro e escuro.

### Rotas HTTP

| Metodo | Rota | Finalidade |
|---|---|---|
| POST | /api/chat/conversas | Criar conversa |
| GET | /api/chat/conversas | Listar conversas |
| POST | /api/chat/conversas/{id_chat}/mensagens | Enviar mensagem |
| GET | /api/chat/conversas/{id_chat}/mensagens | Consultar historico |
| PATCH | /api/chat/conversas/{id_chat}/leitura | Registrar leitura |
| PATCH | /api/chat/conversas/{id_chat}/status | Bloquear ou encerrar |
| GET | /api/chat/notificacoes | Consultar notificacoes |

### WebSocket

Endpoint: /api/chat/ws

A autenticacao ocorre por meio da primeira mensagem JSON,
contendo o token JWT.

Eventos enviados pelo servidor:

- CONECTADO
- ATUALIZAR_CHAT

O envio de mensagens permanece na API HTTP.
O WebSocket consulta notificacoes a cada dois segundos.
O front-end possui consulta HTTP alternativa a cada cinco segundos.

### Seguranca e regras

- Acesso restrito aos participantes da candidatura.
- Validacao de contas ativas e sessoes revogadas.
- Validade inicial de 30 dias por conversa.
- Limite de 4000 caracteres por mensagem.
- Conversas encerradas ou bloqueadas nao aceitam novas mensagens.
- Persistencia transacional de mensagens e notificacoes.
- Conteudo exibido como texto, sem interpretacao de HTML.

### Limitacoes atuais

- Suporte apenas a mensagens de texto.
- Sem reabertura de conversas.
- Sem anexos ou respostas a mensagens especificas.
- Sem homologacao de carga em larga escala.
- Prazo de expiracao sujeito ao alinhamento do grupo.

### Validacao

- 38 testes automatizados especificos do chat.
- 33 verificacoes integradas com MySQL, HTTP e WebSocket.
- 7 verificacoes manuais aprovadas nos dashboards.
