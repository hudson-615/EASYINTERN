from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from mysql.connector import Error, IntegrityError

from database.connection import conectar
from seguranca.token import criar_token_acesso, verificar_token
from .schemas import (
    LoginRequest,
    CandidatoCadastro,
    EmpresaCadastro,
)


router = APIRouter(
    prefix="/api/auth",
    tags=["Autenticação"]
)

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)


def obter_usuario_autenticado(
    credenciais: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)
):
    if credenciais is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return verificar_token(credenciais.credentials)


def gerar_resposta_login(id_usuario: int, nome: str, tipo: str):
    tipo_frontend = tipo.lower()

    token = criar_token_acesso({
        "sub": str(id_usuario),
        "tipo_usuario": tipo_frontend
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "nome": nome,
        "tipo_usuario": tipo_frontend
    }


@router.post("/register/candidato", status_code=status.HTTP_201_CREATED)
def cadastrar_candidato(dados: CandidatoCadastro):
    conexao = None
    cursor = None

    try:
        conexao = conectar()
        cursor = conexao.cursor()

        email = str(dados.email).lower()

        # Verifica se o e-mail já existe.
        cursor.execute(
            """
            SELECT id_usuario
            FROM usuarios
            WHERE email = %s
            """,
            (email,)
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este e-mail já está cadastrado."
            )

        # Se uma formação foi informada, ela precisa existir no catálogo.
        id_formacao = None

        if dados.area_interesse:
            cursor.execute(
                """
                SELECT id_formacao
                FROM catalogo_formacoes
                WHERE nome_curso = %s
                """,
                (dados.area_interesse,)
            )

            formacao = cursor.fetchone()

            if not formacao:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A formação selecionada não está disponível no catálogo."
                )

            id_formacao = formacao[0]

        senha_criptografada = password_hash.hash(dados.password)

        # Cria a conta de usuário.
        cursor.execute(
            """
            INSERT INTO usuarios (email, senha_hash, tipo_usuario)
            VALUES (%s, %s, 'Candidato')
            """,
            (email, senha_criptografada)
        )

        id_usuario = cursor.lastrowid

        nivel_carreira = {
            "estagiario": "Estagiário",
            "junior": "Júnior"
        }[dados.nivel]

        # Cria o perfil do candidato.
        cursor.execute(
            """
            INSERT INTO candidatos (
                id_usuario,
                nome_completo,
                nivel_carreira
            )
            VALUES (%s, %s, %s)
            """,
            (
                id_usuario,
                dados.nome_completo,
                nivel_carreira
            )
        )

        id_candidato = cursor.lastrowid

        # Cria o vínculo com a formação selecionada.
        if id_formacao is not None:
            cursor.execute(
                """
                INSERT INTO candidato_formacao (
                    id_candidato,
                    id_formacao
                )
                VALUES (%s, %s)
                """,
                (id_candidato, id_formacao)
            )

        conexao.commit()

        return gerar_resposta_login(
            id_usuario,
            dados.nome_completo,
            "Candidato"
        )

    except HTTPException:
        if conexao:
            conexao.rollback()
        raise

    except IntegrityError:
        if conexao:
            conexao.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível cadastrar. Verifique se o e-mail ou outro dado já está em uso."
        )

    except Error:
        if conexao:
            conexao.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao cadastrar candidato no banco de dados."
        )

    finally:
        if cursor:
            cursor.close()

        if conexao:
            conexao.close()


