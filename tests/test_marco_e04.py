from unittest.mock import MagicMock, patch

import pytest

from ia.ia_eazyintern import salvar_avaliacao_no_banco


def preparar_avaliacao(versao=1):
    return {
        "id_candidatura": 10,
        "id_candidato": 2,
        "id_vaga": 5,
        "versao_avaliacao": versao,
        "match_score": 80,
        "pontos_fortes": "Conhecimento em Python",
        "pontos_atencao": "Pouca experiencia",
        "veredito": "Perfil compativel"
    }


def preparar_banco(versao):
    conexao = MagicMock()
    cursor = conexao.cursor.return_value

    cursor.fetchone.side_effect = [
        {
            "id_candidato": 2,
            "id_vaga": 5,
            "versao_avaliacao": versao
        },
        None
    ]

    return conexao


def test_e04_avaliacao_atual_pode_ser_salva():
    conexao = preparar_banco(2)

    with patch(
        "ia.ia_eazyintern.conectar_banco",
        return_value=conexao
    ):
        salvar_avaliacao_no_banco(
            10, preparar_avaliacao(2)
        )

    conexao.commit.assert_called_once()


def test_e04_avaliacao_antiga_nao_pode_ser_salva():
    conexao = preparar_banco(2)

    with patch(
        "ia.ia_eazyintern.conectar_banco",
        return_value=conexao
    ):
        with pytest.raises(ValueError, match="desatualizada"):
            salvar_avaliacao_no_banco(
                10, preparar_avaliacao(1)
            )

    conexao.rollback.assert_called_once()
    conexao.commit.assert_not_called()


def test_e04_avaliacao_sem_versao_nao_pode_ser_salva():
    conexao = preparar_banco(2)
    avaliacao = preparar_avaliacao()
    del avaliacao["versao_avaliacao"]

    with patch(
        "ia.ia_eazyintern.conectar_banco",
        return_value=conexao
    ):
        with pytest.raises(ValueError, match="sem versao"):
            salvar_avaliacao_no_banco(10, avaliacao)

    conexao.rollback.assert_called_once()
    conexao.commit.assert_not_called()


from dashboard.empresa_routes import NovaVaga, editar_vaga_empresa


def executar_edicao(peso=3, beneficios=None, falhar=False):
    from datetime import date, timedelta
    from mysql.connector import Error

    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.fetchone.side_effect = [
        {
            "ativo": True,
            "deletado_em": None,
            "tipo_usuario": "Empresa",
            "id_empresa": 1
        },
        {
            "id_vaga": 5,
            "titulo": "Estagio Python",
            "descricao": "Desenvolvimento de sistemas",
            "modalidade": "Remoto",
            "bolsa": None
        }
    ]

    cursor.fetchall.return_value = [
        {"nome": "Python", "obrigatorio": True, "peso": 3}
    ]

    cursor.lastrowid = 1

    if falhar:
        def executar(sql, params=None):
            if "DELETE a FROM avaliacoes_ia" in sql:
                raise Error("Falha simulada")
        cursor.execute.side_effect = executar

    dados = NovaVaga(
        titulo="Estagio Python",
        descricao="Desenvolvimento de sistemas",
        nivel="estagiario",
        modalidade="remoto",
        beneficios=beneficios,
        prazo_encerramento=date.today() + timedelta(days=30),
        habilidades=[
            {"nome": "Python", "obrigatorio": True, "peso": peso}
        ]
    )

    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conexao
    ):
        if falhar:
            from fastapi import HTTPException
            with pytest.raises(HTTPException):
                editar_vaga_empresa(5, dados, {"sub": "1"})
        else:
            editar_vaga_empresa(5, dados, {"sub": "1"})

    return conexao, cursor.execute.call_args_list


def test_e04_alterar_peso_invalida_avaliacoes():
    conexao, chamadas = executar_edicao(peso=5)
    assert any(
        "versao_avaliacao = versao_avaliacao + 1" in c.args[0]
        for c in chamadas
    )
    assert any(
        "DELETE a FROM avaliacoes_ia" in c.args[0]
        and c.args[1] == (5,)
        for c in chamadas
    )
    conexao.commit.assert_called_once()


def test_e04_alterar_beneficios_preserva_avaliacoes():
    conexao, chamadas = executar_edicao(
        beneficios="Vale transporte"
    )
    assert not any(
        "DELETE a FROM avaliacoes_ia" in c.args[0]
        for c in chamadas
    )
    conexao.commit.assert_called_once()


def test_e04_reinicia_tentativas_da_vaga():
    conexao, chamadas = executar_edicao(peso=5)
    assert any(
        "DELETE ct FROM controle_avaliacoes_ia" in c.args[0]
        and c.args[1] == (5,)
        for c in chamadas
    )


def test_e04_falha_na_invalidacao_desfaz_edicao():
    conexao, chamadas = executar_edicao(
        peso=5, falhar=True
    )
    conexao.rollback.assert_called_once()
    conexao.commit.assert_not_called()
