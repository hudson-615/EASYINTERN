from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from usuarios.schemas import (
    LoginRequest,
    CandidatoCadastro,
    EmpresaCadastro
)
from usuarios.recuperacao_routes import PedidoRecuperacao
from dashboard.formacoes_routes import FormacaoAtualizacao
from dashboard.routes import estatisticas_candidato


EMAIL_LONGO = (
    "a" * 60 + "@" +
    "b" * 60 + "." +
    "c" * 40 + ".com"
)


@pytest.mark.parametrize("modelo,dados", [
    (LoginRequest, {"password": "Senha123"}),
    (CandidatoCadastro, {
        "nome_completo": "Candidato Teste",
        "password": "Senha123"
    }),
    (EmpresaCadastro, {
        "razao_social": "Empresa Teste",
        "password": "Senha123"
    }),
    (PedidoRecuperacao, {}),
])
def test_email_acima_do_limite(modelo, dados):
    with pytest.raises(ValidationError):
        modelo(email=EMAIL_LONGO, **dados)


def test_email_valido():
    dados = LoginRequest(
        email="teste@example.com",
        password="Senha123"
    )
    assert dados.email == "teste@example.com"


def test_formacao_status_nulo():
    with pytest.raises(ValidationError):
        FormacaoAtualizacao(status=None)


def test_formacao_status_omitido():
    dados = FormacaoAtualizacao(semestre_atual=3)
    assert dados.model_dump(exclude_unset=True) == {
        "semestre_atual": 3
    }


def test_formacao_status_valido():
    dados = FormacaoAtualizacao(status="Cursando")
    assert dados.status == "Cursando"


def test_indicador_nivel_pleno():
    banco = MagicMock()
    cursor = banco.cursor.return_value

    cursor.fetchone.side_effect = [
        {
            "id_usuario": 17,
            "tipo_usuario": "Candidato",
            "ativo": 1,
            "deletado_em": None
        },
        {
            "id_candidato": 6,
            "nome_completo": "Teste",
            "nivel_carreira": "Pleno",
            "cidade": None,
            "uf": None,
            "linkedin_url": None,
            "github_url": None,
            "area_interesse": None
        },
        {
            "total_candidaturas": 0,
            "aprovadas": 0,
            "em_analise": 0
        },
        {"score_medio": None}
    ]

    with patch("dashboard.routes.conectar", return_value=banco):
        resultado = estatisticas_candidato(token={"sub": "17"})

    assert resultado["nivel"] == "pleno"
