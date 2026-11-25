from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from dashboard.empresa_routes import NovaVaga


def dados_validos():
    return {
        "titulo": "Estagio em Python",
        "descricao": "Desenvolvimento de sistemas backend.",
        "nivel": "estagiario",
        "modalidade": "remoto",
        "prazo_encerramento": date.today() + timedelta(days=30)
    }


@pytest.mark.parametrize("uf", [
    "SP", "RJ", "MG", "DF", "AM", "RS", "BA"
])
def test_e05_uf_valida(uf):
    dados = dados_validos()
    dados["estado"] = uf
    assert NovaVaga(**dados).estado == uf


@pytest.mark.parametrize("uf", [
    "XX", "ZZ", "12", "ABC", "BR"
])
def test_e05_uf_invalida(uf):
    dados = dados_validos()
    dados["estado"] = uf

    with pytest.raises(ValidationError):
        NovaVaga(**dados)


def test_e05_normaliza_campos():
    dados = dados_validos()
    dados.update({
        "estado": " sp ",
        "cidade": " Sao Paulo ",
        "requisitos": " Python ",
        "beneficios": " "
    })

    vaga = NovaVaga(**dados)

    assert vaga.estado == "SP"
    assert vaga.cidade == "Sao Paulo"
    assert vaga.requisitos == "Python"
    assert vaga.beneficios is None


@pytest.mark.parametrize("campo,valor", [
    ("titulo", "  ab  "),
    ("titulo", "a" * 151),
    ("descricao", "  curta  "),
    ("descricao", "a" * 5001),
    ("requisitos", "a" * 5001),
    ("beneficios", "a" * 2001),
    ("cidade", "a" * 101),
    ("tags", "a" * 1021),
    ("nivel", "senior"),
    ("modalidade", "invalida"),
    ("salario_min", -1),
    ("prazo_encerramento", date.today() - timedelta(days=1)),
    ("habilidades", [{"nome": str(i)} for i in range(21)])
])
def test_e05_rejeita_campos_invalidos(campo, valor):
    dados = dados_validos()
    dados[campo] = valor

    with pytest.raises(ValidationError):
        NovaVaga(**dados)
