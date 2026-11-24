"""M-15/M-18: regressao de fluxo candidato/empresa e isolamento de contas.

Somente mocks: nao abre conexao MySQL real e nao altera dados.
"""
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from dashboard.routes import listar_candidaturas_candidato, detalhar_vaga_candidato
from dashboard.empresa_routes import atualizar_status_candidatura_empresa, AtualizarStatusCandidatura


def conexao_mock(respostas, registros=None):
    conn = MagicMock()
    cur = conn.cursor.return_value
    cur.fetchone.side_effect = respostas
    cur.fetchall.return_value = registros or []
    return conn, cur


def executar_lista(conn, sub="17", situacao=None):
    with patch("dashboard.routes.conectar", return_value=conn):
        return listar_candidaturas_candidato(token={"sub": sub}, situacao=situacao,
            data_inicio=None, data_fim=None, pagina=1, limite=20)


def usuario_candidato(ativo=1, excluido=None, tipo="Candidato"):
    return {"id_usuario": 17, "tipo_usuario": tipo, "ativo": ativo, "deletado_em": excluido}


def candidatura(status):
    return {"id": 3, "status": status, "created_at": datetime(2026, 11, 14, 12, 0),
            "vaga_titulo": "Estagio Python", "modalidade": "Remoto", "cidade": "Sao Paulo",
            "estado": "SP", "empresa_nome": "Empresa Teste", "match_score": None,
            "veredito_ia": None}


def test_m15_candidato_enxerga_status_entrevista_apos_mudanca():
    # Emula duas requisicoes independentes que retornam estados distintos do banco.
    primeira, _ = conexao_mock([usuario_candidato(), {"id_candidato": 6}], [candidatura("Pendente")])
    segunda, _ = conexao_mock([usuario_candidato(), {"id_candidato": 6}], [candidatura("Entrevista")])
    resultado_primeira = executar_lista(primeira)
    resultado_segunda = executar_lista(segunda)

    assert resultado_primeira[0]["status"] == "pendente"
    assert resultado_segunda[0]["status"] == "entrevista"
    assert resultado_segunda[0]["match"]["avaliado"] is False


def test_m15_empresa_atualiza_status_com_auditoria():
    empresa = {"tipo_usuario": "Empresa", "ativo": 1, "deletado_em": None, "id_empresa": 5}
    conn, cur = conexao_mock([empresa, {"id_candidatura": 3, "id_vaga": 2, "status": "Em Análise"}])
    with patch("dashboard.empresa_routes.conectar", return_value=conn):
        resultado = atualizar_status_candidatura_empresa(
            id_candidatura=3, dados=AtualizarStatusCandidatura(status="entrevista"),
            token={"sub": "18"})
    assert resultado["status"] == "entrevista"
    assert any("UPDATE candidaturas" in args.args[0] and args.args[1] == ("Entrevista", 3)
               for args in cur.execute.call_args_list)
    assert any("INSERT INTO auditoria" in args.args[0] for args in cur.execute.call_args_list)
    conn.commit.assert_called_once()


def test_m18_empresa_nao_consegue_listar_candidaturas_como_candidato():
    conn, _ = conexao_mock([usuario_candidato(tipo="Empresa")])
    with pytest.raises(HTTPException) as err:
        executar_lista(conn, sub="18")
    assert err.value.status_code == 403


@pytest.mark.parametrize("usuario", [None, usuario_candidato(ativo=0), usuario_candidato(excluido="2026-11-01")])
def test_m18_conta_indisponivel_nao_lista_candidaturas(usuario):
    conn, cur = conexao_mock([usuario])
    with pytest.raises(HTTPException) as err:
        executar_lista(conn)
    assert err.value.status_code == 401
    assert cur.execute.call_count == 1


def test_m18_token_com_sub_invalido_nao_abre_banco():
    with patch("dashboard.routes.conectar", side_effect=AssertionError("Nao acessar MySQL")):
        with pytest.raises(HTTPException) as err:
            listar_candidaturas_candidato(token={"sub": "invalido"}, situacao=None,
                data_inicio=None, data_fim=None, pagina=1, limite=20)
    assert err.value.status_code == 401


def test_m18_lista_fixa_id_do_dono_no_sql():
    conn, cur = conexao_mock([usuario_candidato(), {"id_candidato": 6}])
    executar_lista(conn)
    sql, params = cur.execute.call_args.args
    assert "ca.id_candidato = %s" in sql
    assert params[0] == 6
    assert params[-2:] == (20, 0)


def test_m18_empresa_estranha_nao_altera_candidatura():
    empresa = {"tipo_usuario": "Empresa", "ativo": 1, "deletado_em": None, "id_empresa": 99}
    conn, cur = conexao_mock([empresa, None])
    with patch("dashboard.empresa_routes.conectar", return_value=conn):
        with pytest.raises(HTTPException) as err:
            atualizar_status_candidatura_empresa(id_candidatura=3,
                dados=AtualizarStatusCandidatura(status="aprovado"), token={"sub": "99"})
    assert err.value.status_code == 404
    sql, params = cur.execute.call_args.args
    assert "v.id_empresa = %s" in sql
    assert params == (3, 99)
    conn.commit.assert_not_called()


def test_m18_detalhe_vaga_bloqueia_conta_inativa():
    conn, _ = conexao_mock([{"tipo_usuario": "Candidato", "ativo": 0,
                            "deletado_em": None, "id_candidato": 6}])
    with patch("dashboard.routes.conectar", return_value=conn):
        with pytest.raises(HTTPException) as err:
            detalhar_vaga_candidato(id_vaga=2, token={"sub": "17"})
    assert err.value.status_code == 401
