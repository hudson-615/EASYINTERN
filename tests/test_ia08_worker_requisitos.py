from unittest.mock import MagicMock, patch

from ia import servico_avaliacao as servico


def test_worker_filtra_vagas_sem_requisitos():
    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.fetchall.return_value = []

    with patch.object(servico, "conectar", return_value=conexao):
        resultado = servico.listar_candidaturas_para_ia(
            pendentes=True,
            limite=20,
        )

    sql, parametros = cursor.execute.call_args.args

    assert resultado == []
    assert "EXISTS" in sql
    assert "vaga_tags" in sql
    assert "vt.id_vaga = c.id_vaga" in sql
    assert parametros == (20,)


def test_tentativa_exige_requisitos(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")

    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.rowcount = 1
    cursor.fetchone.side_effect = [
        {"adquirido": 1},
        None,
        {"liberado": 1},
    ]

    with patch.object(servico, "conectar", return_value=conexao):
        with patch.object(
            servico,
            "avaliar_candidatura",
            return_value={"match_score": 80},
        ):
            with patch.object(
                servico,
                "salvar_avaliacao_no_banco",
            ):
                assert servico.processar_avaliacao(1) is True

    atualizacoes = [
        chamada.args[0]
        for chamada in cursor.execute.call_args_list
        if "UPDATE controle_avaliacoes_ia" in chamada.args[0]
    ]

    assert len(atualizacoes) == 1
    assert "EXISTS" in atualizacoes[0]
    assert "JOIN vaga_tags" in atualizacoes[0]
    assert "c.id_candidatura" in atualizacoes[0]
