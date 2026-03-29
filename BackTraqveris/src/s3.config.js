const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Inicializar el cliente S3 (v3)
// En AWS/Railway las credenciales se toman por defecto del entorno si tienen los nombres estandar:
// AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET
const s3Config = new S3Client({
    region: process.env.AWS_REGION || 'sa-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

// Helper para crear un "uploader" por cada carpeta en el Bucket (ej. 'recibos/', 'clientes/')
const createS3Uploader = (folderName) => {
    // Si no estamos en Producción (y no hay variables de AWS), fallback a almacenamiento local
    // (Opcional: Si quieres forzar S3 siempre localmente también, asegúrate de tener el .env activo)
    const isProductionContext = process.env.NODE_ENV === 'production' && process.env.AWS_S3_BUCKET;

    if (isProductionContext) {
        return multer({
            storage: multerS3({
                s3: s3Config,
                bucket: process.env.AWS_S3_BUCKET,
                contentType: multerS3.AUTO_CONTENT_TYPE,
                // acl: 'public-read', // Dependiendo si tu bucket es público o no. Si es privado, usar getSignedUrl
                key: function (req, file, cb) {
                    const ext = path.extname(file.originalname);
                    const filename = `${folderName}/${uuidv4()}${ext}`;
                    cb(null, filename);
                }
            })
        });
    } else {
        // Fallback local para desarrollo si no hay AWS credentials configuradas
        console.warn(`[Multer-S3] AWS_S3_BUCKET no configurado. Utilizando fallback local en carpeta /uploads`);
        return multer({
            storage: multer.diskStorage({
                destination: (req, file, cb) => {
                    const fs = require('fs');
                    const uploadDir = path.join(__dirname, '../uploads');
                    if (!fs.existsSync(uploadDir)){
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    cb(null, uploadDir);
                },
                filename: (req, file, cb) => {
                    cb(null, uuidv4() + path.extname(file.originalname));
                }
            })
        });
    }
};

module.exports = { s3Config, createS3Uploader };
