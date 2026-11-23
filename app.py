from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from database.connection import conectar
from usuarios.routes import router as usuarios_router
from dados.routes import router as dados_router
from dashboard.routes import router as dashboard_router
from dashboard.empresa_routes import router as empresa_router

from dashboard.formacoes_routes import router as formacoes_router


BASE_DIR = Path(__file__).resolve().parent


app = FastAPI(
    title="EasyIntern",
    description="Backend da plataforma EasyIntern",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None
)


# Arquivos estáticos: CSS, JavaScript e imagens
app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "static")),
    name="static"
)


# Arquivos HTML localizados na raiz do projeto
templates = Jinja2Templates(
    directory=str(BASE_DIR)
)


# Rotas da API
app.include_router(usuarios_router)
app.include_router(dados_router)
app.include_router(dashboard_router)
app.include_router(empresa_router)

app.include_router(formacoes_router)

@app.get("/")
def inicio():
    return {
        "mensagem": "EasyIntern - Backend funcionando!"
    }


@app.get("/auth", response_class=HTMLResponse)
def pagina_autenticacao(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="auth.html"
    )


@app.get("/dashboard/candidato", response_class=HTMLResponse)
def pagina_dashboard_candidato(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="candidato_dashboard.html"
    )


@app.get("/dashboard/empresa", response_class=HTMLResponse)
def pagina_dashboard_empresa(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="recrutador_painel.html"
    )


@app.get("/teste-banco")
def teste_banco():
    conexao = conectar()
    conexao.close()

    return {
        "mensagem": "Conexão com o banco realizada com sucesso!"
    }