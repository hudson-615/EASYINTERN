-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: eazyintern
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `auditoria`
--

DROP TABLE IF EXISTS `auditoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria` (
  `id_log` bigint NOT NULL AUTO_INCREMENT,
  `id_usuario` int DEFAULT NULL,
  `acao` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tabela` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registro_id` int DEFAULT NULL,
  `ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dados_antes` json DEFAULT NULL,
  `dados_depois` json DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_log`),
  KEY `idx_auditoria_usuario` (`id_usuario`,`criado_em`),
  KEY `idx_auditoria_acao` (`acao`,`criado_em`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `avaliacoes_ia`
--

DROP TABLE IF EXISTS `avaliacoes_ia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `avaliacoes_ia` (
  `id_avaliacao` int NOT NULL AUTO_INCREMENT,
  `id_candidatura` int NOT NULL,
  `match_score` decimal(5,2) NOT NULL,
  `pontos_fortes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `pontos_atencao` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `veredito_ia` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `versao_modelo` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'llama3.2:3b',
  `data_analise` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_avaliacao`),
  UNIQUE KEY `id_candidatura` (`id_candidatura`),
  KEY `idx_avaliacoes_score` (`id_candidatura`,`match_score` DESC),
  CONSTRAINT `avaliacoes_ia_ibfk_1` FOREIGN KEY (`id_candidatura`) REFERENCES `candidaturas` (`id_candidatura`) ON DELETE CASCADE,
  CONSTRAINT `ck_score` CHECK ((`match_score` between 0 and 100))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `candidato_formacao`
--

DROP TABLE IF EXISTS `candidato_formacao`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidato_formacao` (
  `id_candidato` int NOT NULL,
  `id_formacao` int NOT NULL,
  `status` enum('Cursando','Concluído','Trancado') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Cursando',
  `semestre_atual` tinyint DEFAULT NULL,
  `ano_conclusao` year DEFAULT NULL,
  PRIMARY KEY (`id_candidato`,`id_formacao`),
  KEY `id_formacao` (`id_formacao`),
  CONSTRAINT `candidato_formacao_ibfk_1` FOREIGN KEY (`id_candidato`) REFERENCES `candidatos` (`id_candidato`) ON DELETE CASCADE,
  CONSTRAINT `candidato_formacao_ibfk_2` FOREIGN KEY (`id_formacao`) REFERENCES `catalogo_formacoes` (`id_formacao`) ON DELETE CASCADE,
  CONSTRAINT `ck_semestre` CHECK (((`semestre_atual` is null) or (`semestre_atual` between 1 and 12)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `candidato_tags`
--

DROP TABLE IF EXISTS `candidato_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidato_tags` (
  `id_candidato` int NOT NULL,
  `id_tag` int NOT NULL,
  `nivel` enum('Básico','Intermediário','Avançado') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Básico',
  PRIMARY KEY (`id_candidato`,`id_tag`),
  KEY `id_tag` (`id_tag`),
  CONSTRAINT `candidato_tags_ibfk_1` FOREIGN KEY (`id_candidato`) REFERENCES `candidatos` (`id_candidato`) ON DELETE CASCADE,
  CONSTRAINT `candidato_tags_ibfk_2` FOREIGN KEY (`id_tag`) REFERENCES `tags_conhecimento` (`id_tag`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `candidatos`
--

DROP TABLE IF EXISTS `candidatos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidatos` (
  `id_candidato` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `nome_completo` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cpf` varchar(14) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `data_nascimento` date DEFAULT NULL,
  `nivel_carreira` enum('Estagiário','Júnior','Pleno') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Estagiário',
  `telefone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cidade` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uf` char(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linkedin_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `github_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biografia` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `url_curriculo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `modo_escuro` tinyint(1) DEFAULT '0',
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_candidato`),
  UNIQUE KEY `id_usuario` (`id_usuario`),
  UNIQUE KEY `cpf` (`cpf`),
  CONSTRAINT `candidatos_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `candidaturas`
--

DROP TABLE IF EXISTS `candidaturas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidaturas` (
  `id_candidatura` int NOT NULL AUTO_INCREMENT,
  `id_vaga` int NOT NULL,
  `id_candidato` int NOT NULL,
  `mensagem_recrutador` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status` enum('Pendente','Em Análise','Entrevista','Aprovado','Reprovado') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Pendente',
  `data_candidatura` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_candidatura`),
  UNIQUE KEY `uk_cand_vaga` (`id_vaga`,`id_candidato`),
  UNIQUE KEY `uk_candidatura_completa` (`id_candidatura`,`id_candidato`,`id_vaga`),
  KEY `id_candidato` (`id_candidato`),
  CONSTRAINT `candidaturas_ibfk_1` FOREIGN KEY (`id_vaga`) REFERENCES `vagas` (`id_vaga`) ON DELETE CASCADE,
  CONSTRAINT `candidaturas_ibfk_2` FOREIGN KEY (`id_candidato`) REFERENCES `candidatos` (`id_candidato`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `catalogo_formacoes`
--

DROP TABLE IF EXISTS `catalogo_formacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `catalogo_formacoes` (
  `id_formacao` int NOT NULL AUTO_INCREMENT,
  `eixo_area` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('Técnico','Bacharelado','Licenciatura','Tecnólogo') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome_curso` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id_formacao`),
  UNIQUE KEY `uk_formacao` (`nome_curso`,`tipo`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chat_participantes`
--

DROP TABLE IF EXISTS `chat_participantes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_participantes` (
  `id_chat` int NOT NULL,
  `id_usuario` int NOT NULL,
  `ultima_leitura_em` timestamp NULL DEFAULT NULL,
  `entrou_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_chat`,`id_usuario`),
  KEY `idx_participantes_usuario` (`id_usuario`),
  CONSTRAINT `chat_participantes_ibfk_1` FOREIGN KEY (`id_chat`) REFERENCES `chats` (`id_chat`) ON DELETE CASCADE,
  CONSTRAINT `chat_participantes_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chats`
--

DROP TABLE IF EXISTS `chats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chats` (
  `id_chat` int NOT NULL AUTO_INCREMENT,
  `id_candidatura` int NOT NULL,
  `status` enum('Aberto','Bloqueado','Encerrado') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Aberto',
  `expira_em` datetime NOT NULL,
  `bloqueado_em` datetime DEFAULT NULL,
  `motivo_bloqueio` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_chat`),
  UNIQUE KEY `id_candidatura` (`id_candidatura`),
  KEY `idx_chat_expira` (`expira_em`,`status`),
  CONSTRAINT `chats_ibfk_1` FOREIGN KEY (`id_candidatura`) REFERENCES `candidaturas` (`id_candidatura`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `controle_avaliacoes_ia`
--

DROP TABLE IF EXISTS `controle_avaliacoes_ia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `controle_avaliacoes_ia` (
  `id_candidatura` int NOT NULL,
  `tentativas` int unsigned NOT NULL DEFAULT '0',
  `ultima_tentativa` datetime DEFAULT NULL,
  PRIMARY KEY (`id_candidatura`),
  CONSTRAINT `fk_controle_ia_candidatura` FOREIGN KEY (`id_candidatura`) REFERENCES `candidaturas` (`id_candidatura`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `empresas`
--

DROP TABLE IF EXISTS `empresas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `empresas` (
  `id_empresa` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `razao_social` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome_fantasia` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cnpj` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `setor` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cidade` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uf` char(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `descricao` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `url_logo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `cep` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logradouro` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numero` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bairro` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `complemento` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id_empresa`),
  UNIQUE KEY `id_usuario` (`id_usuario`),
  UNIQUE KEY `cnpj` (`cnpj`),
  CONSTRAINT `empresas_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `feedbacks_candidatura`
--

DROP TABLE IF EXISTS `feedbacks_candidatura`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feedbacks_candidatura` (
  `id_candidatura` int NOT NULL,
  `mensagem` varchar(2000) NOT NULL,
  `criado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_candidatura`),
  CONSTRAINT `fk_feedback_candidatura` FOREIGN KEY (`id_candidatura`) REFERENCES `candidaturas` (`id_candidatura`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mensagens`
--

DROP TABLE IF EXISTS `mensagens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mensagens` (
  `id_mensagem` int NOT NULL AUTO_INCREMENT,
  `id_chat` int NOT NULL,
  `id_remetente` int NOT NULL,
  `conteudo` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `tipo` enum('texto','imagem','arquivo','sistema') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'texto',
  `url_anexo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uuid_cliente` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_mensagem_pai` int DEFAULT NULL,
  `enviada_em` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_mensagem`),
  UNIQUE KEY `uuid_cliente` (`uuid_cliente`),
  KEY `id_mensagem_pai` (`id_mensagem_pai`),
  KEY `idx_msg_chat_data` (`id_chat`,`enviada_em` DESC),
  KEY `idx_msg_remetente` (`id_remetente`),
  CONSTRAINT `mensagens_ibfk_1` FOREIGN KEY (`id_chat`) REFERENCES `chats` (`id_chat`) ON DELETE CASCADE,
  CONSTRAINT `mensagens_ibfk_2` FOREIGN KEY (`id_remetente`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE,
  CONSTRAINT `mensagens_ibfk_3` FOREIGN KEY (`id_mensagem_pai`) REFERENCES `mensagens` (`id_mensagem`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notificacoes_ws`
--

DROP TABLE IF EXISTS `notificacoes_ws`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notificacoes_ws` (
  `id_notificacao` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `tipo_evento` enum('NOVA_CANDIDATURA','STATUS_ALTERADO','NOVA_MENSAGEM','ANALISE_IA_PRONTA','VAGA_ENCERRADA') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `referencia_id` int DEFAULT NULL,
  `mensagem` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `enviada` tinyint(1) DEFAULT '0',
  `enviada_em` timestamp NULL DEFAULT NULL,
  `lida` tinyint(1) DEFAULT '0',
  `lida_em` timestamp NULL DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_notificacao`),
  KEY `idx_notif_pendentes` (`id_usuario`,`enviada`,`criado_em` DESC),
  KEY `idx_notif_nao_lidas` (`id_usuario`,`lida`),
  CONSTRAINT `notificacoes_ws_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tags_conhecimento`
--

DROP TABLE IF EXISTS `tags_conhecimento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tags_conhecimento` (
  `id_tag` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoria` enum('Hard Skill','Soft Skill','Idioma') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Hard Skill',
  PRIMARY KEY (`id_tag`),
  UNIQUE KEY `nome` (`nome`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id_usuario` int NOT NULL AUTO_INCREMENT,
  `email` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `senha_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo_usuario` enum('Candidato','Empresa') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `deletado_em` timestamp NULL DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `tentativas_login` tinyint NOT NULL DEFAULT '0',
  `bloqueado_ate` datetime DEFAULT NULL,
  `ultimo_login_em` timestamp NULL DEFAULT NULL,
  `email_verificado` tinyint(1) NOT NULL DEFAULT '0',
  `token_recuperacao` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token_recuperacao_expira` datetime DEFAULT NULL,
  `consentimento_lgpd_em` datetime DEFAULT NULL,
  `anonimizado_em` datetime DEFAULT NULL,
  `versao_sessao` int unsigned NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vaga_tags`
--

DROP TABLE IF EXISTS `vaga_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vaga_tags` (
  `id_vaga` int NOT NULL,
  `id_tag` int NOT NULL,
  `obrigatorio` tinyint(1) DEFAULT '1',
  `peso` tinyint DEFAULT '1',
  PRIMARY KEY (`id_vaga`,`id_tag`),
  KEY `id_tag` (`id_tag`),
  CONSTRAINT `vaga_tags_ibfk_1` FOREIGN KEY (`id_vaga`) REFERENCES `vagas` (`id_vaga`) ON DELETE CASCADE,
  CONSTRAINT `vaga_tags_ibfk_2` FOREIGN KEY (`id_tag`) REFERENCES `tags_conhecimento` (`id_tag`) ON DELETE CASCADE,
  CONSTRAINT `ck_peso` CHECK ((`peso` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vagas`
--

DROP TABLE IF EXISTS `vagas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vagas` (
  `id_vaga` int NOT NULL AUTO_INCREMENT,
  `id_empresa` int NOT NULL,
  `titulo` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `nivel` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Estagiário',
  `descricao` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `requisitos` text COLLATE utf8mb4_unicode_ci,
  `beneficios` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `modalidade` enum('Presencial','Remoto','Híbrido') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Presencial',
  `cidade` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uf` char(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bolsa` decimal(10,2) DEFAULT NULL,
  `prazo_encerramento` date NOT NULL,
  `status` enum('Aberta','Encerrada','Pausada','Cancelada') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Aberta',
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `latitude` decimal(9,6) DEFAULT NULL,
  `longitude` decimal(9,6) DEFAULT NULL,
  `versao_avaliacao` int unsigned NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_vaga`),
  KEY `id_empresa` (`id_empresa`),
  KEY `idx_vagas_localizacao` (`latitude`,`longitude`),
  CONSTRAINT `vagas_ibfk_1` FOREIGN KEY (`id_empresa`) REFERENCES `empresas` (`id_empresa`) ON DELETE CASCADE,
  CONSTRAINT `chk_vagas_coordenadas` CHECK ((((`latitude` is null) and (`longitude` is null)) or ((`latitude` is not null) and (`longitude` is not null) and (`latitude` between -(90) and 90) and (`longitude` between -(180) and 180)))),
  CONSTRAINT `ck_bolsa` CHECK (((`bolsa` is null) or (`bolsa` >= 0)))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `vw_dashboard_candidato`
--

DROP TABLE IF EXISTS `vw_dashboard_candidato`;
/*!50001 DROP VIEW IF EXISTS `vw_dashboard_candidato`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `vw_dashboard_candidato` AS SELECT
 1 AS `id_candidato`,
 1 AS `nome_completo`,
 1 AS `total_candidaturas`,
 1 AS `score_medio`,
 1 AS `total_aprovacoes`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `vw_dashboard_empresa`
--

DROP TABLE IF EXISTS `vw_dashboard_empresa`;
/*!50001 DROP VIEW IF EXISTS `vw_dashboard_empresa`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `vw_dashboard_empresa` AS SELECT
 1 AS `id_empresa`,
 1 AS `nome_fantasia`,
 1 AS `total_vagas`,
 1 AS `vagas_ativas`,
 1 AS `total_candidaturas`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `vw_ranking_ia`
--

DROP TABLE IF EXISTS `vw_ranking_ia`;
/*!50001 DROP VIEW IF EXISTS `vw_ranking_ia`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `vw_ranking_ia` AS SELECT
 1 AS `id_vaga`,
 1 AS `vaga`,
 1 AS `id_candidato`,
 1 AS `candidato`,
 1 AS `match_score`,
 1 AS `veredito_ia`,
 1 AS `status_candidatura`*/;
SET character_set_client = @saved_cs_client;

--
-- Dumping routines for database 'eazyintern'
--

--
-- Final view structure for view `vw_dashboard_candidato`
--

/*!50001 DROP VIEW IF EXISTS `vw_dashboard_candidato`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `vw_dashboard_candidato` AS select `c`.`id_candidato` AS `id_candidato`,`c`.`nome_completo` AS `nome_completo`,count(distinct `ca`.`id_candidatura`) AS `total_candidaturas`,coalesce(round(avg(`a`.`match_score`),2),0) AS `score_medio`,sum((case when (`ca`.`status` = 'Aprovado') then 1 else 0 end)) AS `total_aprovacoes` from ((`candidatos` `c` left join `candidaturas` `ca` on((`c`.`id_candidato` = `ca`.`id_candidato`))) left join `avaliacoes_ia` `a` on((`ca`.`id_candidatura` = `a`.`id_candidatura`))) group by `c`.`id_candidato`,`c`.`nome_completo` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `vw_dashboard_empresa`
--

/*!50001 DROP VIEW IF EXISTS `vw_dashboard_empresa`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `vw_dashboard_empresa` AS select `e`.`id_empresa` AS `id_empresa`,`e`.`nome_fantasia` AS `nome_fantasia`,count(distinct `v`.`id_vaga`) AS `total_vagas`,sum((case when (`v`.`status` = 'Aberta') then 1 else 0 end)) AS `vagas_ativas`,count(distinct `ca`.`id_candidatura`) AS `total_candidaturas` from ((`empresas` `e` left join `vagas` `v` on((`e`.`id_empresa` = `v`.`id_empresa`))) left join `candidaturas` `ca` on((`v`.`id_vaga` = `ca`.`id_vaga`))) group by `e`.`id_empresa`,`e`.`nome_fantasia` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `vw_ranking_ia`
--

/*!50001 DROP VIEW IF EXISTS `vw_ranking_ia`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `vw_ranking_ia` AS select `v`.`id_vaga` AS `id_vaga`,`v`.`titulo` AS `vaga`,`c`.`id_candidato` AS `id_candidato`,`c`.`nome_completo` AS `candidato`,`a`.`match_score` AS `match_score`,`a`.`veredito_ia` AS `veredito_ia`,`ca`.`status` AS `status_candidatura` from (((`avaliacoes_ia` `a` join `candidaturas` `ca` on((`a`.`id_candidatura` = `ca`.`id_candidatura`))) join `candidatos` `c` on((`ca`.`id_candidato` = `c`.`id_candidato`))) join `vagas` `v` on((`ca`.`id_vaga` = `v`.`id_vaga`))) order by `v`.`id_vaga`,`a`.`match_score` desc */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-25 15:25:09
