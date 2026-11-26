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
-- Dumping data for table `catalogo_formacoes`
--

INSERT INTO `catalogo_formacoes` (`id_formacao`, `eixo_area`, `tipo`, `nome_curso`) VALUES (1,'Informação e Comunicação','Técnico','Técnico em Desenvolvimento de Sistemas'),(2,'Informação e Comunicação','Técnico','Técnico em Informática'),(3,'Informação e Comunicação','Bacharelado','Bacharelado em Ciência da Computação'),(4,'Informação e Comunicação','Bacharelado','Bacharelado em Sistemas de Informação'),(5,'Informação e Comunicação','Tecnólogo','Tecnólogo em Análise e Desenvolvimento de Sistemas'),(6,'Gestão e Negócios','Técnico','Técnico em Administração');

--
-- Dumping data for table `tags_conhecimento`
--

INSERT INTO `tags_conhecimento` (`id_tag`, `nome`, `categoria`) VALUES (1,'Python','Hard Skill'),(2,'JavaScript','Hard Skill'),(3,'React','Hard Skill'),(4,'FastAPI','Hard Skill'),(5,'MySQL','Hard Skill'),(6,'Git','Hard Skill'),(7,'HTML e CSS','Hard Skill'),(8,'Comunicação','Soft Skill'),(9,'Trabalho em Equipe','Soft Skill'),(10,'Proatividade','Soft Skill'),(11,'Inglês Intermediário','Idioma');
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-25 23:56:36
