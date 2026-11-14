"""Testes isolados do bloqueio de conta. Nao tocam no banco real."""
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException
from usuarios.routes import login, LoginRequest, registrar_tentativa_falha_login

DADOS=LoginRequest(email='candidato@example.com',password='SenhaErrada123')

@pytest.mark.parametrize('antes,esperado',[(0,1),(3,4),(4,5),(5,5)])
def test_contabilizar_tentativa_e_bloqueio(antes, esperado):
    con=MagicMock(); cur=con.cursor.return_value
    cur.fetchone.return_value=(antes,)
    registrar_tentativa_falha_login(cur,con,42)
    sql,params=cur.execute.call_args.args
    assert 'UPDATE usuarios' in sql
    assert params==(esperado,esperado,42)
    con.commit.assert_called_once()

def test_senha_errada_persiste_contador():
    con=MagicMock();cur=con.cursor.return_value
    cur.fetchone.side_effect=[(42,'hash','Candidato',1,None,0),(4,)]
    with patch('usuarios.routes.conectar',return_value=con),patch('usuarios.routes.password_hash.verify',return_value=False):
        with pytest.raises(HTTPException) as erro:login(DADOS)
    assert erro.value.status_code==401
    assert con.commit.call_count==1
    sql,params=cur.execute.call_args.args
    assert params==(5,5,42)

def test_login_correto_limpa_bloqueio_e_tentativas():
    con=MagicMock();cur=con.cursor.return_value
    cur.fetchone.side_effect=[(42,'hash','Candidato',1,None,0),('Candidato Teste',)]
    with patch('usuarios.routes.conectar',return_value=con),patch('usuarios.routes.password_hash.verify',return_value=True),patch('usuarios.routes.criar_token_acesso',return_value='token'):
        assert login(DADOS)['access_token']=='token'
    sql,params=cur.execute.call_args.args
    assert 'bloqueado_ate = NULL' in sql
    assert params==(42,)
    con.commit.assert_called_once()

def test_conta_ja_bloqueada_nao_consulta_senha():
    con=MagicMock();cur=con.cursor.return_value
    cur.fetchone.return_value=(42,'hash','Candidato',1,None,1)
    with patch('usuarios.routes.conectar',return_value=con),patch('usuarios.routes.password_hash.verify') as verify:
        with pytest.raises(HTTPException) as erro:login(DADOS)
    assert erro.value.status_code==401
    verify.assert_not_called()
    con.commit.assert_not_called()
