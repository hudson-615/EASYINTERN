from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from dashboard.empresa_routes import listar_candidatos_vaga_empresa


def preparar_banco(vaga_autorizada=True):
    conn = MagicMock()
    cursor = conn.cursor.return_value

    cursor.fetchone.side_effect = [
        {
            "tipo_usuario": "Empresa",
            "ativo": 1,
            "deletado_em": None,
            "id_empresa": 2,
        },
        {"id_vaga": 4} if vaga_autorizada else None,
    ]

    candidatos = [
        {
            "id_candidatura": i,
            "id_candidato": i,
            "nome_completo": f"Candidato {i}",
            "nivel_carreira": "Junior",
            "cidade": "Sao Paulo",
            "uf": "SP",
            "status": "Pendente",
            "data_candidatura": None,
        }
        for i in range(1, 6)
    ]

    avaliacoes = [
        {
            "id_candidatura": i,
            "match_score": score,
            "veredito_ia": "Parecer ficticio",
            "pontos_fortes": "Teste",
            "pontos_atencao": "Teste",
        }
        for i, score in [(1, 40), (3, 95), (4, 70), (5, 0)]
    ]

    cursor.fetchall.side_effect = [
        candidatos,
        avaliacoes,
    ]

    return conn


def test_ranking_ordena_avaliacoes_reais_da_rota():
    conn = preparar_banco()

    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conn
    ):
        resultado = listar_candidatos_vaga_empresa(
            id_vaga=4,
            token={"sub": "17"}
        )

    assert [c["candidatura_id"] for c in resultado] == [
        3, 4, 1, 5, 2
    ]

    assert resultado[0]["match"]["score"] == 95
    assert resultado[3]["match"]["score"] == 0
    assert resultado[4]["match"] is None


def test_ranking_nao_altera_status_seletivo():
    conn = preparar_banco()

    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conn
    ):
        resultado = listar_candidatos_vaga_empresa(
            id_vaga=4,
            token={"sub": "17"}
        )

    assert all(
        candidato["status"] == "pendente"
        for candidato in resultado
    )

    conn.commit.assert_not_called()


def test_ranking_bloqueia_vaga_de_outra_empresa():
    conn = preparar_banco(vaga_autorizada=False)

    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conn
    ):
        with pytest.raises(HTTPException) as erro:
            listar_candidatos_vaga_empresa(
                id_vaga=4,
                token={"sub": "17"}
            )

    assert erro.value.status_code == 404
    conn.cursor.return_value.fetchall.assert_not_called()
