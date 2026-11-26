from fastapi.testclient import TestClient

from app import app


client = TestClient(app)


def test_validacao_nao_expoe_senha():
    senha = "segredo-de-teste123"

    resposta = client.post(
        "/api/auth/register/candidato",
        json={
            "nome_completo": "Candidato Teste",
            "email": "teste@example.com",
            "password": senha
        }
    )

    assert resposta.status_code == 422
    assert senha not in resposta.text

    for erro in resposta.json()["detail"]:
        assert "msg" in erro
        assert "input" not in erro
        assert "ctx" not in erro


def test_validacao_nao_expoe_token():
    token = "token-privado-teste"

    resposta = client.post(
        "/api/auth/redefinir-senha",
        json={
            "token": token,
            "nova_senha": "SenhaTeste123"
        }
    )

    assert resposta.status_code == 422
    assert token not in resposta.text


def test_validacao_nao_expoe_nova_senha():
    senha = "senha-privada123"

    resposta = client.post(
        "/api/auth/redefinir-senha",
        json={
            "token": "a" * 64,
            "nova_senha": senha
        }
    )

    assert resposta.status_code == 422
    assert senha not in resposta.text


def test_validacao_preserva_contrato_da_api():
    resposta = client.post(
        "/api/auth/login",
        json={}
    )

    assert resposta.status_code == 422
    assert isinstance(resposta.json()["detail"], list)
    assert all(
        "msg" in erro
        for erro in resposta.json()["detail"]
    )
