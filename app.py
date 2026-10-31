from fastapi import FastAPI

from database.connection import conectar
from usuarios.routes import router as usuarios_router


app = FastAPI(
    title="EasyIntern",
    description="Backend da plataforma EasyIntern",
    version="1.0.0"
)


# Registro das rotas de usuários
app.include_router(usuarios_router)


# Rota inicial
@app.get("/")
def inicio():
    return {
        "mensagem": "EasyIntern - Backend funcionando!"
    }


# Teste de conexão com o banco de dados
@app.get("/teste-banco")
def teste_banco():
    conexao = conectar()
    conexao.close()

    return {
        "mensagem": "Conexão com o banco realizada com sucesso!"
    }