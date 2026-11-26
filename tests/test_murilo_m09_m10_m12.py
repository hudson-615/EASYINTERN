"""Testes das buscas/filtros/paginação de vagas sem escrever no MySQL."""
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from dashboard.routes import listar_vagas_recomendadas, listar_vagas_candidato

TOKEN = {"sub": "17"}
USUARIO = {"tipo_usuario": "Candidato", "ativo": 1, "deletado_em": None}


def mock_banco(total=0, vagas=None):
    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.fetchone.side_effect = [USUARIO, {"id_candidato": 6}, {"total": total}]
    cursor.fetchall.side_effect = [
        vagas or [],
        [{"id_tag": 1}],
        [
            {"id_vaga": vaga["id"], "id_tag": 1,
             "peso": 3, "obrigatorio": 1}
            for vaga in (vagas or [])
        ]
    ]
    return conexao, cursor


def test_m09_busca_parametrizada_e_sem_interpolacao_sql():
    conexao, cursor = mock_banco()
    with patch("dashboard.routes.conectar", return_value=conexao):
        resposta = listar_vagas_recomendadas(token=TOKEN, busca="Python' OR 1=1")
    assert resposta == []
    sql, parametros = cursor.execute.call_args.args
    assert "LIKE %s ESCAPE '!'" in sql
    assert "Python'" not in sql
    assert "Python'" in str(parametros)
    assert "LIMIT %s OFFSET %s" in sql
    assert parametros[-2:] == (50, 0)


def test_m10_filtros_sql_uf_modalidade_nivel_bolsa_tag():
    conexao, cursor = mock_banco()
    with patch("dashboard.routes.conectar", return_value=conexao):
        listar_vagas_recomendadas(token=TOKEN, cidade="São Paulo", uf="sp",
            modalidade="hibrido", nivel="estagio", bolsa_min=1000, bolsa_max=2200, tag="Python")
    sql, parametros = cursor.execute.call_args.args
    assert "v.cidade = %s" in sql
    assert "v.uf = %s" in sql
    assert "v.modalidade = %s" in sql
    assert "v.nivel = %s" in sql
    assert "v.bolsa >= %s" in sql and "v.bolsa <= %s" in sql
    assert "JOIN tags_conhecimento t" in sql
    assert parametros == (6, "São Paulo", "SP", "Híbrido", "Estagiário", 1000, 2200, "Python", 50, 0)
    assert "u.ativo = 1" in sql
    assert "u.deletado_em IS NULL" in sql
    assert "v.prazo_encerramento >= CURDATE()" in sql


def test_m12_metadados_paginacao_e_consulta_total():
    vagas = [{"id": 2, "titulo": "Estágio Python", "empresa": "Tech",
        "nivel": "Estagiário", "modalidade": "Híbrido", "cidade": "São Paulo",
        "estado": "SP", "salario_min": Decimal("1800.00"), "descricao": "API",
        "beneficios": None, "tags": "Python, MySQL", "ja_candidatou": 1}]
    conexao, cursor = mock_banco(total=25, vagas=vagas)
    with patch("dashboard.routes.conectar", return_value=conexao):
        resposta = listar_vagas_candidato(token=TOKEN, pagina=2, limite=10)
    assert resposta["pagina"] == 2 and resposta["total"] == 25
    assert resposta["total_paginas"] == 3 and resposta["tem_proxima"] is True
    assert resposta["items"][0]["tags"] == "Python, MySQL"
    assert resposta["items"][0]["ja_candidatou"] is True
    assert resposta["items"][0]["salario_min"] == 1800.0
    consultas = cursor.execute.call_args_list

    assert "COUNT(*)" in consultas[2].args[0]
    assert consultas[3].args[1][-2:] == (10, 10)

    assert "candidato_tags" in consultas[4].args[0]
    assert consultas[4].args[1] == (6,)

    assert "vaga_tags" in consultas[5].args[0]
    assert consultas[5].args[1] == (2,)

    assert resposta["items"][0]["match"]["score"] == 100
    assert resposta["items"][0]["match"]["estimado"] is True
    assert resposta["items"][0]["match"]["avaliado"] is True


def test_m10_bolsa_invertida_422_sem_conectar():
    with patch("dashboard.routes.conectar") as conectar:
        with pytest.raises(HTTPException) as e:
            listar_vagas_recomendadas(token=TOKEN, bolsa_min=2000, bolsa_max=1000)
    assert e.value.status_code == 422
    conectar.assert_not_called()


def test_m10_ordenacao_nao_interpolada():
    conexao, cursor = mock_banco()
    with patch("dashboard.routes.conectar", return_value=conexao):
        listar_vagas_recomendadas(token=TOKEN, ordenar="bolsa_maior")
    sql = cursor.execute.call_args.args[0]
    assert "v.bolsa DESC" in sql
    assert "LIMIT %s OFFSET %s" in sql


def test_m09_escape_curingas_like():
    conexao, cursor = mock_banco()
    with patch("dashboard.routes.conectar", return_value=conexao):
        listar_vagas_recomendadas(token=TOKEN, busca="Py_%!")
    params = cursor.execute.call_args.args[1]
    assert "%Py!_!%!!%" in params


def test_m12_preserva_resposta_array_legacy():
    conexao, cursor = mock_banco()
    with patch("dashboard.routes.conectar", return_value=conexao):
        resposta = listar_vagas_recomendadas(token=TOKEN)
    assert isinstance(resposta, list)
    assert cursor.execute.call_count == 3


def test_m12_empresa_403():
    conexao, cursor = mock_banco()
    cursor.fetchone.side_effect = [{**USUARIO, "tipo_usuario": "Empresa"}]
    with patch("dashboard.routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as e:
            listar_vagas_candidato(token=TOKEN)
    assert e.value.status_code == 403
