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
