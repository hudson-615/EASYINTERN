import ollama
import mysql.connector
from mysql.connector import Error
import json
import re

# ============================================================
# 1. CONEXÃO COM O BANCO DE DADOS (Usando usuário restrito)
# ============================================================
def conectar_banco():
    try:
        return mysql.connector.connect(
            host='localhost',
            database='eazyintern',
            user='eazy_app',                   # Segurança em camadas!
            password='EazyIntern@2025!Forte'   # Senha do eazy_app
        )
    except Error as e:
        print(f"❌ Erro de conexão com o banco: {e}")
        return None

# ============================================================
# 2. COLETAR DADOS DO CANDIDATO E DA VAGA
# ============================================================
def montar_perfil_candidato(id_candidato):
    conn = conectar_banco()
    if not conn: return ""
    
    texto = ""
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Dados básicos e biografia
        cursor.execute("""
            SELECT nome_completo, biografia, cidade, uf, nivel_carreira 
            FROM candidatos WHERE id_candidato = %s
        """, (id_candidato,))
        cand = cursor.fetchone()
        if cand:
            texto += f"=== PERFIL DO CANDIDATO ===\n"
            texto += f"Nome: {cand['nome_completo']}\n"
            texto += f"Nível: {cand['nivel_carreira']}\n"
            texto += f"Local: {cand['cidade']} - {cand['uf']}\n"
            texto += f"Biografia: {cand['biografia']}\n"
            
        # Habilidades (Usando GROUP_CONCAT para juntar tudo numa linha)
        cursor.execute("""
            SELECT GROUP_CONCAT(CONCAT(t.nome, ' (', ct.nivel, ')') SEPARATOR ', ') AS skills
            FROM candidato_tags ct
            JOIN tags_conhecimento t ON ct.id_tag = t.id_tag
            WHERE ct.id_candidato = %s
        """, (id_candidato,))
        skills = cursor.fetchone()
        texto += f"Habilidades: {skills['skills'] if skills['skills'] else 'Nenhuma cadastrada'}\n\n"
        
        return texto
    except Error as e:
        print(f"Erro ao buscar candidato: {e}")
        return ""
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

