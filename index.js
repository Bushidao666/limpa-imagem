const express = require('express');
const sharp = require('sharp');

const app = express();
// Ajuste o limite conforme necessário para suas imagens base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- Função de Processamento com Ruído Manual (Estilo Original) ---
async function processImageWithManualNoise(base64, options = {}) {
    // Define valores padrão - REMOVIDO noiseSigma, ADICIONADO manualNoiseAmount
    const defaultOptions = {
        forceResize: true,         // LIGADO por padrão
        // noiseSigma: 10.0,       // REMOVIDO
        manualNoiseAmount: 10,     // Intensidade do ruído manual (0 = desligado, experimente 5-20)
        blurSigma: 0.6,            // Desfoque sutil por padrão
        varyQuality: true,         // LIGADO por padrão
        baseJpegQuality: 85,       // Qualidade base padrão
        modulateColor: true,       // LIGADO por padrão (variação sutil)
        posterizeLevels: 24,       // Posterização leve/média por padrão
        medianFilterSize: 0,       // DESLIGADO por padrão (use 3 para ativar sutilmente)
        targetFormat: 'jpeg'       // Formato padrão
    };

    // Mescla as opções fornecidas com os padrões
    const config = { ...defaultOptions, ...options };

    if (!base64) {
        throw new Error('Imagem (base64) não fornecida.');
    }

    const inputBuffer = Buffer.from(base64, 'base64');
    let imageProcessor = sharp(inputBuffer);
    const originalMetadata = await imageProcessor.metadata();

    console.log(`Iniciando processamento com config:`, config);

    // --- Aplica Efeitos ANTES do Ruído Manual ---

    // 1. Forçar Reamostragem via Redimensionamento Mínimo
    if (config.forceResize && originalMetadata.width && originalMetadata.height) {
        console.log('Aplicando resize...');
        const tempWidth = Math.max(10, Math.floor(originalMetadata.width * 0.995));
        const tempHeight = Math.max(10, Math.floor(originalMetadata.height * 0.995));
        imageProcessor = imageProcessor.resize(tempWidth, tempHeight, { fit: 'inside' });
        imageProcessor = imageProcessor.resize(originalMetadata.width, originalMetadata.height);
    }

    // 2. Adicionar Desfoque Gaussiano Sutil
    if (config.blurSigma > 0) {
        console.log(`Aplicando blur (sigma: ${config.blurSigma})...`);
        imageProcessor = imageProcessor.blur(config.blurSigma);
    }

    // 3. Leve Modulação Aleatória de Cor (Brilho/Saturação)
    if (config.modulateColor) {
        console.log('Aplicando modulate...');
        const brightnessFactor = 1 + (Math.random() * 0.02 - 0.01); // +/- 1%
        const saturationFactor = 1 + (Math.random() * 0.02 - 0.01); // +/- 1%
        imageProcessor = imageProcessor.modulate({
            brightness: brightnessFactor,
            saturation: saturationFactor,
        });
    }

    // 4. Posterização (Reduz gradientes suaves)
    if (config.posterizeLevels > 1) {
        console.log(`Aplicando posterize (levels: ${config.posterizeLevels})...`);
        imageProcessor = imageProcessor.posterise(config.posterizeLevels);
    }

    // 5. Filtro Mediana (Suaviza ruído/detalhes finos de forma diferente do blur)
    if (config.medianFilterSize > 0 && config.medianFilterSize % 2 !== 0) { // Precisa ser ímpar >= 3
        console.log(`Aplicando median filter (size: ${config.medianFilterSize})...`);
        imageProcessor = imageProcessor.median(config.medianFilterSize);
    } else if (config.medianFilterSize > 0) {
         console.warn(`Median filter size (${config.medianFilterSize}) inválido. Usando 0 (desligado). Deve ser ímpar >= 3.`);
    }

    // --- PASSO CRÍTICO: Aplica Ruído Manual (se habilitado) ---
    let bufferParaFormatoFinal;

    if (config.manualNoiseAmount > 0) {
        console.log(`Aplicando ruído manual (amount: ${config.manualNoiseAmount})...`);
        try {
            // Pega o buffer *depois* dos efeitos anteriores, força para RGB (sem alpha)
            const bufferAntesDoRuido = await imageProcessor.removeAlpha().jpeg().toBuffer(); // Garante formato consistente antes do raw

            // Extrai dados raw RGB
            const { data, info } = await sharp(bufferAntesDoRuido)
                .raw()
                .toBuffer({ resolveWithObject: true });

            if (info.channels !== 3) {
                 console.warn(`Aviso: Esperava 3 canais (RGB) para ruído manual, mas obteve ${info.channels}. O ruído pode não funcionar como esperado.`);
                 // Mesmo assim, tenta aplicar o ruído byte a byte
            }

            // Aplica o ruído manualmente, byte a byte
            const noiseRange = config.manualNoiseAmount * 2; // Ex: amount 10 -> range 20
            for (let i = 0; i < data.length; i++) {
                const noise = Math.random() * noiseRange - config.manualNoiseAmount; // Ex: -10 a +10
                data[i] = Math.min(255, Math.max(0, data[i] + noise));
            }

            // Cria um NOVO objeto sharp com os dados modificados
            // É crucial usar as 'info' corretas obtidas do .raw()
            bufferParaFormatoFinal = await sharp(data, {
                raw: {
                    width: info.width,
                    height: info.height,
                    channels: info.channels // Usa os canais corretos (provavelmente 3)
                }
            });

        } catch (noiseError) {
            console.error("Erro ao aplicar ruído manual, continuando sem ele:", noiseError);
            // Se der erro no ruído, usa o processador de imagem como estava antes
            bufferParaFormatoFinal = imageProcessor;
        }
    } else {
        // Se não houver ruído manual, usa o processador como está
        bufferParaFormatoFinal = imageProcessor;
    }

    // --- PASSO FINAL: Formatação e Remoção de Metadados ---
    let outputOptions = {};
    let finalMimeType = 'image/jpeg';
    let finalExtension = 'jpg';

    // Garante que bufferParaFormatoFinal seja um objeto sharp
    if (Buffer.isBuffer(bufferParaFormatoFinal)) {
        // Se algo deu errado e virou buffer, tenta recriar o sharp object
        bufferParaFormatoFinal = sharp(bufferParaFormatoFinal);
        console.warn("Recriando objeto sharp inesperadamente antes da formatação final.");
    } else if (typeof bufferParaFormatoFinal.jpeg !== 'function') {
        // Se não for um objeto sharp válido, loga erro e usa o original
         console.error("Erro crítico: objeto inválido antes da formatação final. Usando imagem original processada sem ruído.");
         bufferParaFormatoFinal = imageProcessor; // Fallback seguro
    }


    if (config.targetFormat === 'jpeg') {
        let finalQuality = config.baseJpegQuality;
        if (config.varyQuality) {
            finalQuality = Math.floor(config.baseJpegQuality - 5 + Math.random() * 11);
            finalQuality = Math.max(70, Math.min(95, finalQuality));
        }
        console.log(`Convertendo para JPEG (quality: ${finalQuality})...`);
        outputOptions = { quality: finalQuality, mozjpeg: true };
        bufferParaFormatoFinal = bufferParaFormatoFinal.jpeg(outputOptions);
        finalMimeType = 'image/jpeg';
        finalExtension = 'jpg';
    } else if (config.targetFormat === 'png') {
        console.log('Convertendo para PNG...');
        outputOptions = { compressionLevel: 9 };
        bufferParaFormatoFinal = bufferParaFormatoFinal.png(outputOptions);
        finalMimeType = 'image/png';
        finalExtension = 'png';
    } else {
        console.warn(`Formato de saída '${config.targetFormat}' não suportado, usando JPEG.`);
        bufferParaFormatoFinal = bufferParaFormatoFinal.jpeg({ quality: config.baseJpegQuality, mozjpeg: true });
    }

    console.log('Removendo metadados...');
    const finalBuffer = await bufferParaFormatoFinal
        .withMetadata({ density: 72 }) // Remove tudo e define DPI
        .toBuffer();

    console.log('Processamento concluído.');
    return { buffer: finalBuffer, mimeType: finalMimeType, extension: finalExtension };
}

