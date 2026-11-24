from unittest.mock import patch

import pytest
from fastapi import HTTPException

from seguranca.rate_limit import Limitador


def test_limite_permite_solicitacoes():
    limitador = Limitador(3, 60)

    for _ in range(3):
        limitador.verificar("ip1")


def test_limite_bloqueia_excesso():
    limitador = Limitador(2, 60)

    limitador.verificar("ip1")
    limitador.verificar("ip1")

    with pytest.raises(HTTPException) as erro:
        limitador.verificar("ip1")

    assert erro.value.status_code == 429
    assert "Retry-After" in erro.value.headers


def test_ips_independentes():
    limitador = Limitador(1, 60)

    limitador.verificar("ip1")
    limitador.verificar("ip2")

    with pytest.raises(HTTPException):
        limitador.verificar("ip1")


def test_limite_expira():
    limitador = Limitador(1, 60)

    with patch("seguranca.rate_limit.monotonic", return_value=100):
        limitador.verificar("ip1")

    with patch("seguranca.rate_limit.monotonic", return_value=161):
        limitador.verificar("ip1")


def test_capacidade_maxima():
    limitador = Limitador(2, 60, max_chaves=2)

    limitador.verificar("ip1")
    limitador.verificar("ip2")

    with pytest.raises(HTTPException) as erro:
        limitador.verificar("ip3")

    assert erro.value.status_code == 429
    assert len(limitador.registros) == 2


def test_limpeza_libera_espaco():
    limitador = Limitador(1, 60, max_chaves=1)

    with patch("seguranca.rate_limit.monotonic", return_value=100):
        limitador.verificar("ip1")

    with patch("seguranca.rate_limit.monotonic", return_value=161):
        limitador.verificar("ip2")

    assert "ip1" not in limitador.registros
    assert "ip2" in limitador.registros


def test_bloqueio_nao_afeta_outro_limitador():
    login = Limitador(1, 60)
    recuperacao = Limitador(1, 900)

    login.verificar("ip1")
    recuperacao.verificar("ip1")

    with pytest.raises(HTTPException):
        login.verificar("ip1")
