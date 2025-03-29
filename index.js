const express = require('express');
const sharp = require('sharp');

const app = express();
// Ajuste o limite conforme necessário para suas imagens base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- Função de Processamento com Ruído Manual (Estilo Original) ---
async function processImageWithManualNoise(base64, options = {}) {
    // Define valores padrão
    const defaultOptions = {
        forceResize: true,
        manualNoiseAmount: 10,
        blurSigma: 0.6,
        varyQuality: true,
        baseJpegQuality: 85,
        modulateColor: true,
        posterizeLevels: 24,     // <--- Será usado com .posterize() agora
        medianFilterSize: 0,
        targetFormat: 'jpeg'
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

    // 4. Posterização (Reduz gradientes suaves) - CORRIGIDO
    if (config.posterizeLevels > 1) {
        console.log(`Aplicando posterize (levels: ${config.posterizeLevels})...`);
        imageProcessor = imageProcessor.posterize(config.posterizeLevels); // <--- CORREÇÃO AQUI (posterize com 'z')
    }

    // 5. Filtro Mediana (Suaviza ruído/detalhes finos de forma diferente do blur)
    if (config.medianFilterSize > 0 && config.medianFilterSize % 2 !== 0) {
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
            const bufferAntesDoRuido = await imageProcessor.removeAlpha().jpeg().toBuffer();
            const { data, info } = await sharp(bufferAntesDoRuido)
                .raw()
                .toBuffer({ resolveWithObject: true });

            if (info.channels !== 3) {
                 console.warn(`Aviso: Esperava 3 canais (RGB) para ruído manual, mas obteve ${info.channels}.`);
            }

            const noiseRange = config.manualNoiseAmount * 2;
            for (let i = 0; i < data.length; i++) {
                const noise = Math.random() * noiseRange - config.manualNoiseAmount;
                data[i] = Math.min(255, Math.max(0, data[i] + noise));
            }

            bufferParaFormatoFinal = await sharp(data, {
                raw: {
                    width: info.width,
                    height: info.height,
                    channels: info.channels
                }
            });

        } catch (noiseError) {
            console.error("Erro ao aplicar ruído manual, continuando sem ele:", noiseError);
            bufferParaFormatoFinal = imageProcessor;
        }
    } else {
        bufferParaFormatoFinal = imageProcessor;
    }

    // --- PASSO FINAL: Formatação e Remoção de Metadados ---
    let outputOptions = {};
    let finalMimeType = 'image/jpeg';
    let finalExtension = 'jpg';

    if (Buffer.isBuffer(bufferParaFormatoFinal)) {
        bufferParaFormatoFinal = sharp(bufferParaFormatoFinal);
        console.warn("Recriando objeto sharp inesperadamente antes da formatação final.");
    } else if (typeof bufferParaFormatoFinal.jpeg !== 'function') {
         console.error("Erro crítico: objeto inválido antes da formatação final. Usando imagem original processada sem ruído.");
         bufferParaFormatoFinal = imageProcessor;
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
        .withMetadata({ density: 72 })
        .toBuffer();

    console.log('Processamento concluído.');
    return { buffer: finalBuffer, mimeType: finalMimeType, extension: finalExtension };
}

// --- Endpoints ---

// 🔹 Endpoint que retorna BASE64
app.post('/process-base64', async (req, res) => {
    try {
        const { base64, options } = req.body;
        if (!base64) return res.status(400).json({ error: 'Imagem (base64) não fornecida.' });
        const { buffer } = await processImageWithManualNoise(base64, options);
        const processedBase64 = buffer.toString('base64');
        res.json({ processedBase64 });
    } catch (err) {
        console.error('Erro ao processar imagem (base64):', err.message, err.stack);
        res.status(500).json({ error: err.message || 'Erro interno ao processar imagem' });
    }
});

// 🔹 Endpoint que retorna BINÁRIO
app.post('/process-binary', async (req, res) => {
    try {
        const { base64, options } = req.body;
        if (!base64) return res.status(400).send('Imagem (base64) não fornecida.');
        const { buffer, mimeType, extension } = await processImageWithManualNoise(base64, options);
        const filename = `imagem-processada-${Date.now()}.${extension}`;
        res.set('Content-Type', mimeType);
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (err) {
        console.error('Erro ao processar imagem (binário):', err.message, err.stack);
        res.status(500).send(err.message || 'Erro interno ao processar imagem');
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Processador de Imagens Anti-Zuck v6.1 (Manual Noise - Fix Posterize) rodando na porta ${port}`));
