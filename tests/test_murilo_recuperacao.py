from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException
from usuarios import recuperacao_routes as mod

CONFIG = ({'SMTP_HOST': 'smtp.example.com', 'SMTP_PORT': '587', 'SMTP_USER': 'test',
           'SMTP_PASSWORD': 'abc', 'SMTP_FROM': 'noreply@example.com',
           'PUBLIC_BASE_URL': 'https://example.com'}, 587, 'https://example.com')


def conn(responses):
    c = MagicMock()
    c.cursor.return_value.fetchone.side_effect = responses
    c.cursor.return_value.rowcount = 1
    return c


def test_hash_token_nao_e_token_original():
    token = 'a' * 40
    assert mod._hash_token(token) != token
    assert len(mod._hash_token(token)) == 64


def test_recuperacao_ausente_retorna_mensagem_generica():
    c = conn([None])
    with patch.object(mod, '_config_email', return_value=CONFIG), patch.object(mod, 'conectar', return_value=c), patch.object(mod, '_enviar_email') as enviar:
        resposta = mod.recuperar_senha(mod.PedidoRecuperacao(email='inexistente@example.com'))
    assert resposta['mensagem'] == mod.RESPOSTA_GENERICA
    enviar.assert_not_called()


def test_recuperacao_usuario_existente_grava_hash_e_envia():
    c = conn([(5,)])
    with patch.object(mod, '_config_email', return_value=CONFIG), patch.object(mod, 'conectar', return_value=c), patch.object(mod, '_enviar_email') as enviar:
        resposta = mod.recuperar_senha(mod.PedidoRecuperacao(email='teste@example.com'))
    assert resposta['mensagem'] == mod.RESPOSTA_GENERICA
    assert enviar.call_count == 1
    token = enviar.call_args.args[1]
    assert c.cursor.return_value.execute.call_args_list[1].args[1][0] == mod._hash_token(token)
    assert c.commit.call_count == 1


def test_validacao_token_expirado():
    c = conn([None])
    with patch.object(mod, 'conectar', return_value=c):
        assert mod.validar_token_recuperacao('x'*43) == {'valido': False}


def test_redefinir_token_invalido():
    c = conn([None])
    with patch.object(mod, 'conectar', return_value=c):
        with pytest.raises(HTTPException) as exc:
            mod.redefinir_senha(mod.NovaSenha(token='x'*43, nova_senha='NovaSenha123'))
    assert exc.value.status_code == 400
    c.rollback.assert_called_once()


def test_redefinir_valido_usa_hash_e_invalida_token():
    c = conn([(5,)])
    with patch.object(mod, 'conectar', return_value=c), patch.object(mod.password_hash, 'hash', return_value='argon2hash'):
        resposta = mod.redefinir_senha(mod.NovaSenha(token='x'*43, nova_senha='NovaSenha123'))
    assert 'sucesso' in resposta['mensagem']
    assert c.cursor.return_value.execute.call_args_list[1].args[1][0] == 'argon2hash'
    c.commit.assert_called_once()


def test_smtp_ausente_retorna_503(monkeypatch):
    for key in ('SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'PUBLIC_BASE_URL'):
        monkeypatch.delenv(key, raising=False)
    with pytest.raises(HTTPException) as exc:
        mod.recuperar_senha(mod.PedidoRecuperacao(email='teste@example.com'))
    assert exc.value.status_code == 503
