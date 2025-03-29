const express = require('express');
const sharp = require('sharp');
const app = express();

// Aumentar o limite para arquivos grandes
app.use(express.json({ limit: '50mb' }));

// Função robusta para processamento que usa apenas métodos básicos e confiáveis do Sharp
async function processarImagem(inputBuffer) {
  console.log('[PROCESSO] Iniciando processamento da imagem');
  
  try {
    // Primeiro passo: converter para JPEG para normalizar o formato
    console.log('[PROCESSO] Convertendo para JPEG inicial');
    let processedImage = sharp(inputBuffer);
    
    // Coletar metadados para diagnóstico, sem causar falha se não conseguir
    try {
      const metadata = await processedImage.metadata();
      console.log(`[INFO] Formato original: ${metadata.format}, Dimensões: ${metadata.width}x${metadata.height}`);
    } catch (e) {
      console.log('[AVISO] Não foi possível ler metadados, continuando mesmo assim');
    }
    
    // ETAPA 1: Remover e zerar todos os metadados
    console.log('[PROCESSO] Removendo metadados');
    // Método 1: Converter para JPEG simples (já remove a maioria dos metadados)
    let bufferSemMetadados = await processedImage
      .jpeg({ quality: 90 })
      .toBuffer();
    
    // ETAPA 2: Aplicar transformações para quebrar padrões de IA
    console.log('[PROCESSO] Aplicando transformações anti-detecção');
    // Reiniciar com o buffer limpo
    processedImage = sharp(bufferSemMetadados);
    
    // Aplicar leve blur para suavizar padrões de IA (método confiável)
    console.log('[PROCESSO] Aplicando blur');
    processedImage = processedImage.blur(0.5);
    
    // Aplicar sharpening para compensar o blur e simular câmera (método confiável)
    console.log('[PROCESSO] Aplicando sharpening');
    processedImage = processedImage.sharpen();
    
    // Aplicar ajustes de cor sutis (método confiável)
    console.log('[PROCESSO] Aplicando ajustes de cor');
    const brilho = 1 + (Math.random() * 0.06 - 0.03); // ±3%
    const saturacao = 1 + (Math.random() * 0.1 - 0.05); // ±5%
    processedImage = processedImage.modulate({
      brightness: brilho,
      saturation: saturacao
    });
    
    // Aplicar leve rotação para quebrar padrões (método confiável)
    console.log('[PROCESSO] Aplicando rotação');
    const rotacao = Math.random() * 0.6 - 0.3; // ±0.3 graus
    processedImage = processedImage.rotate(rotacao, {
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    });
    
    // ETAPA 3: Simular ruído/grain usando método convolve (alternativa ao noise)
    console.log('[PROCESSO] Aplicando ruído com convolve');
    // Kernel de convolução que adiciona textura de grain
    processedImage = processedImage.convolve({
      width: 3,
      height: 3,
      kernel: [
        0.1, 0.1, 0.1,
        0.1, 1.0, 0.1,
        0.1, 0.1, 0.1
      ]
    });
    
    // ETAPA 4: Re-processar com JPEG com qualidade específica 
    // para remover quaisquer metadados remanescentes
    console.log('[PROCESSO] Finalizando com compressão JPEG');
    const finalBuffer = await processedImage
      .jpeg({
        quality: 85,
        chromaSubsampling: '4:2:0', // Formato comum de câmeras
        force: true
      })
      .toBuffer();
    
    // ETAPA 5: Verificar se temos um buffer válido
    if (!finalBuffer || finalBuffer.length === 0) {
      throw new Error('Buffer final inválido ou vazio');
    }
    
    console.log(`[SUCESSO] Processamento concluído. Tamanho final: ${finalBuffer.length} bytes`);
    return finalBuffer;
  } catch (error) {
    // Registra detalhes completos do erro para diagnóstico
    console.error('[ERRO] Falha no processamento: ', error);
    throw new Error(`Falha no processamento da imagem: ${error.message}`);
  }
}

