import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import HTTPException, status
from jwt.exceptions import InvalidTokenError


load_dotenv()


JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30")
)


if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY não foi configurada no arquivo .env."
    )


def criar_token_acesso(dados: dict) -> str:
    """
    Cria um token JWT com os dados do usuário e data de expiração.
    """

    dados_token = dados.copy()

    expiracao = datetime.now(timezone.utc) + timedelta(
        minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )

    dados_token.update({
        "exp": expiracao
    })

    token = jwt.encode(
        dados_token,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )

    return token


def verificar_token(token: str) -> dict:
    """
    Verifica a assinatura e a validade do token JWT.
    """

    try:
        dados = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM]
        )

        if "sub" not in dados:
            raise InvalidTokenError("Token sem identificador de usuário.")

        return dados

    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"}
        )