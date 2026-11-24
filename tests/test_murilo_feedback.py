
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from dashboard.feedback_routes import (
    FeedbackCadastro,
    consultar_feedback_empresa,
    consultar_feedback_candidato,
    salvar_feedback_empresa
)


TOKEN = {"sub": "17"}

EMPRESA = {
    "tipo_usuario": "Empresa",
    "ativo": 1,
    "deletado_em": None
}

CANDIDATO = {
    **EMPRESA,
    "tipo_usuario": "Candidato"
}


def banco_mock(*respostas):
    banco = MagicMock()
    cursor = banco.cursor.return_value
    cursor.fetchone.side_effect = respostas
    return banco, cursor


def test_empresa_salva_feedback():
    banco, cursor = banco_mock(
        EMPRESA, {"id_candidatura": 10}
    )

    with patch("dashboard.feedback_routes.conectar", return_value=banco):
        salvar_feedback_empresa(
            10, FeedbackCadastro(mensagem="Melhore seus conhecimentos."),
            TOKEN
        )

    sql, parametros = cursor.execute.call_args.args

    assert "INSERT INTO feedbacks_candidatura" in sql
    assert "ON DUPLICATE KEY UPDATE" in sql
    assert parametros[0] == 10

    banco.commit.assert_called_once()


def test_candidato_consulta_proprio_feedback():
    banco, cursor = banco_mock(
        CANDIDATO,
        {"id_candidatura": 10},
        {"mensagem": "Estude Python.", "atualizado_em": None}
    )

    with patch("dashboard.feedback_routes.conectar", return_value=banco):
        resultado = consultar_feedback_candidato(10, TOKEN)

    assert resultado["feedback"] == "Estude Python."

    sql, parametros = cursor.execute.call_args_list[1].args

    assert "c.id_usuario = %s" in sql
    assert parametros == (10, 17)


def test_empresa_consulta_feedback():
    banco, _ = banco_mock(
        EMPRESA,
        {"id_candidatura": 10},
        {"mensagem": "Feedback teste", "atualizado_em": None}
    )

    with patch("dashboard.feedback_routes.conectar", return_value=banco):
        resultado = consultar_feedback_empresa(10, TOKEN)

    assert resultado["feedback"] == "Feedback teste"


@pytest.mark.parametrize("usuario,funcao,status", [
    (EMPRESA, consultar_feedback_empresa, 404),
    (CANDIDATO, consultar_feedback_candidato, 404),
    (CANDIDATO, consultar_feedback_empresa, 403),
    (EMPRESA, consultar_feedback_candidato, 403),
    ({**EMPRESA, "ativo": 0}, consultar_feedback_empresa, 401),
    (None, consultar_feedback_empresa, 401)
])
def test_acesso_nao_autorizado(usuario, funcao, status):
    banco, _ = banco_mock(usuario, None)

    with patch("dashboard.feedback_routes.conectar", return_value=banco):
        with pytest.raises(HTTPException) as erro:
            funcao(10, TOKEN)

    assert erro.value.status_code == status


def test_empresa_nao_salva_feedback_de_outra_empresa():
    banco, cursor = banco_mock(EMPRESA, None)

    with patch("dashboard.feedback_routes.conectar", return_value=banco):
        with pytest.raises(HTTPException) as erro:
            salvar_feedback_empresa(
                10, FeedbackCadastro(mensagem="Feedback teste"), TOKEN
            )

    assert erro.value.status_code == 404
    banco.commit.assert_not_called()
    banco.rollback.assert_called_once()

    sql, parametros = cursor.execute.call_args.args
    assert "e.id_usuario = %s" in sql
    assert parametros == (10, 17)


@pytest.mark.parametrize("mensagem", [
    "", "  ", "ab", "a" * 2001
])
def test_feedback_invalido(mensagem):
    with pytest.raises(ValidationError):
        FeedbackCadastro(mensagem=mensagem)


def test_feedback_ainda_nao_enviado():
    banco, _ = banco_mock(
        CANDIDATO, {"id_candidatura": 10}, None
    )

    with patch("dashboard.feedback_routes.conectar", return_value=banco):
        resultado = consultar_feedback_candidato(10, TOKEN)

    assert resultado["feedback"] is None
