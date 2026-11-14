"""Testes das rotas M-11/M-13 sem escrita em banco real."""
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from dashboard.routes import detalhar_vaga_candidato, listar_candidaturas_candidato

TOKEN = {"sub": "17"}
USUARIO = {"tipo_usuario": "Candidato", "ativo": 1, "deletado_em": None, "id_candidato": 6}


def criar_conexao(respostas):
    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.fetchone.side_effect = respostas
    cursor.fetchall.return_value = []
    return conexao, cursor


def test_m11_vaga_retorna_detalhes_sem_outra_empresa():
    conexao, cursor = criar_conexao([
        USUARIO,
        {"id": 2, "titulo": "Estágio Python", "salario_min": Decimal("1800.00"),
         "prazo_encerramento": date(2026, 11, 30), "ja_candidatou": 1},
    ])
    with patch("dashboard.routes.conectar", return_value=conexao):
        resposta = detalhar_vaga_candidato(id_vaga=2, token=TOKEN)
    assert resposta["salario_min"] == 1800.0
    assert resposta["prazo_encerramento"] == "2026-11-30"
    assert resposta["ja_candidatou"] is True
    assert cursor.execute.call_args.args[1] == (6, 2)
    assert "ue.ativo = 1" in cursor.execute.call_args.args[0]
    conexao.close.assert_called_once()


def test_m11_vaga_indisponivel_retorna_404():
    conexao, _ = criar_conexao([USUARIO, None])
    with patch("dashboard.routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as erro:
            detalhar_vaga_candidato(id_vaga=2, token=TOKEN)
    assert erro.value.status_code == 404


def test_m11_empresa_nao_pode_consultar():
    conexao, _ = criar_conexao([{**USUARIO, "tipo_usuario": "Empresa"}])
    with patch("dashboard.routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as erro:
            detalhar_vaga_candidato(id_vaga=2, token=TOKEN)
    assert erro.value.status_code == 403


def test_m13_filtros_parametrizados_e_paginacao():
    conexao, cursor = criar_conexao([
        {"tipo_usuario": "Candidato", "ativo": 1, "deletado_em": None},
        {"id_candidato": 6},
    ])
    with patch("dashboard.routes.conectar", return_value=conexao):
        resposta = listar_candidaturas_candidato(
            token=TOKEN, situacao="entrevista", data_inicio=date(2026, 11, 1),
            data_fim=date(2026, 11, 30), pagina=2, limite=10,
        )
    assert resposta == []
    sql, params = cursor.execute.call_args.args
    assert "LIMIT %s OFFSET %s" in sql
    assert "ca.status = %s" in sql
    assert params == (6, "Entrevista", date(2026, 11, 1), date(2026, 11, 30), 10, 10)


def test_m13_intervalo_invalido_retorna_422():
    conexao, cursor = criar_conexao([
        {"tipo_usuario": "Candidato", "ativo": 1, "deletado_em": None},
        {"id_candidato": 6},
    ])
    with patch("dashboard.routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as erro:
            listar_candidaturas_candidato(
                token=TOKEN, situacao=None, data_inicio=date(2026, 12, 1),
                data_fim=date(2026, 11, 1), pagina=1, limite=20,
            )
    assert erro.value.status_code == 422
