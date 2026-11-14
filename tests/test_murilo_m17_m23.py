"""Regressoes de score nulo x zero e vinculo de formacao por ID."""
from decimal import Decimal
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException
from usuarios.schemas import CandidatoCadastro
from usuarios.routes import cadastrar_candidato
from dashboard.routes import estatisticas_candidato, listar_candidaturas_candidato

TOKEN = {'sub':'17'}
ATIVO = {'id_usuario':17,'tipo_usuario':'Candidato','ativo':1,'deletado_em':None}


def banco_cadastro(formacao):
    db = MagicMock()
    cur = db.cursor.return_value
    cur.fetchone.side_effect = [None, formacao]
    cur.lastrowid = 10
    return db, cur


def candidato(**kwargs):
    dados = {'nome_completo':'Candidato Teste','email':'teste.cadastro.id@example.com',
             'nivel':'estagiario','password':'Senha123A','id_formacao':3}
    dados.update(kwargs)
    return CandidatoCadastro(**dados)


def test_m23_busca_por_id_nao_por_nome():
    db, cur = banco_cadastro((3,))
    with patch('usuarios.routes.conectar', return_value=db), \
         patch('usuarios.routes.password_hash.hash', return_value='hash'), \
         patch('usuarios.routes.gerar_resposta_login', return_value={'ok':True}):
        assert cadastrar_candidato(candidato()) == {'ok':True}
    sql = cur.execute.call_args_list[1].args
    assert 'WHERE id_formacao = %s' in sql[0]
    assert sql[1] == (3,)
    db.commit.assert_called_once()


def test_m23_id_inexistente_nao_cria_conta():
    db, cur = banco_cadastro(None)
    with patch('usuarios.routes.conectar', return_value=db):
        with pytest.raises(HTTPException) as e:
            cadastrar_candidato(candidato(id_formacao=999))
    assert e.value.status_code == 422
    db.rollback.assert_called_once()


def test_m23_id_negativo_rejeitado_pydantic():
    with pytest.raises(Exception):
        candidato(id_formacao=-1)


def test_m17_media_sem_ia_e_nula():
    db=MagicMock(); cur=db.cursor.return_value
    cur.fetchone.side_effect=[ATIVO,{'id_candidato':6,'nome_completo':'Teste',
        'nivel_carreira':'Estagiário','cidade':None,'uf':None,'linkedin_url':None,
        'github_url':None,'area_interesse':None},
        {'total_candidaturas':0,'aprovadas':0,'em_analise':0},
        {'score_medio':None}]
    with patch('dashboard.routes.conectar',return_value=db):
        resultado=estatisticas_candidato(token=TOKEN)
    assert resultado['taxa_match'] is None
    assert 'AVG(ia.match_score)' in cur.execute.call_args.args[0]


def test_m17_media_score_zero_e_zero():
    db=MagicMock(); cur=db.cursor.return_value
    cur.fetchone.side_effect=[ATIVO,{'id_candidato':6,'nome_completo':'Teste',
        'nivel_carreira':'Estagiário','cidade':None,'uf':None,'linkedin_url':None,
        'github_url':None,'area_interesse':None},
        {'total_candidaturas':1,'aprovadas':0,'em_analise':0},
        {'score_medio':Decimal('0.00')}]
    with patch('dashboard.routes.conectar',return_value=db):
        resultado=estatisticas_candidato(token=TOKEN)
    assert resultado['taxa_match'] == 0.0


def test_m17_lista_match_sem_avaliacao_e_nulo():
    db=MagicMock(); cur=db.cursor.return_value
    cur.fetchone.side_effect=[ATIVO,{'id_candidato':6}]
    cur.fetchall.return_value=[{'id':1,'status':'Pendente','created_at':None,
      'vaga_titulo':'Estagio','empresa_nome':'Empresa','modalidade':'Remoto',
      'cidade':'SP','estado':'SP','match_score':None,'veredito_ia':None}]
    with patch('dashboard.routes.conectar',return_value=db):
        resp=listar_candidaturas_candidato(token=TOKEN,situacao=None,data_inicio=None,
             data_fim=None,pagina=1,limite=20)
    assert resp[0]['match']['avaliado'] is False
    assert resp[0]['match']['score'] is None


def test_m17_lista_score_real_zero_valido():
    db=MagicMock(); cur=db.cursor.return_value
    cur.fetchone.side_effect=[ATIVO,{'id_candidato':6}]
    cur.fetchall.return_value=[{'id':1,'status':'Pendente','created_at':None,
      'vaga_titulo':'Estagio','empresa_nome':'Empresa','modalidade':'Remoto',
      'cidade':'SP','estado':'SP','match_score':Decimal('0'),'veredito_ia':'Teste'}]
    with patch('dashboard.routes.conectar',return_value=db):
        resp=listar_candidaturas_candidato(token=TOKEN,situacao=None,data_inicio=None,
             data_fim=None,pagina=1,limite=20)
    assert resp[0]['match']['avaliado'] is True
    assert resp[0]['match']['score'] == 0.0