@router.post("/register/empresa", status_code=status.HTTP_201_CREATED)
def cadastrar_empresa(dados: EmpresaCadastro):
    conexao = None
    cursor = None

    try:
        conexao = conectar()
        cursor = conexao.cursor()

        email = str(dados.email).lower()

        cursor.execute(
            """
            SELECT id_usuario
            FROM usuarios
            WHERE email = %s
            """,
            (email,)
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este e-mail já está cadastrado."
            )

        senha_criptografada = password_hash.hash(dados.password)

        cursor.execute(
            """
            INSERT INTO usuarios (email, senha_hash, tipo_usuario)
            VALUES (%s, %s, 'Empresa')
            """,
            (email, senha_criptografada)
        )

        id_usuario = cursor.lastrowid

        cursor.execute(
            """
            INSERT INTO empresas (
                id_usuario,
                razao_social,
                nome_fantasia,
                cnpj,
                setor
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                id_usuario,
                dados.razao_social,
                dados.nome_fantasia,
                dados.cnpj,
                dados.setor
            )
        )

        conexao.commit()

        return gerar_resposta_login(
            id_usuario,
            dados.nome_fantasia or dados.razao_social,
            "Empresa"
        )

    except HTTPException:
        if conexao:
            conexao.rollback()
        raise

    except IntegrityError:
        if conexao:
            conexao.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível cadastrar. Verifique se o e-mail ou CNPJ já está em uso."
        )

    except Error:
        if conexao:
            conexao.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao cadastrar empresa no banco de dados."
        )

    finally:
        if cursor:
            cursor.close()

        if conexao:
            conexao.close()


@router.post("/login")
def login(dados: LoginRequest):
    conexao = None
    cursor = None

    try:
        conexao = conectar()
        cursor = conexao.cursor()

        email = str(dados.email).lower()

        cursor.execute(
            """
            SELECT
                id_usuario,
                senha_hash,
                tipo_usuario,
                ativo,
                deletado_em,
                (bloqueado_ate IS NOT NULL AND bloqueado_ate > NOW()) AS bloqueado
            FROM usuarios
            WHERE email = %s
            """,
            (email,)
        )

        usuario = cursor.fetchone()

        # A mesma mensagem evita revelar se um e-mail existe.
        mensagem_erro = "E-mail ou senha incorretos."

        if not usuario:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=mensagem_erro
            )

        (
            id_usuario,
            senha_armazenada,
            tipo_usuario,
            ativo,
            deletado_em,
            bloqueado
        ) = usuario

        if not ativo or deletado_em is not None or bloqueado:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=mensagem_erro
            )

        try:
            senha_correta = password_hash.verify(
                dados.password,
                senha_armazenada
            )
        except Exception:
            senha_correta = False

        if not senha_correta:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=mensagem_erro
            )

        if tipo_usuario == "Candidato":
            cursor.execute(
                """
                SELECT nome_completo
                FROM candidatos
                WHERE id_usuario = %s
                """,
                (id_usuario,)
            )
        else:
            cursor.execute(
                """
                SELECT COALESCE(nome_fantasia, razao_social)
                FROM empresas
                WHERE id_usuario = %s
                """,
                (id_usuario,)
            )

        perfil = cursor.fetchone()

        if not perfil:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="O perfil deste usuário não foi encontrado."
            )

        nome = perfil[0]

        cursor.execute(
            """
            UPDATE usuarios
            SET ultimo_login_em = CURRENT_TIMESTAMP,
                tentativas_login = 0
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        conexao.commit()

        return gerar_resposta_login(
            id_usuario,
            nome,
            tipo_usuario
        )

    except HTTPException:
        if conexao:
            conexao.rollback()
        raise

    except Error:
        if conexao:
            conexao.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao realizar login."
        )

    finally:
        if cursor:
            cursor.close()

        if conexao:
            conexao.close()


@router.get("/me")
def usuario_atual(
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        id_usuario = int(token["sub"])

        conexao = conectar()
        cursor = conexao.cursor()

        cursor.execute(
            """
            SELECT tipo_usuario, ativo, deletado_em
            FROM usuarios
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        usuario = cursor.fetchone()

        if not usuario:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuário não encontrado."
            )

        tipo_usuario, ativo, deletado_em = usuario

        if not ativo or deletado_em is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Esta conta não está disponível."
            )

        if tipo_usuario == "Candidato":
            cursor.execute(
                """
                SELECT nome_completo
                FROM candidatos
                WHERE id_usuario = %s
                """,
                (id_usuario,)
            )
        else:
            cursor.execute(
                """
                SELECT COALESCE(nome_fantasia, razao_social)
                FROM empresas
                WHERE id_usuario = %s
                """,
                (id_usuario,)
            )

        perfil = cursor.fetchone()

        if not perfil:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil não encontrado."
            )

        return {
            "nome": perfil[0],
            "tipo": tipo_usuario.lower()
        }

    except HTTPException:
        raise

    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificação de usuário inválida."
        )

    except Error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao consultar usuário."
        )

    finally:
        if cursor:
            cursor.close()

        if conexao:
            conexao.close()
