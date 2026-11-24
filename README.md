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
