from unittest.mock import MagicMock, patch

from ia.servico_avaliacao import processar_avaliacao


def preparar_banco(registro=None):
    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.rowcount = 1
    cursor.fetchone.side_effect = [
        {"adquirido": 1},
        registro,
        {"liberado": 1},
    ]
    return conexao


def test_ia_desativada_nao_acessa_banco(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "false")

    with patch("ia.servico_avaliacao.conectar") as banco:
        assert processar_avaliacao(3) is False
        banco.assert_not_called()


def test_ia_nao_reavalia_candidatura(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")
    conexao = preparar_banco({"id_avaliacao": 1})

    with patch("ia.servico_avaliacao.conectar", return_value=conexao):
        with patch("ia.servico_avaliacao.avaliar_candidatura") as avaliar:
            assert processar_avaliacao(3) is False
            avaliar.assert_not_called()


def test_ia_processa_e_salva_avaliacao(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")
    conexao = preparar_banco()
    resultado = {"match_score": 80}

    with patch("ia.servico_avaliacao.conectar", return_value=conexao):
        with patch("ia.servico_avaliacao.avaliar_candidatura", return_value=resultado) as avaliar:
            with patch("ia.servico_avaliacao.salvar_avaliacao_no_banco") as salvar:
                assert processar_avaliacao(3) is True
                avaliar.assert_called_once_with(3)
                salvar.assert_called_once_with(3, resultado)


def test_falha_ollama_nao_interrompe_servico(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")
    conexao = preparar_banco()

    with patch("ia.servico_avaliacao.conectar", return_value=conexao):
        with patch("ia.servico_avaliacao.avaliar_candidatura", side_effect=RuntimeError("Ollama indisponivel")):
            with patch("ia.servico_avaliacao.salvar_avaliacao_no_banco") as salvar:
                assert processar_avaliacao(3) is False
                salvar.assert_not_called()


def test_falha_banco_nao_interrompe_servico(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")

    with patch("ia.servico_avaliacao.conectar", side_effect=RuntimeError("Banco indisponivel")):
        assert processar_avaliacao(3) is False


def test_falha_ao_salvar_avaliacao(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")
    conexao = preparar_banco()

    with patch("ia.servico_avaliacao.conectar", return_value=conexao):
        with patch("ia.servico_avaliacao.avaliar_candidatura", return_value={"match_score": 80}):
            with patch("ia.servico_avaliacao.salvar_avaliacao_no_banco", side_effect=RuntimeError("Falha ao salvar")):
                assert processar_avaliacao(3) is False



def test_bloqueio_ocupado_impede_avaliacao(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")
    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.fetchone.return_value = {"adquirido": 0}

    with patch("ia.servico_avaliacao.conectar", return_value=conexao):
        with patch("ia.servico_avaliacao.avaliar_candidatura") as avaliar:
            assert processar_avaliacao(3) is False
            avaliar.assert_not_called()


def test_bloqueio_liberado_apos_falha(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")
    conexao = preparar_banco()

    with patch("ia.servico_avaliacao.conectar", return_value=conexao):
        with patch("ia.servico_avaliacao.avaliar_candidatura", side_effect=RuntimeError):
            assert processar_avaliacao(3) is False

    cursor = conexao.cursor.return_value
    cursor.execute.assert_any_call(
        "SELECT RELEASE_LOCK(%s) AS liberado",
        ("easyintern:avaliacao:global",)
    )


def test_recuperacao_desativada(monkeypatch):
    from ia.servico_avaliacao import recuperar_avaliacoes_pendentes

    monkeypatch.setenv("IA_AUTOMATICA", "false")

    with patch("ia.servico_avaliacao.listar_candidaturas_para_ia") as listar:
        assert recuperar_avaliacoes_pendentes() == 0
        listar.assert_not_called()


def test_recuperacao_processa_pendencias(monkeypatch):
    from ia.servico_avaliacao import recuperar_avaliacoes_pendentes

    monkeypatch.setenv("IA_AUTOMATICA", "true")

    candidaturas = [
        {"id_candidatura": 3},
        {"id_candidatura": 4},
        {"id_candidatura": 5},
    ]

    with patch("ia.servico_avaliacao.listar_candidaturas_para_ia", return_value=candidaturas):
        with patch("ia.servico_avaliacao.processar_avaliacao", side_effect=[True, False, True]) as processar:
            assert recuperar_avaliacoes_pendentes() == 2
            assert processar.call_count == 3



def test_limite_ou_intervalo_impede_avaliacao(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")

    conexao = preparar_banco()
    cursor = conexao.cursor.return_value
    cursor.rowcount = 0

    with patch("ia.servico_avaliacao.conectar", return_value=conexao):
        with patch("ia.servico_avaliacao.avaliar_candidatura") as avaliar:
            with patch("ia.servico_avaliacao.salvar_avaliacao_no_banco") as salvar:
                assert processar_avaliacao(3) is False
                avaliar.assert_not_called()
                salvar.assert_not_called()
                conexao.rollback.assert_called_once()


def test_tentativa_registrada_antes_da_ia(monkeypatch):
    monkeypatch.setenv("IA_AUTOMATICA", "true")
    conexao = preparar_banco()

    def avaliar(id_candidatura):
        conexao.commit.assert_called_once()
        return {"match_score": 80}

    with patch("ia.servico_avaliacao.conectar", return_value=conexao):
        with patch("ia.servico_avaliacao.avaliar_candidatura", side_effect=avaliar):
            with patch("ia.servico_avaliacao.salvar_avaliacao_no_banco"):
                assert processar_avaliacao(3) is True


def test_consulta_exclui_avaliacoes_e_tentativas_esgotadas():
    from ia.servico_avaliacao import listar_candidaturas_para_ia

    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.fetchall.return_value = [{"id_candidatura": 3}]

    with patch("ia.servico_avaliacao.conectar", return_value=conexao):
        resultado = listar_candidaturas_para_ia(limite=20)

    sql, parametros = cursor.execute.call_args.args

    assert "a.id_avaliacao IS NULL" in sql
    assert "COALESCE(ct.tentativas, 0) < 3" in sql
    assert "INTERVAL 5 MINUTE" in sql
    assert parametros == (20,)
    assert resultado == [{"id_candidatura": 3}]
