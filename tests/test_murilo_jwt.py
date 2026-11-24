from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException

from seguranca.token import (
    JWT_SECRET_KEY,
    JWT_ALGORITHM,
    criar_token_acesso,
    verificar_token,
)


def assinar(dados, chave=JWT_SECRET_KEY):
    return jwt.encode(
        dados,
        chave,
        algorithm=JWT_ALGORITHM
    )


def expiracao():
    return datetime.now(timezone.utc) + timedelta(minutes=10)


def test_jwt_valido():
    token = criar_token_acesso({
        "sub": "17",
        "tipo_usuario": "candidato"
    })
    assert verificar_token(token)["sub"] == "17"


def test_jwt_sem_expiracao():
    token = assinar({"sub": "17"})

    with pytest.raises(HTTPException) as erro:
        verificar_token(token)

    assert erro.value.status_code == 401


def test_jwt_sem_identificador():
    token = assinar({"exp": expiracao()})

    with pytest.raises(HTTPException) as erro:
        verificar_token(token)

    assert erro.value.status_code == 401


def test_jwt_expirado():
    token = assinar({
        "sub": "17",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1)
    })

    with pytest.raises(HTTPException) as erro:
        verificar_token(token)

    assert erro.value.status_code == 401


@pytest.mark.parametrize("sub", [
    "", "0", "-1", "abc", "1.5", " 17", 17, None
])
def test_jwt_identificador_invalido(sub):
    token = assinar({
        "sub": sub,
        "exp": expiracao()
    })

    with pytest.raises(HTTPException) as erro:
        verificar_token(token)

    assert erro.value.status_code == 401


def test_jwt_assinatura_invalida():
    token = assinar(
        {"sub": "17", "exp": expiracao()},
        chave="chave-incorreta-apenas-para-testes-123456"
    )

    with pytest.raises(HTTPException) as erro:
        verificar_token(token)

    assert erro.value.status_code == 401