// --- Endpoints (sem alterações na lógica deles, apenas chamam a nova função) ---

// 🔹 Endpoint que retorna BASE64
app.post('/process-base64', async (req, res) => {
    try {
        const { base64, options } = req.body;
        if (!base64) return res.status(400).json({ error: 'Imagem (base64) não fornecida.' });

        // Chama a função de processamento (usará padrões se options não for enviado)
        const { buffer } = await processImageWithManualNoise(base64, options);
        const processedBase64 = buffer.toString('base64');
        res.json({ processedBase64 });

    } catch (err) {
        console.error('Erro ao processar imagem (base64):', err.message, err.stack); // Adicionado stack trace
        res.status(500).json({ error: err.message || 'Erro interno ao processar imagem' });
    }
});

// 🔹 Endpoint que retorna BINÁRIO
app.post('/process-binary', async (req, res) => {
    try {
        const { base64, options } = req.body;
        if (!base64) return res.status(400).send('Imagem (base64) não fornecida.');

        // Chama a função de processamento (usará padrões se options não for enviado)
        const { buffer, mimeType, extension } = await processImageWithManualNoise(base64, options);

        const filename = `imagem-processada-${Date.now()}.${extension}`; // Nome de arquivo único

        res.set('Content-Type', mimeType);
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);

    } catch (err) {
        console.error('Erro ao processar imagem (binário):', err.message, err.stack); // Adicionado stack trace
        res.status(500).send(err.message || 'Erro interno ao processar imagem');
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Processador de Imagens Anti-Zuck v6 (Manual Noise) rodando na porta ${port}`));
