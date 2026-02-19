const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true para el puerto 465
  auth: {
    user: "aguerop47@gmail.com",
    pass: "dywcncqshpaleulz" // Probá poniéndolas todas juntas sin espacios
  },
  tls: {
    rejectUnauthorized: false // Esto evita problemas si hay algún firewall en tu PC/Red
  }
});

// Esto te va a confirmar en la terminal si funcionó
transporter.verify((error, success) => {
    if (error) {
        console.log("❌ Sigue fallando:", error);
    } else {
        console.log("✅ ¡VICKA TURISMO ESTÁ LISTO PARA MANDAR MAILS!");
    }
});



module.exports = transporter;

