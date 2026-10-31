from fastapi import APIRouter, HTTPException
from pwdlib import PasswordHash
import mysql.connector

from database.connection import conectar
from .schemas import UsuarioCadastro


router = APIRouter(
    prefix="/usuarios",
    tags=["Usuários"]
)

password_hash = PasswordHash.recommended()


@router.get("/teste")
def teste_usuarios():
    return {
        "mensagem": "Rotas de usuários funcionando!"
    }


@router.post("/cadastro", status_code=201)
def cadastrar_usuario(dados: UsuarioCadastro):

    conexao = conectar()
    cursor = conexao.cursor()

    try:
        # Verifica se o e-mail já está cadastrado
        cursor.execute(
            "SELECT id_usuario FROM usuarios WHERE email = %s",
            (dados.email,)
        )

        usuario_existente = cursor.fetchone()

        if usuario_existente:
            raise HTTPException(
                status_code=409,
                detail="Este e-mail já está cadastrado."
            )

        # Criptografa a senha
        senha_criptografada = password_hash.hash(dados.senha)

        # Insere o usuário no banco
        cursor.execute(
            """
            INSERT INTO usuarios (email, senha_hash, tipo_usuario)
            VALUES (%s, %s, %s)
            """,
            (
                dados.email,
                senha_criptografada,
                dados.tipo_usuario
            )
        )

        conexao.commit()

        return {
            "mensagem": "Usuário cadastrado com sucesso!",
            "id_usuario": cursor.lastrowid,
            "email": dados.email,
            "tipo_usuario": dados.tipo_usuario
        }

    except mysql.connector.Error:
        conexao.rollback()

        raise HTTPException(
            status_code=500,
            detail="Erro ao cadastrar usuário no banco de dados."
        )

    finally:
        cursor.close()
        conexao.close()