"""M-14, M-22, AUTH-05: testes locais com mocks, sem acesso MySQL real."""
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from mysql.connector import IntegrityError

from dashboard.routes import candidatar_a_vaga, NovaCandidatura
from usuarios.schemas import EmpresaCadastro
from seguranca.cnpj import validar_cnpj


CANDIDATO = {'tipo_usuario': 'Candidato', 'ativo': 1, 'deletado_em': None}
VAGA = {'id_vaga': 9, 'titulo': 'Estagio Python', 'status': 'Aberta', 'prazo_encerramento': None}

def executar(respostas, *, usuario='17', vaga=9):
    conn=MagicMock()
    cur=conn.cursor.return_value
    cur.fetchone.side_effect = respostas
    with patch('dashboard.routes.conectar', return_value=conn):
        if isinstance(vaga, str):
            # Pydantic valida via schema, tal como ocorre no HTTP.
            dado=NovaCandidatura(id_vaga=vaga)
        else:
            dado=NovaCandidatura(id_vaga=vaga)
        try:
            result=candidatar_a_vaga(dados=dado, token={'sub':usuario})
            return conn, cur, result, None
        except HTTPException as erro:
            return conn, cur, None, erro


def test_m22_candidatura_valida_faz_commit():
    conn, cur, result, erro = executar([CANDIDATO, {'id_candidato':6}, VAGA, {'disponivel':1}, None])
    assert erro is None
    assert result['id_vaga']==9
    assert result['status']=='Pendente'
    conn.commit.assert_called_once()
    assert any('INSERT INTO candidaturas' in c.args[0] for c in cur.execute.call_args_list)
    assert cur.execute.call_args.args[1] == (6,9)

@pytest.mark.parametrize('case,respostas,codigo',[
  ('inexistente_usuario',[None],401),
  ('conta_inativa',[{**CANDIDATO,'ativo':0}],401),
  ('usuario_empresa',[{**CANDIDATO,'tipo_usuario':'Empresa'}],403),
  ('perfil_ausente',[CANDIDATO,None],404),
  ('vaga_ausente',[CANDIDATO,{'id_candidato':6},None],404),
  ('vaga_expirada',[CANDIDATO,{'id_candidato':6},VAGA,{'disponivel':0}],409),
  ('vaga_duplicada',[CANDIDATO,{'id_candidato':6},VAGA,{'disponivel':1},{'id_candidatura':10}],409),
])
def test_m22_falhas_impedem_insercao(case,respostas,codigo):
    conn,cur,result,erro=executar(respostas)
    assert result is None,case
    assert erro.status_code==codigo,case
    conn.commit.assert_not_called()
    conn.rollback.assert_called_once()
    assert not any('INSERT INTO candidaturas' in c.args[0] for c in cur.execute.call_args_list)


def test_m22_conflito_sql_rollback():
    conn=MagicMock(); cur=conn.cursor.return_value
    cur.fetchone.side_effect=[CANDIDATO,{'id_candidato':6},VAGA,{'disponivel':1},None]
    def exec_sql(sql,params=None):
        if 'INSERT INTO candidaturas' in sql:
            raise IntegrityError(msg='duplicado',errno=1062)
    cur.execute.side_effect=exec_sql
    with patch('dashboard.routes.conectar',return_value=conn):
        with pytest.raises(HTTPException) as exc:
            candidatar_a_vaga(NovaCandidatura(id_vaga=9),token={'sub':'17'})
    assert exc.value.status_code==409
    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()


def test_m22_id_invalido_nao_chega_ao_banco():
    with pytest.raises(ValidationError):
        NovaCandidatura(id_vaga=0)
    with pytest.raises(ValidationError):
        NovaCandidatura(id_vaga=-2)


def test_m14_status_entrevista_classe_diferente():
    js=Path('static/js/dashboard.js').read_text(encoding='utf-8-sig')
    css=Path('static/css/dashboard.css').read_text(encoding='utf-8-sig')
    bloco=js[js.index('function statusBadge('):js.index('function modalidadePill(',js.index('function statusBadge('))]
    assert "'status-entrevista'" in bloco
    assert ".status-entrevista" in css
    assert '.dash-body[data-theme="dark"] .status-entrevista' in css


def test_auth05_cnpj_valido_e_invalido():
    # CNPJ de exemplo matematicamente valido usado na documentacao.
    assert validar_cnpj('11.222.333/0001-81')
    assert not validar_cnpj('11.222.333/0001-82')
    assert not validar_cnpj('00.000.000/0000-00')


def test_auth05_cnpj_schema_rejeita_digito_invalido():
    with pytest.raises(ValidationError):
        EmpresaCadastro(razao_social='Empresa Teste',cnpj='11.222.333/0001-82',
            email='teste@example.com',password='Senha1234')
