# Holding Radar

Holding Radar é um scanner educacional de investimentos desenvolvido para analisar ações brasileiras e fundos imobiliários com critérios objetivos de qualidade, preço, renda, crescimento e risco.

O projeto nasceu para resolver um problema comum: investidores encontram muitas listas prontas de "melhores ativos", mas poucas ferramentas explicam, com transparência, por que um ativo parece interessante, caro, arriscado ou incompleto. O Holding Radar não recomenda compra ou venda. Ele organiza dados públicos, calcula pontuações e apresenta uma análise fundamentalista em linguagem clara.

**Demonstração:** [holding-radar-client-1x22.vercel.app](https://holding-radar-client-1x22.vercel.app)

## O Que O App Faz

- Varre um universo amplo e configurável de ações brasileiras e FIIs.
- Busca dados reais em provedores externos, sem inventar indicadores financeiros.
- Remove do ranking ativos com dados insuficientes.
- Classifica oportunidades por qualidade, valuation, renda, crescimento e risco.
- Separa ações, FIIs, foco em renda, foco em crescimento, ativos excelentes mas caros e ativos baratos mas arriscados.
- Mostra status de atualização, dados em cache, dados defasados e tickers com falha.
- Gera análise educacional com IA sob demanda, apenas para ativos com dados válidos.

## Diferencial

O Holding Radar não tenta ser uma "dica de investimento". A proposta é mais profissional: transformar dados financeiros dispersos em uma leitura estruturada, auditável e educativa.

Para ações, o scanner combina indicadores de qualidade, múltiplos, dividendos, crescimento e risco. Para FIIs, a análise considera pontos específicos do setor, como tipo do fundo, P/VP, renda, patrimônio, base de investidores, sinais de risco e diferenças entre fundos de papel, tijolo, híbridos, FoFs e desenvolvimento.

Quando uma informação não está disponível nas fontes estruturadas, o app deixa isso claro em vez de preencher lacunas com suposições.

## Fontes De Dados

O projeto usa uma arquitetura preparada para múltiplos provedores:

- **Brapi:** cotações, estatísticas, fundamentos e indicadores disponíveis por ativo.
- **CVM Dados Abertos:** informes mensais de FIIs, patrimônio, valor patrimonial por cota, cotistas, rendimentos e composição agregada.
- **Banco Central SGS:** contexto macroeconômico, como Selic, CDI e IPCA.
- **OpenAI:** análise educacional sob demanda, com regras de compliance para evitar recomendação personalizada.

O universo estático armazena somente tickers reais. Preços, múltiplos, dividendos e demais indicadores vêm das fontes externas.

## Como O Ranking Funciona

Cada ativo recebe notas parciais e uma pontuação final de 0 a 100.

As dimensões avaliadas são:

- **Qualidade:** solidez dos fundamentos disponíveis.
- **Preço:** atratividade relativa de valuation.
- **Renda:** dividendos ou rendimentos, sem ranquear apenas por yield.
- **Crescimento:** aplicável principalmente a ações.
- **Risco:** penaliza fragilidade, baixa liquidez, desconto excessivo sem qualidade ou dados incompletos.

Os ativos podem receber rótulos como:

- Oportunidade interessante
- Atrativo com cautela
- Excelente, mas caro
- Barato, mas arriscado
- Fora dos filtros

Esses rótulos são analíticos e educacionais. Eles não significam recomendação de compra, venda ou manutenção.

## IA Com Responsabilidade

A IA não escolhe ativos para o usuário e não roda durante a varredura do mercado. Ela entra apenas quando o usuário seleciona um ativo válido e pede uma análise educacional.

O prompt da análise exige:

- linguagem em português;
- separação entre dado confirmado e dado ausente;
- explicação dos fatores de qualidade, preço, renda, crescimento e risco;
- aprofundamento específico para FIIs;
- ausência de promessas de retorno;
- ausência de recomendação personalizada.

## Arquitetura Técnica

Holding Radar é um projeto full-stack em TypeScript.

**Frontend**

- React
- Vite
- TypeScript
- Tailwind CSS
- Recharts
- React Router

**Backend**

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- Integração com OpenAI
- Cache persistente e cache em memória

## O Que Este Projeto Demonstra

Este repositório foi construído como um projeto de portfolio com foco em produto real, não apenas em tela bonita.

Ele demonstra:

- modelagem de domínio financeiro;
- integração com APIs externas sujeitas a limite, atraso e dados incompletos;
- estratégia de cache e atualização assíncrona;
- backend com rotas REST organizadas;
- frontend responsivo com estados de carregamento, erro e dados parciais;
- uso de IA com controles de segurança e compliance;
- cuidado para não inventar dados nem emitir recomendações financeiras personalizadas.

## Limitações Assumidas

O app depende da cobertura e estabilidade das fontes externas. Alguns ativos podem ficar fora do ranking quando campos mínimos não estão disponíveis. Dados podem ter atraso, divergência entre provedores ou ficar temporariamente em cache quando uma API falha.

Essa limitação é tratada como parte do produto: o Holding Radar mostra dados insuficientes, falhas e defasagem em vez de esconder o problema.

## Disclaimer

Este app tem fins exclusivamente educacionais e não fornece recomendações personalizadas de investimento. As análises são baseadas em dados disponíveis nas fontes integradas e podem conter limitações de cobertura, atraso ou campos ausentes.