// Função simples e direta para decodificar base64
function decodificarBase64(base64String) {
  // Validação preventiva
  if (!base64String) {
    throw new Error('String base64 vazia ou não fornecida');
  }
  
  console.log('[PROCESSO] Decodificando Base64');
  try {
    // Remover cabeçalho data URI se presente
    let base64Data = base64String;
    const dataUriRegex = /^data:image\/[a-zA-Z0-9+]+;base64,/;
    
    if (dataUriRegex.test(base64String)) {
      console.log('[INFO] Detectado Data URI, removendo prefixo');
      base64Data = base64String.split(',')[1];
    } else if (base64String.includes('base64,')) {
      console.log('[INFO] Detectado prefixo base64, removendo');
      base64Data = base64String.split('base64,')[1];
    }
    
    // Remover caracteres inválidos
    base64Data = base64Data.replace(/[\r\n\t\f\v ]/g, '');
    
    // Validar formato base64 (verifica se possui apenas caracteres válidos)
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      console.warn('[AVISO] Base64 contém caracteres inválidos, tentando limpar');
      base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');
    }
    
    // Decodificar para buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Verificar se o resultado é válido
    if (buffer.length === 0) {
      throw new Error('Decodificação resultou em buffer vazio');
    }
    
    console.log(`[SUCESSO] Base64 decodificado. Tamanho: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error('[ERRO] Falha na decodificação base64:', error);
    throw new Error(`Falha ao decodificar Base64: ${error.message}`);
  }
}

// Endpoint para retornar imagem como base64
app.post('/clean-image', async (req, res) => {
  console.log('[API] Recebida solicitação em /clean-image');
  
  try {
    const { base64 } = req.body;
    
    if (!base64) {
      console.error('[ERRO] Requisição sem o campo base64');
      return res.status(400).json({ 
        error: 'Imagem não fornecida. Envie um JSON com o campo "base64".'
      });
    }
    
    console.log('[API] Decodificando base64 da requisição');
    let inputBuffer;
    try {
      // Uso direto, sem await (função não é assíncrona)
      inputBuffer = decodificarBase64(base64);
    } catch (error) {
      console.error('[ERRO] Falha na decodificação:', error);
      return res.status(400).json({ 
        error: `Base64 inválido: ${error.message}`
      });
    }
    
    console.log('[API] Iniciando processamento da imagem');
    try {
      const finalBuffer = await processarImagem(inputBuffer);
      const cleanedBase64 = finalBuffer.toString('base64');
      
      console.log('[API] Retornando resultado como base64');
      return res.json({ cleanedBase64 });
    } catch (err) {
      console.error('[ERRO] Falha no processamento:', err);
      return res.status(500).json({ 
        error: `Erro ao processar imagem: ${err.message}`
      });
    }
  } catch (err) {
    console.error('[ERRO] Erro geral no endpoint:', err);
    return res.status(500).json({ 
      error: `Erro interno do servidor: ${err.message}`
    });
  }
});

// Endpoint para retornar imagem como arquivo binário
app.post('/clean-image-binary', async (req, res) => {
  console.log('[API] Recebida solicitação em /clean-image-binary');
  
  try {
    const { base64 } = req.body;
    
    if (!base64) {
      console.error('[ERRO] Requisição sem o campo base64');
      return res.status(400).send('Imagem não fornecida. Envie um JSON com o campo "base64".');
    }
    
    console.log('[API] Decodificando base64 da requisição');
    let inputBuffer;
    try {
      // Uso direto, sem await (função não é assíncrona)
      inputBuffer = decodificarBase64(base64);
    } catch (error) {
      console.error('[ERRO] Falha na decodificação:', error);
      return res.status(400).send(`Base64 inválido: ${error.message}`);
    }
    
    console.log('[API] Iniciando processamento da imagem');
    try {
      const finalBuffer = await processarImagem(inputBuffer);
      
      console.log('[API] Retornando resultado como binário');
      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Disposition', 'attachment; filename="imagem-purificada.jpg"');
      return res.send(finalBuffer);
    } catch (err) {
      console.error('[ERRO] Falha no processamento:', err);
      return res.status(500).send(`Erro ao processar imagem: ${err.message}`);
    }
  } catch (err) {
    console.error('[ERRO] Erro geral no endpoint:', err);
    return res.status(500).send(`Erro interno do servidor: ${err.message}`);
  }
});

// Endpoint de diagnóstico robusto
app.post('/diagnose', async (req, res) => {
  console.log('[API] Recebida solicitação de diagnóstico');
  
  try {
    const { base64 } = req.body;
    
    if (!base64) {
      console.error('[ERRO] Requisição sem o campo base64');
      return res.status(400).json({ error: 'Imagem não fornecida' });
    }
    
    // Análise passo a passo para diagnóstico detalhado
    const diagnostico = {
      passos: [],
      erros: [],
      resultado: 'falha', // padrão pessimista
      detalhes: {}
    };
    
    // Passo 1: Tentar decodificar base64
    try {
      diagnostico.passos.push('Iniciando decodificação base64');
      const inputBuffer = decodificarBase64(base64);
      diagnostico.passos.push(`Base64 decodificado: ${inputBuffer.length} bytes`);
      diagnostico.detalhes.tamanhoBuffer = inputBuffer.length;
      
      // Passo 2: Tentar ler metadados
      try {
        diagnostico.passos.push('Lendo metadados');
        const metadata = await sharp(inputBuffer).metadata();
        diagnostico.passos.push('Metadados lidos com sucesso');
        diagnostico.detalhes.metadata = {
          formato: metadata.format,
          largura: metadata.width,
          altura: metadata.height,
          canais: metadata.channels,
          temAlpha: metadata.hasAlpha
        };
        
        // Passo 3: Tentar processar (opcional, sem falhar tudo)
        try {
          diagnostico.passos.push('Tentando processamento básico');
          await sharp(inputBuffer).jpeg().toBuffer();
          diagnostico.passos.push('Processamento básico bem-sucedido');
          
          // Se chegou até aqui, está tudo ok
          diagnostico.resultado = 'sucesso';
        } catch (processError) {
          diagnostico.erros.push(`Erro no processamento: ${processError.message}`);
          // Continua mesmo com erro no processamento
        }
      } catch (metadataError) {
        diagnostico.erros.push(`Erro ao ler metadados: ${metadataError.message}`);
      }
    } catch (decodeError) {
      diagnostico.erros.push(`Erro na decodificação: ${decodeError.message}`);
    }
    
    // Retorno detalhado
    return res.json({
      status: diagnostico.resultado,
      passos: diagnostico.passos,
      erros: diagnostico.erros,
      detalhes: diagnostico.detalhes
    });
  } catch (err) {
    console.error('[ERRO] Erro geral no diagnóstico:', err);
    return res.status(500).json({ 
      error: `Erro durante diagnóstico: ${err.message}` 
    });
  }
});

// Adicionar rota para verificar se o serviço está funcionando
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    versao: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 Anti-Detector de IA rodando na porta ${port}`);
  console.log(`📋 Endpoints disponíveis:`);
  console.log(`   - POST /clean-image (retorna base64)`);
  console.log(`   - POST /clean-image-binary (retorna arquivo)`);
  console.log(`   - POST /diagnose (verifica imagem)`);
  console.log(`   - GET /status (verifica servidor)`);
});