def montar_perfil_vaga(id_vaga):
    conn = conectar_banco()
    if not conn: return ""
    
    texto = ""
    try:
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT titulo, descricao, modalidade, bolsa 
            FROM vagas WHERE id_vaga = %s
        """, (id_vaga,))
        vaga = cursor.fetchone()
        if vaga:
            texto += f"=== VAGA ===\n"
            texto += f"Título: {vaga['titulo']}\n"
            texto += f"Modalidade: {vaga['modalidade']}\n"
            texto += f"Bolsa: R$ {vaga['bolsa']}\n"
            texto += f"Descrição: {vaga['descricao']}\n"
            
        cursor.execute("""
            SELECT GROUP_CONCAT(CONCAT(t.nome, IF(vt.obrigatorio, ' (Obrigatório)', ' (Desejável)')) SEPARATOR ', ') AS reqs
            FROM vaga_tags vt
            JOIN tags_conhecimento t ON vt.id_tag = t.id_tag
            WHERE vt.id_vaga = %s
        """, (id_vaga,))
        reqs = cursor.fetchone()
        texto += f"Requisitos: {reqs['reqs'] if reqs['reqs'] else 'Nenhum cadastrado'}\n\n"
        
        return texto
    except Error as e:
        print(f"Erro ao buscar vaga: {e}")
        return ""
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ============================================================
# 3. CHAMAR O LLaMA (A Mágica da IA acontece aqui)
# ============================================================
def analisar_com_llama(perfil_candidato, perfil_vaga):
    prompt = f"""
    Você é o assistente de RH do Eazyintern, especializado em recrutamento de estagiários.
    Sua tarefa é analisar a compatibilidade entre o candidato e a vaga abaixo.
    
    REGRAS ESTRITAS:
    1. Retorne APENAS um objeto JSON válido, sem textos antes ou depois.
    2. O JSON deve ter exatamente estas chaves: "match_score", "pontos_fortes", "pontos_atencao", "veredito".
    3. "match_score" deve ser um número inteiro de 0 a 100.
    4. Os textos de "pontos_fortes" e "pontos_atencao" devem ser strings simples.
    
    {perfil_candidato}
    {perfil_vaga}
    
    Gere o JSON agora:
    """
    
    print("⏳ O LLaMA está processando a análise (isso pode levar de 5 a 15 segundos)...")
    try:
        resposta = ollama.chat(
            model='llama3.2:3b',
            messages=[{'role': 'user', 'content': prompt}],
            options={'temperature': 0.1} 
        )
        return resposta['message']['content']
    except Exception as e:
        print(f"❌ Erro na IA (O Ollama está rodando?): {e}")
        return None

# ============================================================
# 4. EXTRAIR O JSON E SALVAR NO BANCO (Blindado contra erros)
# ============================================================
def salvar_avaliacao_no_banco(id_candidatura, texto_gerado_ia):
    # Regex para garantir que pegamos apenas o JSON
    match = re.search(r'\{.*\}', texto_gerado_ia, re.DOTALL)
    if not match:
        print("❌ A IA não retornou um JSON válido. Retorno bruto:", texto_gerado_ia)
        return
        
    try:
        dados = json.loads(match.group(0))
        score = int(dados.get('match_score', 0))
        
        # --- TRATAMENTO À PROVA DE FALHAS ---
        # Se a IA devolver lista, transformamos em texto JSON (garante compatibilidade com MySQL)
        def garantir_texto(valor):
            if isinstance(valor, (list, dict)):
                return json.dumps(valor, ensure_ascii=False)
            return str(valor) if valor is not None else ""

        pontos_fortes = garantir_texto(dados.get('pontos_fortes', ''))
        pontos_atencao = garantir_texto(dados.get('pontos_atencao', ''))
        veredito = garantir_texto(dados.get('veredito', ''))
        
        conn = conectar_banco()
        cursor = conn.cursor()
        
        query = """
            INSERT INTO avaliacoes_ia (id_candidatura, match_score, pontos_fortes, pontos_atencao, veredito_ia, versao_modelo)
            VALUES (%s, %s, %s, %s, %s, 'llama3.2:3b')
            ON DUPLICATE KEY UPDATE 
                match_score = VALUES(match_score),
                pontos_fortes = VALUES(pontos_fortes),
                pontos_atencao = VALUES(pontos_atencao),
                veredito_ia = VALUES(veredito_ia),
                data_analise = CURRENT_TIMESTAMP
        """
        cursor.execute(query, (id_candidatura, score, pontos_fortes, pontos_atencao, veredito))
        conn.commit()
        
        print(f"✅ Análise da Candidatura {id_candidatura} salva! Score: {score}%")
        
    except json.JSONDecodeError:
        print("❌ Falha ao converter a resposta em JSON.")
    except Error as e:
        print(f"❌ Erro ao salvar no banco: {e}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

# ============================================================
# 5. EXECUÇÃO PRINCIPAL (Para testar)
# ============================================================
if __name__ == "__main__":
    print("🤖 Iniciando Motor de IA do Eazyintern...")
    
    # ATENÇÃO: Confirme esses IDs no seu banco de dados!
    ID_CANDIDATO = 3    # Bryan Evans
    ID_VAGA = 2         # Vaga Backend Python
    ID_CANDIDATURA = 3  # ID da tabela candidaturas
    
    perfil_cand = montar_perfil_candidato(ID_CANDIDATO)
    perfil_vag = montar_perfil_vaga(ID_VAGA)
    
    if perfil_cand and perfil_vag:
        resposta_ia = analisar_com_llama(perfil_cand, perfil_vag)
        if resposta_ia:
            print("\n🤖 Resposta Bruta da IA:")
            print(resposta_ia)
            print("-" * 50)
            salvar_avaliacao_no_banco(ID_CANDIDATURA, resposta_ia)
    else:
        print("❌ Faltam dados de perfil ou vaga para analisar. Verifique os IDs.")