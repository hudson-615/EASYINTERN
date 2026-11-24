from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException
from dashboard.empresa_routes import editar_perfil_empresa, EdicaoPerfilEmpresa

DADOS = EdicaoPerfilEmpresa(nome_fantasia="FiofoTech Atualizada", setor="Tecnologia", cidade="São Paulo", uf="sp", descricao="Descrição de teste")

def executar(empresa):
    conn=MagicMock()
    cur=MagicMock()
    conn.cursor.return_value=cur
    cur.fetchone.return_value=empresa
    with patch("dashboard.empresa_routes.conectar", return_value=conn):
        try:
            resultado=editar_perfil_empresa(DADOS, token={"sub":"18"})
            return resultado, conn, cur
        except HTTPException as exc:
            return exc, conn, cur

def test_p2_perfil_proprio():
    result,conn,cur=executar({"tipo_usuario":"Empresa", "ativo":1, "deletado_em":None, "id_empresa":5})
    assert result["mensagem"] == "Perfil empresarial atualizado com sucesso."
    assert cur.execute.call_count == 2
    sql, params=cur.execute.call_args.args
    assert "id_empresa=%s AND id_usuario=%s" in sql
    assert params[-2:] == (5,18)
    conn.commit.assert_called_once()

def test_p2_perfil_candidato_nao_pode_editar():
    result,conn,cur=executar({"tipo_usuario":"Candidato", "ativo":1, "deletado_em":None, "id_empresa":None})
    assert result.status_code == 403
    conn.commit.assert_not_called()

def test_p2_perfil_inativo_nao_pode_editar():
    result,conn,cur=executar({"tipo_usuario":"Empresa", "ativo":0, "deletado_em":None, "id_empresa":5})
    assert result.status_code == 401
    conn.commit.assert_not_called()

def test_p2_perfil_valida_uf():
    assert DADOS.uf == "SP"
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        EdicaoPerfilEmpresa(nome_fantasia="Empresa", uf="São Paulo")
